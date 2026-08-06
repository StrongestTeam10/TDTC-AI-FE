/* ==========================================================================
   스마트 CCTV 이태원 대시보드 - Javascript Module (Optimized & Fixed)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 상태 및 전역 초기값
    let currentMode = 'PREDICTIVE_RAIN'; // 기본 모드: 30분후 비 예보
    let isPlaying = true;
    let currentFrame = 1;
    let totalFrames = 604;
    let lastRenderTime = 0; // 렌더링 스로틀용 타임스탬프
    let lastChartUpdateTime = 0; // 차트 업데이트 스로틀용
    
    // 실시간 WebSocket / API 스트리밍 데이터 수신 인터페이스
    window.latestLivePedestrianCount = null;
    window.pushRealtimePedestrianFrame = function (pedestrianCount, customCriScore = null) {
        window.latestLivePedestrianCount = pedestrianCount;
        if (typeof updateUI === 'function') {
            updateUI(true);
        }
    };

    // EMA 계수 (이동평균)
    let smoothedCRI = 20.0;
    const alphaEMA = 0.2;

    // 모드/기상 오프셋
    let currentWeatherTimeOffset = 0;
    let isInflowSpike = false;

    // 최근 스코어 히스토리 (차트용)
    const maxHistoryLength = 30;
    const historyLabels = Array.from({ length: maxHistoryLength }, (_, i) => `-${maxHistoryLength - 1 - i}s`);
    const historyScores = Array(maxHistoryLength).fill(22);
    const criticalThresholdLine = Array(maxHistoryLength).fill(80); // 80pt 위험 임계선

    // 실시간 튜닝 파라미터
    let evacThreshold = 70.0;
    let alarmDelaySec = 3.0;
    let densityWeightPercent = 40;
    let manualScoreOffset = 0.0;

    // 비상 위험 타이머 상태 변수 (15초 유지 시 서랍/차단, 30초 자동신고)
    let emergencyStartTime = null;
    let isEmergencyConfirmed = false;
    let isAutoDispatched = false;

    // DOM 참조
    const emergencyBackdrop = document.getElementById('emergency-block-backdrop');
    const emergencyTopDrawer = document.getElementById('emergency-top-drawer');
    const emergencyCountdownVal = document.getElementById('emergency-countdown-val');
    const emergencyDrawerMsg = document.getElementById('emergency-drawer-msg');
    const btnConfirmEmergency = document.getElementById('btn-confirm-emergency');

    // 비상 상황 확인 버튼 클릭 처리 (화면 조작 차단 해제)
    window.confirmEmergencyAlert = function () {
        isEmergencyConfirmed = true;
        if (emergencyBackdrop) emergencyBackdrop.classList.remove('active');
        if (emergencyTopDrawer) emergencyTopDrawer.classList.remove('active');
    };

    // DOM 엘리먼트 참조
    const video = document.getElementById('cctv-video');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const timeline = document.getElementById('timeline');
    const frameCounter = document.getElementById('frame-counter');
    const weatherBadge = document.getElementById('weather-badge');
    const dispatchOverlay = document.getElementById('dispatch-alert-overlay');

    // 상단 헤더 요약 엘리먼트
    const headerCriVal = document.getElementById('header-cri-val');
    const headerStatusBadge = document.getElementById('header-status-badge');

    // 우측 파라미터 & 기상 드로어 엘리먼트 참조
    const drawerParams = document.getElementById('drawer-params');
    const drawerWeather = document.getElementById('drawer-weather');
    const drawerBackdrop = document.getElementById('drawer-backdrop');

    // 예측 알람 모달
    const alertModalBackdrop = document.getElementById('alert-log-modal-backdrop');

    // 관제 HUD 상태 표시
    const statusBox = document.getElementById('status-box');
    const statusLabel = document.getElementById('status-label');
    const criScore = document.getElementById('cri-score');
    const progressIndicator = document.getElementById('progress-indicator');

    // 3대 핵심 지표 카드
    const livePersonCount = document.getElementById('live-person-count');
    const liveOccupancyRate = document.getElementById('live-occupancy-rate');
    const liveStoppageTime = document.getElementById('live-stoppage-time');

    // 메인 관제 3단계 기상 예측 타임라인 엘리먼트
    const wtCurrentMain = document.getElementById('wt-current-main');
    const wtCurrentSub = document.getElementById('wt-current-sub');
    const wt30mMain = document.getElementById('wt-30m-main');
    const wt30mSub = document.getElementById('wt-30m-sub');
    const wt60mMain = document.getElementById('wt-60m-main');
    const wt60mSub = document.getElementById('wt-60m-sub');

    // 기상 드로어용 3단계 타임라인 엘리먼트
    const drawerWtCurrentMain = document.getElementById('drawer-wt-current-main');
    const drawerWtCurrentSub = document.getElementById('drawer-wt-current-sub');
    const drawerWt30mMain = document.getElementById('drawer-wt-30m-main');
    const drawerWt30mSub = document.getElementById('drawer-wt-30m-sub');
    const drawerWt60mMain = document.getElementById('drawer-wt-60m-main');
    const drawerWt60mSub = document.getElementById('drawer-wt-60m-sub');

    // 슬라이더 참조
    const sliderEvacLimit = document.getElementById('slider-evac-limit');
    const sliderAlarmDelay = document.getElementById('slider-alarm-delay');
    const sliderDensityWeight = document.getElementById('slider-density-weight');
    const sliderManualOffset = document.getElementById('slider-manual-offset');

    const valEvacLimit = document.getElementById('val-evac-limit');
    const valAlarmDelay = document.getElementById('val-alarm-delay');
    const valDensityWeight = document.getElementById('val-density-weight');
    const valManualOffset = document.getElementById('val-manual-offset');


    // 2. 우측 파라미터 드로어 및 모달 제어 함수
    window.toggleParamDrawer = function () {
        if (drawerParams && drawerParams.classList.contains('open')) {
            window.closeAllDrawers();
        } else {
            window.closeAllDrawers();
            if (drawerParams) drawerParams.classList.add('open');
            if (drawerBackdrop) drawerBackdrop.classList.add('active');
        }
    };

    window.toggleWeatherDrawer = function () {
        if (drawerWeather && drawerWeather.classList.contains('open')) {
            window.closeAllDrawers();
        } else {
            window.closeAllDrawers();
            if (drawerWeather) drawerWeather.classList.add('open');
            if (drawerBackdrop) drawerBackdrop.classList.add('active');
        }
    };

    window.closeAllDrawers = function () {
        if (drawerParams) drawerParams.classList.remove('open');
        if (drawerWeather) drawerWeather.classList.remove('open');
        if (drawerBackdrop) drawerBackdrop.classList.remove('active');
    };

    window.openAlertModal = function () {
        if (alertModalBackdrop) {
            alertModalBackdrop.classList.add('active');
            alertModalBackdrop.style.display = 'flex';
        }
    };

    window.closeAlertModal = function () {
        if (alertModalBackdrop) {
            alertModalBackdrop.classList.remove('active');
            alertModalBackdrop.style.display = 'none';
        }
    };


    // 3. 기상 4단계 슬라이더 및 모드 전환
    const weatherModeSteps = ['SUNNY', 'PREDICTIVE_RAIN', 'RAINY', 'HOT_SUMMER'];
    const weatherModeLabels = ['현재 맑음', '약 30분후 비 예보', '현재 호우 상황', '폭염 경보'];

    const mainWeatherModeSlider = document.getElementById('main-weather-mode-slider');
    const drawerWeatherModeSlider = document.getElementById('drawer-weather-mode-slider');
    const mainWeatherModeLabel = document.getElementById('main-weather-mode-label');
    const drawerWeatherModeLabel = document.getElementById('drawer-weather-mode-label');

    window.setWeatherModeStep = function (stepIndex) {
        stepIndex = parseInt(stepIndex, 10);
        if (isNaN(stepIndex) || stepIndex < 0) stepIndex = 0;
        if (stepIndex > 3) stepIndex = 3;

        const targetMode = weatherModeSteps[stepIndex];
        const modeLabel = weatherModeLabels[stepIndex];

        if (mainWeatherModeSlider) mainWeatherModeSlider.value = stepIndex;
        if (drawerWeatherModeSlider) drawerWeatherModeSlider.value = stepIndex;

        if (mainWeatherModeLabel) mainWeatherModeLabel.innerText = modeLabel;
        if (drawerWeatherModeLabel) drawerWeatherModeLabel.innerText = modeLabel;

        document.querySelectorAll('.weather-mode-marks').forEach(marksContainer => {
            const spans = marksContainer.querySelectorAll('span');
            spans.forEach((span, idx) => {
                if (idx === stepIndex) span.classList.add('active-mark');
                else span.classList.remove('active-mark');
            });
        });

        changeWeatherMode(targetMode);
    };

    if (mainWeatherModeSlider) {
        mainWeatherModeSlider.addEventListener('input', (e) => window.setWeatherModeStep(e.target.value));
    }
    if (drawerWeatherModeSlider) {
        drawerWeatherModeSlider.addEventListener('input', (e) => window.setWeatherModeStep(e.target.value));
    }


    // 4. 기상 모드 업데이트 함수
    window.changeWeatherMode = function (mode) {
        currentMode = mode;

        document.querySelectorAll('.btn-weather').forEach(btn => btn.classList.remove('active'));

        let badgeText = "";
        let curM = "", curS = "", m30M = "", m30S = "", m60M = "", m60S = "";

        if (mode === 'SUNNY') {
            const btnSunny = document.getElementById('btn-weather-sunny');
            if (btnSunny) btnSunny.classList.add('active');
            badgeText = "현재 맑음 / 기본 관제 가동중";

            curM = "현재 체감 28.5℃ / 습도 45%";
            curS = "위험 가중치 +0 pt / 쾌적한 관제 환경";
            m30M = "예측 체감 29.2℃ / 강수확률 10%";
            m30S = "위험 가중치 +0 pt / 평시 유입 모니터링";
            m60M = "예측 체감 29.0℃ / 불쾌지수 [보통]";
            m60S = "위험 가중치 +0 pt / 기상 위험 특이사항 없음";

        } else if (mode === 'PREDICTIVE_RAIN') {
            const btnPredictive = document.getElementById('btn-weather-predictive');
            if (btnPredictive) btnPredictive.classList.add('active');
            badgeText = "약 30분후 비 예보 / 인구 유입 감시 모드";

            curM = "현재 체감 34.2℃ / 습도 75%";
            curS = "위험 가중치 +0 pt / 평시 관제 상태";
            m30M = "약 30분후 강수확률 60%";
            m30S = "위험 가중치 +10 pt / 인구 유입 감시 모드 가동";
            m60M = "약 60분후 불쾌지수 [매우높음]";
            m60S = "위험 가중치 +15 pt / 골목 혼잡 주의";

        } else if (mode === 'RAINY') {
            const btnRainy = document.getElementById('btn-weather-rainy');
            if (btnRainy) btnRainy.classList.add('active');
            badgeText = "현재 호우 상황 / 바닥 미끄럼 & 출구 집중 관제";

            curM = "현재 강수량 15.5mm/h / 미끄럼 주의";
            curS = "위험 가중치 +15 pt / 악천후 관제 가동중";
            m30M = "강수 지속 (18.0mm/h) / 유입 인파 집결";
            m30S = "위험 가중치 +20 pt / 정체 유연 집중 감시";
            m60M = "소강 상태 진입 예상 / 습도 90%";
            m60S = "위험 가중치 +10 pt / 이탈 인파 서서히 증가";

        } else if (mode === 'HOT_SUMMER') {
            const btnHot = document.getElementById('btn-weather-hot');
            if (btnHot) btnHot.classList.add('active');
            badgeText = "폭염 경보 / 밀실 열기 갇힘 모니터링";

            curM = "현재 체감온도 37.8℃ / 열섬 효과";
            curS = "위험 가중치 +20 pt / 온열질환 발생 주의";
            m30M = "예측 체감온도 38.5℃ / 불쾌지수 [최고조]";
            m30S = "위험 가중치 +25 pt / 장시간 체류 이탈 안내";
            m60M = "예측 체감온도 36.5℃ / 약풍 1.2m/s";
            m60S = "위험 가중치 +15 pt / 쉼터 구역 안내";
        }

        if (wtCurrentMain) wtCurrentMain.innerText = curM;
        if (wtCurrentSub) wtCurrentSub.innerText = curS;
        if (wt30mMain) wt30mMain.innerText = m30M;
        if (wt30mSub) wt30mSub.innerText = m30S;
        if (wt60mMain) wt60mMain.innerText = m60M;
        if (wt60mSub) wt60mSub.innerText = m60S;

        if (weatherBadge) {
            const spanEl = weatherBadge.querySelector('span');
            if (spanEl) spanEl.innerText = badgeText;
            else weatherBadge.innerHTML = `<span>${badgeText}</span>`;
        }

        updateUI();
    };


    // 5. Chart.js 라인 차트 생성 (안전하게 로드 여부 검사)
    const chartCanvas = document.getElementById('lineChart');
    let lineChart = null;

    if (chartCanvas && typeof Chart !== 'undefined') {
        const ctxLine = chartCanvas.getContext('2d');
        lineChart = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: historyLabels,
                datasets: [
                    {
                        label: 'CRI 스코어 곡선',
                        data: historyScores,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 1,
                        pointHoverRadius: 4
                    },
                    {
                        label: '80pt 대피 임계선',
                        data: criticalThresholdLine,
                        borderColor: '#ef4444',
                        borderWidth: 1.5,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // 렌더링 성능 최적화
                scales: {
                    x: {
                        grid: { color: 'rgba(148, 163, 184, 0.1)' },
                        ticks: { color: '#94a3b8', font: { size: 9, family: 'Outfit' } }
                    },
                    y: {
                        min: 0,
                        max: 100,
                        grid: { color: 'rgba(148, 163, 184, 0.1)' },
                        ticks: { color: '#94a3b8', font: { size: 10, family: 'Outfit' }, stepSize: 25 }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#cbd5e1', font: { size: 10, family: 'Inter' }, boxWidth: 12 }
                    }
                }
            }
        });
    }


    // 6. 슬라이더 이벤트 연동
    if (sliderEvacLimit) {
        sliderEvacLimit.addEventListener('input', (e) => {
            evacThreshold = parseFloat(e.target.value);
            if (valEvacLimit) valEvacLimit.innerText = `${evacThreshold} pt`;
            updateUI();
        });
    }

    if (sliderAlarmDelay) {
        sliderAlarmDelay.addEventListener('input', (e) => {
            alarmDelaySec = parseFloat(e.target.value);
            if (valAlarmDelay) valAlarmDelay.innerText = `${alarmDelaySec} s`;
            updateUI();
        });
    }

    if (sliderDensityWeight) {
        sliderDensityWeight.addEventListener('input', (e) => {
            densityWeightPercent = parseInt(e.target.value, 10);
            if (valDensityWeight) valDensityWeight.innerText = `${densityWeightPercent} %`;
            updateUI();
        });
    }

    if (sliderManualOffset) {
        sliderManualOffset.addEventListener('input', (e) => {
            manualScoreOffset = parseFloat(e.target.value);
            if (valManualOffset) valManualOffset.innerText = `${manualScoreOffset >= 0 ? '+' : ''}${manualScoreOffset} pt`;
            updateUI();
        });
    }


    // 7. 비디오 및 타임라인 컨트롤
    if (btnPlayPause && video) {
        btnPlayPause.addEventListener('click', () => {
            if (video.paused) {
                video.play().catch(() => {});
                btnPlayPause.innerText = 'PAUSE';
                isPlaying = true;
            } else {
                video.pause();
                btnPlayPause.innerText = 'PLAY';
                isPlaying = false;
            }
        });
    }

    if (timeline && video) {
        timeline.addEventListener('input', (e) => {
            currentFrame = parseInt(e.target.value, 10);
            if (video.duration) {
                video.currentTime = (currentFrame / totalFrames) * video.duration;
            }
            updateUI(true); // 타임라인 직접 이동 시 즉시 업데이트
        });
    }

    // 비디오 timeupdate 이벤트 스로틀링 (약 5 FPS 간격으로 UI 업데이트하여 멈춤 방지)
    if (video) {
        video.addEventListener('loadedmetadata', () => {
            if (video.duration && !isNaN(video.duration)) {
                totalFrames = Math.max(10, Math.floor(video.duration * 10)); // 초당 10프레임 기준
                if (timeline) {
                    timeline.max = totalFrames;
                }
                console.log(`[CCTV Video Loaded] 재생시간: ${video.duration.toFixed(1)}s, 계산된 총 프레임 수: ${totalFrames}`);
            }
        });

        video.addEventListener('timeupdate', () => {
            if (video.duration && !isNaN(video.duration)) {
                currentFrame = Math.max(1, Math.floor((video.currentTime / video.duration) * totalFrames));
                if (timeline) timeline.value = currentFrame;

                const now = performance.now();
                if (now - lastRenderTime > 180) { //약 5 FPS 간격 스로틀링
                    lastRenderTime = now;
                    updateUI();
                }
            }
        });
    }

    // 8. CCTV 파일 업로드 & 드래그 앤 드롭 관리 로직
    const cctvFileInput = document.getElementById('cctv-file-input');
    const cctvInfoBadge = document.getElementById('cctv-info-badge');
    const videoContainer = document.querySelector('.video-container');

    // CCTV 비디오 파일 처리 메인 함수
    function handleCCTVVideoUpload(file) {
        if (!file) return;

        // 파일 형식 검증 (video/ 타입 또는 .mov, .mp4, .webm 등 확장자 수용)
        const fileNameLower = file.name.toLowerCase();
        const isValidVideo = file.type.startsWith('video/') || 
                             fileNameLower.endsWith('.mov') || 
                             fileNameLower.endsWith('.mp4') || 
                             fileNameLower.endsWith('.webm') || 
                             fileNameLower.endsWith('.avi');

        if (!isValidVideo) {
            alert('⚠️ 올바른 비디오 파일(MP4, MOV, WebM, AVI 등)을 선택해 주세요.');
            return;
        }

        try {
            // 영상 교체 시 시각화 데이터 및 차트 초기화
            currentFrame = 1;
            smoothedCRI = 20.0;
            window.uploadedVideoFrameData = {}; // 업로드된 비디오의 동적 프레임 데이터 초기화
            window.latestLivePedestrianCount = null;
            window.latestLiveCriScore = null;
            if (historyScores) {
                historyScores.fill(20);
                if (lineChart) lineChart.update('none');
            }

            // 파일명 기반 영상 전용 시드 생성 (영상마다 다른 위험도 시각화 패턴 표출)
            let hash = 0;
            for (let i = 0; i < file.name.length; i++) {
                hash = file.name.charCodeAt(i) + ((hash << 5) - hash);
            }
            window.currentVideoSeedOffset = Math.abs(hash % 15);

            const objectURL = URL.createObjectURL(file);
            if (video) {
                video.src = objectURL;
                video.load();
                video.play().catch(() => {});
                isPlaying = true;
                if (btnPlayPause) btnPlayPause.innerText = 'PAUSE';
            }

            // 플레이스홀더 감추기
            const placeholderOverlay = document.getElementById('video-placeholder-overlay');
            if (placeholderOverlay) {
                placeholderOverlay.classList.add('hidden');
            }

            if (cctvInfoBadge) {
                cctvInfoBadge.innerText = file.name;
                cctvInfoBadge.title = `업로드 파일: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`;
            }

            console.log(`[CCTV Upload Success] 파일명: ${file.name}, 시드 오프셋: ${window.currentVideoSeedOffset}, 용량: ${(file.size / (1024 * 1024)).toFixed(1)}MB`);

            // 백엔드 파이프라인 비동기 전송 시도
            uploadVideoToBackend(file);
        } catch (err) {
            console.error('[CCTV Upload Error]', err);
            alert('비디오 로드 중 오류가 발생했습니다.');
        }
    }

    // 파일 input change 이벤트
    if (cctvFileInput) {
        cctvFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleCCTVVideoUpload(file);
        });
    }

    // 드래그 앤 드롭 이벤트 처리기
    if (videoContainer) {
        ['dragenter', 'dragover'].forEach(eventName => {
            videoContainer.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                videoContainer.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            videoContainer.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                videoContainer.classList.remove('drag-over');
            }, false);
        });

        videoContainer.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleCCTVVideoUpload(files[0]);
            }
        });
    }

    // ==========================================================================
    // AI 파이프라인 대기 & 스피너 오버레이 제어 로직
    // ==========================================================================
    const aiLoadingOverlay = document.getElementById('ai-loading-overlay');
    const aiLoadingTitle = document.getElementById('ai-loading-title');
    const aiProgressBar = document.getElementById('ai-progress-bar');
    const aiLoadingPercent = document.getElementById('ai-loading-percent');

    function showAILoadingOverlay(msg = 'CCTV AI 파이프라인 모델링 분석 중...', initialPercent = 0) {
        if (aiLoadingOverlay) {
            aiLoadingOverlay.classList.add('active');
            if (video && !video.paused) {
                video.pause();
            }
        }
        if (aiLoadingTitle) aiLoadingTitle.innerText = msg;
        updateAILoadingProgress(initialPercent);
    }

    function updateAILoadingProgress(percent) {
        const p = Math.min(100, Math.max(0, percent));
        if (aiProgressBar) aiProgressBar.style.width = `${p}%`;
        if (aiLoadingPercent) aiLoadingPercent.innerText = `${p}%`;
    }

    function hideAILoadingOverlay() {
        if (aiLoadingOverlay) {
            aiLoadingOverlay.classList.remove('active');
            if (video) {
                video.play().catch(() => {});
            }
        }
        const placeholderOverlay = document.getElementById('video-placeholder-overlay');
        if (placeholderOverlay) {
            placeholderOverlay.classList.add('hidden');
        }
    }

    // 백엔드 AI 파이프라인 비디오 업로드 전송 인터페이스 함수
    async function uploadVideoToBackend(uploadFile) {
        const formData = new FormData();
        // 파이썬 FastAPI가 'file' 이라는 이름으로 받도록 설계되어 있으므로 키를 맞춥니다.
        formData.append('file', uploadFile);
        formData.append('zone_id', 1); // 기본 zone_id 전달

        showAILoadingOverlay(`🤖 [AI 모델링 분석 대기 중...] ${uploadFile.name}`, 5);

        if (cctvInfoBadge) {
            cctvInfoBadge.innerText = `🤖 [AI 모델링 분석 시작...] ${uploadFile.name}`;
        }

        try {
            // FastAPI / Python 파이프라인 백엔드 API 주소 수정
            const response = await fetch('http://localhost:8000/api/analyze/trigger', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                console.log('[Backend Pipeline Upload Complete]', data);
                if (cctvInfoBadge) {
                    cctvInfoBadge.innerText = `✅ [AI 분석 완료] ${file.name}`;
                }
            } else {
                console.warn('[Backend Upload API Status]', response.status);
            }
        } catch (error) {
            console.log('[Backend Upload Info] 로컬 브라우저 재생 모드로 동작 중입니다.');
            if (cctvInfoBadge) {
                cctvInfoBadge.innerText = file.name;
            }
            // 백엔드 오프라인 시 로컬 1.5초 시뮬레이션 후 로딩 해제
            let currentP = 10;
            const timer = setInterval(() => {
                currentP += 20;
                updateAILoadingProgress(currentP);
                if (currentP >= 100) {
                    clearInterval(timer);
                    setTimeout(hideAILoadingOverlay, 300);
                }
            }, 200);
        }
    }

    // ==========================================================================
    // FastAPI WebSocket 실시간 AI 데이터 스트리밍 연결
    // ==========================================================================
    let cctvWebSocket = null;

    function initCCTVWebSocket() {
        const wsUrl = 'ws://localhost:8000/ws/cctv-stream';
        try {
            cctvWebSocket = new WebSocket(wsUrl);

            cctvWebSocket.onopen = () => {
                console.log('✅ [WebSocket Connected] CCTV AI 파이프라인 실시간 스트림 연결 성공');
            };

            cctvWebSocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'CCTV_AI_START') {
                        showAILoadingOverlay(data.message, 5);
                    } else if (data.type === 'CCTV_AI_PROGRESS') {
                        updateAILoadingProgress(data.progress);
                    } else if (data.type === 'CCTV_AI_COMPLETED') {
                        updateAILoadingProgress(100);
                        setTimeout(() => {
                            hideAILoadingOverlay();
                            if (video) {
                                const backendVideoUrl = `http://localhost:8000/api/v1/cctv/video/${encodeURIComponent(data.filename)}?t=${Date.now()}`;
                                video.src = backendVideoUrl;
                                video.load();
                                video.play().catch((e) => console.log("Video play error:", e));
                                isPlaying = true;
                                if (btnPlayPause) btnPlayPause.innerText = 'PAUSE';
                            }
                        }, 400);
                    } else if (data.type === 'CCTV_AI_STREAM') {
                        if (aiLoadingOverlay && aiLoadingOverlay.classList.contains('active')) {
                            updateAILoadingProgress(100);
                            setTimeout(hideAILoadingOverlay, 200);
                        }

                        window.latestLivePedestrianCount = data.pedestrian_count;
                        window.latestLiveCriScore = data.cri_score;

                        // ⭐ [핵심 추가] 파이썬이 보내는 긴급 타이머 상태(status) 체크
                        if (data.status === 'DANGER_WAITING') {
                            if (emergencyBackdrop) emergencyBackdrop.classList.add('active');
                            if (emergencyTopDrawer) emergencyTopDrawer.classList.add('active');
                            if (emergencyCountdownVal && data.remaining_sec) {
                                emergencyCountdownVal.innerText = `${data.remaining_sec}초`;
                            }
                        } else if (data.status === 'SAFE') {
                            if (emergencyBackdrop) emergencyBackdrop.classList.remove('active');
                            if (emergencyTopDrawer) emergencyTopDrawer.classList.remove('active');
                        }

                        if (livePersonCount) livePersonCount.innerText = `${data.pedestrian_count} 명`;
                        if (liveOccupancyRate) liveOccupancyRate.innerText = `${data.occupancy_rate} %`;
                        if (liveStoppageTime) liveStoppageTime.innerText = `${data.stagnation_sec} 초`;

                        updateUI(true);
                    }
                } catch (e) {
                    console.error('[WebSocket Message Parse Error]', e);
                }
            };

            cctvWebSocket.onclose = () => {
                setTimeout(initCCTVWebSocket, 3000);
            };
        } catch (e) {
            console.log('[WebSocket Init Error]', e);
        }
    }

    // 대시보드 로드 시 WebSocket 실시간 스트림 자동 개시
    initCCTVWebSocket();

    // 🟢 [오경보 해제] 버튼 클릭 시 -> 타이머 리셋 및 정상화
    const btnCancelAlarm = document.getElementById('btn-cancel-alarm');
    if (btnCancelAlarm) {
        btnCancelAlarm.addEventListener('click', async () => {
            try {
                // 파이썬 쪽에 오경보 처리(cancel) API 전송 (필요 시)
                await fetch('http://localhost:8000/api/analyze/cancel', { method: 'POST' }).catch(() => {});
                
                // 프론트엔드 UI 타이머 및 위험 스코어 강제 초기화
                emergencyStartTime = null;
                isEmergencyConfirmed = false;
                isAutoDispatched = false;
                smoothedCRI = Math.max(0, smoothedCRI - 30); // 위험도 즉시 차감
                
                if (emergencyBackdrop) emergencyBackdrop.classList.remove('active');
                if (emergencyTopDrawer) emergencyTopDrawer.classList.remove('active');
                
                alert("✅ 오경보 처리되어 상황이 해제되었습니다. (영상 및 PDF 생성 취소)");
            } catch(e) { console.error('오경보 발송 실패:', e); }
        });
    }

    // 👉 [새로 추가] 파이썬으로 현장 상황 데이터(메타데이터)를 꽉꽉 채워 보내는 공통 함수
    async function triggerEmergencyConfirm(isAutoDispatch) {
        try {
            const payload = {
                isAuto: isAutoDispatch, // true면 자동신고, false면 수동신고
                currentCRI: parseFloat(criScore ? criScore.innerText : 0),
                pedestrianCount: parseInt(livePersonCount ? livePersonCount.innerText : 0),
                occupancyRate: parseFloat(liveOccupancyRate ? liveOccupancyRate.innerText : 0),
                weatherMode: currentMode || 'UNKNOWN',
                timestamp: new Date().toISOString()
            };

            await fetch('http://localhost:8000/api/analyze/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("✅ 파이썬으로 영상/PDF 생성 지시 완료 (데이터 전달 성공)");
        } catch(e) {
            console.error('현장 출동 API 전송 실패:', e);
        }
    }

    // 🚨 [현장 출동(수동 신고)] 버튼 클릭 시 -> 파이썬에 영상+PDF 패키지 생성 즉시 강제 트리거
    const btnDispatchAlarm = document.getElementById('btn-dispatch-alarm');
    if (btnDispatchAlarm) {
        btnDispatchAlarm.addEventListener('click', async () => {
            try {
                isEmergencyConfirmed = true; // 타이머 작동 멈춤
                
                // 👉 [수정됨] 메타데이터를 포함한 수동 신고 트리거 호출
                await triggerEmergencyConfirm(false);
                
                if (emergencyDrawerMsg) {
                    emergencyDrawerMsg.innerHTML = `🚨 <strong>[수동 현장 출동 지시 완료]</strong><br>요원의 출동 지시로 인해 증거용 영상 35초 및 사고 명세서 PDF가 묶여서 안전하게 자동 생성 및 적재 진행 중입니다.`;
                }
                
                // 버튼 숨기기/변경 처리
                if (btnCancelAlarm) btnCancelAlarm.style.display = 'none';
                btnDispatchAlarm.innerText = `✅ 출동 조치 완료 (3초 후 닫힘)`;
                btnDispatchAlarm.style.backgroundColor = '#10b981';
                btnDispatchAlarm.style.animation = 'none';
                
                // 3초 뒤에 모달을 자동으로 닫고 화면을 정상화합니다.
                setTimeout(() => {
                    emergencyStartTime = null;
                    isEmergencyConfirmed = false;
                    isAutoDispatched = false;
                    smoothedCRI = Math.max(0, smoothedCRI - 30); // 위험도 즉시 차감
                    
                    if (emergencyBackdrop) emergencyBackdrop.classList.remove('active');
                    if (emergencyTopDrawer) emergencyTopDrawer.classList.remove('active');
                    
                    // 버튼들 상태 원상 복구 (다음 알람을 위해)
                    if (btnCancelAlarm) btnCancelAlarm.style.display = 'block';
                    btnDispatchAlarm.innerText = `🚨 [현장 출동] 즉시 수동 신고`;
                    btnDispatchAlarm.style.backgroundColor = '#ef4444';
                }, 3000);
                
            } catch(e) { console.error('현장 출동 발송 실패:', e); }
        });
    }

    // 9. 핵심 UI 계산 및 EMA 스무딩 (성능 개선 버전)
    function updateUI(forceImmediateChart = false) {
        const timeSec = (currentFrame / 10.0).toFixed(1);
        if (frameCounter) frameCounter.innerText = `${timeSec}s`;

        // 실시간 스트리밍 / WebSocket 수신 인원수 데이터 가져오기 (업로드 비디오의 동적 프레임 데이터 우선 적용)
        let countVal = 7;
        let occupancyVal = null;
        let stoppageSec = null;
        let incomingCriScore = null;

        // 업로드된 비디오의 동적 데이터 맵이 활성화된 상태라면, 정적 폴백(realFrameDataMap) 조회를 아예 스킵
        const hasUploadedData = window.uploadedVideoFrameData && Object.keys(window.uploadedVideoFrameData).length > 0;

        if (window.uploadedVideoFrameData && window.uploadedVideoFrameData[currentFrame] !== undefined) {
            const frameData = window.uploadedVideoFrameData[currentFrame];
            countVal = frameData.pedestrian_count;
            occupancyVal = frameData.occupancy_rate;
            stoppageSec = frameData.stagnation_sec;
            incomingCriScore = frameData.cri_score;
        } else if (!hasUploadedData && typeof realFrameDataMap !== 'undefined' && realFrameDataMap[currentFrame] !== undefined) {
            countVal = realFrameDataMap[currentFrame];
        } else {
            // 업로드된 영상 재생 중인데 해당 프레임 데이터가 유실되었거나 아직 안 온 경우 안전하게 0명 처리
            countVal = 0;
            occupancyVal = 0.0;
            stoppageSec = 0;
            incomingCriScore = 10.0;
        }

        // 지표 계산
        const sCount = Math.min(100, countVal * 2.2);
        const sDensity = Math.min(100, countVal * 2.5 * (densityWeightPercent / 40.0));
        const sStagnation = Math.min(100, countVal * 1.8);

        let weatherRisk = 0;
        let timeRatio = (currentWeatherTimeOffset / 60.0);
        if (currentMode === 'SUNNY') {
            weatherRisk = 0;
        } else if (currentMode === 'PREDICTIVE_RAIN') {
            weatherRisk = Math.round(timeRatio * 15);
        } else if (currentMode === 'RAINY') {
            weatherRisk = 15 + Math.round(timeRatio * 10);
        } else if (currentMode === 'HOT_SUMMER') {
            weatherRisk = 10 + Math.round(timeRatio * 10);
        }

        let sWeather = weatherRisk;
        let weatherMultiplier = 1.0;

        if (currentMode === 'PREDICTIVE_RAIN') {
            weatherMultiplier = 1.05;
        } else if (currentMode === 'RAINY') {
            weatherMultiplier = 1.10;
        } else if (currentMode === 'HOT_SUMMER') {
            weatherMultiplier = 1.15;
        }

        // 종합 CRI 점수 산출
        let finalCRI = 20.0;
        if (incomingCriScore !== null && incomingCriScore !== undefined) {
            finalCRI = incomingCriScore;
        } else {
            let rawCRI = (sCount * 0.25 + sDensity * (densityWeightPercent / 100.0) + sStagnation * 0.20 + sWeather * 0.15) * weatherMultiplier;
            rawCRI += manualScoreOffset;
            rawCRI = Math.min(100.0, Math.max(0.0, rawCRI));

            // EMA 스무딩
            smoothedCRI = (alphaEMA * rawCRI) + ((1.0 - alphaEMA) * smoothedCRI);
            finalCRI = Math.min(100.0, Math.max(0.0, smoothedCRI));
        }

        // 3대 실시간 지표 카드 업데이트
        const displayOccupancy = occupancyVal !== null ? occupancyVal : Math.min(99.5, (countVal * 1.45).toFixed(1));
        const displayStoppageSec = stoppageSec !== null ? stoppageSec : Math.floor(countVal * 1.2);
        const minStr = Math.floor(displayStoppageSec / 60);
        const secStr = (displayStoppageSec % 60).toString().padStart(2, '0');
        const stoppageFormatted = minStr > 0 ? `${minStr}분 ${secStr}초` : `${displayStoppageSec} 초`;

        if (livePersonCount) livePersonCount.innerText = `${countVal} 명`;
        if (liveOccupancyRate) liveOccupancyRate.innerText = `${displayOccupancy} %`;
        if (liveStoppageTime) liveStoppageTime.innerText = stoppageFormatted;

        // CRI 점수 및 프로그레스바 출력
        if (criScore) criScore.innerText = `${finalCRI.toFixed(1)} pt`;
        if (headerCriVal) headerCriVal.innerText = `${finalCRI.toFixed(1)} pt`;
        if (progressIndicator) progressIndicator.style.width = `${finalCRI}%`;

        // 차트 업데이트 스로틀링 (매 프레임마다 shift 하지 않고 안정적인 간격으로 업데이트)
        const now = Date.now();
        if (lineChart && (forceImmediateChart || now - lastChartUpdateTime > 300)) {
            lastChartUpdateTime = now;
            historyScores.shift();
            historyScores.push(parseFloat(finalCRI.toFixed(1)));
            lineChart.data.datasets[0].data = historyScores;
            lineChart.update('none'); // 애니메이션 없이 빠르게 업데이트
        }

        // 상태 레이블 및 경보 단계 결정
        let statusText = "NORMAL / 정상";
        let statusClass = "safe";
        let barColor = "#10b981";

        if (finalCRI >= evacThreshold) {
            statusText = "EVACUATE / 대피경보";
            statusClass = "danger";
            barColor = "#ef4444";

            // 대피 위험 상태 진입 타임스탬프 기록
            if (!emergencyStartTime) {
                emergencyStartTime = now;
            }

            const elapsedSec = (now - emergencyStartTime) / 1000.0;

            // 1) 15초 이상 유지 시: 화면 전체 조작 차단 & 오른쪽 상단 서랍 슬라이드 다운 등장
            if (elapsedSec >= 15.0) {
                if (!isEmergencyConfirmed) {
                    if (emergencyBackdrop) emergencyBackdrop.classList.add('active');
                    if (emergencyTopDrawer) emergencyTopDrawer.classList.add('active');
                }

                const remainingSec = Math.max(0, Math.ceil(30 - elapsedSec));
                if (emergencyCountdownVal) emergencyCountdownVal.innerText = `${remainingSec}초`;

                // 2) 30초 경과 시: 112/119 자동 신고 접수 및 출동 상태로 전환
                if (elapsedSec >= 30.0 && !isAutoDispatched) {
                    isAutoDispatched = true;
                    if (emergencyDrawerMsg) {
                        emergencyDrawerMsg.innerHTML = `🚨 <strong>[30초 경과 - 112/119 긴급 자동 신고 접수 완료]</strong><br>미확인 30초 경과로 관제 센터 조작이 일시 잠금되며 112/119 현장 출동 명령이 발송되었습니다.`;
                    }
                    if (btnConfirmEmergency) {
                        btnConfirmEmergency.innerText = `🚨 [112/119 긴급 출동 완료 - 조작 해제]`;
                    }
                    
                    // 👉 [새로 추가] 30초 경과 시 자동으로 파이썬에 API 쏘기!
                    triggerEmergencyConfirm(true);
                }
            }
        } else if (finalCRI >= (evacThreshold * 0.65)) {
            statusText = "CONGESTED / 혼잡주의";
            statusClass = "warning";
            barColor = "#f59e0b";
            
            // 위험 해제 시 비상 타이머 및 서랍 리셋
            emergencyStartTime = null;
            isEmergencyConfirmed = false;
            isAutoDispatched = false;
            if (emergencyBackdrop) emergencyBackdrop.classList.remove('active');
            if (emergencyTopDrawer) emergencyTopDrawer.classList.remove('active');
        } else {
            statusText = "NORMAL / 정상";
            statusClass = "safe";
            barColor = "#10b981";

            // 위험 해제 시 비상 타이머 및 서랍 리셋
            emergencyStartTime = null;
            isEmergencyConfirmed = false;
            isAutoDispatched = false;
            if (emergencyBackdrop) emergencyBackdrop.classList.remove('active');
            if (emergencyTopDrawer) emergencyTopDrawer.classList.remove('active');
        }

        if (statusBox) statusBox.className = `status-display ${statusClass}`;
        if (statusLabel) statusLabel.innerText = statusText;
        if (progressIndicator) progressIndicator.style.backgroundColor = barColor;

        if (headerCriVal) headerCriVal.className = `score-summary-val ${statusClass}`;
        if (headerStatusBadge) {
            headerStatusBadge.className = `score-summary-status ${statusClass}`;
            headerStatusBadge.innerText = statusText;
        }
    }

    // 9. 초기 모드 가동
    changeWeatherMode('PREDICTIVE_RAIN');
});

// =========================================================
// [백엔드 API 연동] 알람 이력 및 뱃지 데이터 호출
// =========================================================
async function loadRealAlertLogs() {
    try {
        let token = '';
        try {
            const authStorage = localStorage.getItem('tdtc-ai-auth');
            if (authStorage) {
                token = JSON.parse(authStorage).state.token || '';
            }
        } catch (e) {}

        const response = await fetch('http://localhost:8080/api/ai/alerts/unresolved', {
            method: 'GET',
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error("백엔드 응답 에러:", response.status);
            return;
        }

        const alerts = await response.json();
        
        // 1. 우측 상단 종 모양 뱃지 숫자 업데이트
        const badge = document.getElementById('header-alert-count');
        if (badge) badge.innerText = alerts.length;

        // 2. 모달창 리스트 업데이트
        const listContainer = document.querySelector('.alert-log-list');
        if (listContainer) {
            listContainer.innerHTML = ''; // 기존 하드코딩(가짜) 데이터 싹 지우기
            
            // 데이터가 없을 경우 처리
            if (alerts.length === 0) {
                listContainer.innerHTML = '<div style="color:#94a3b8; text-align:center; padding: 20px;">미해결 긴급 알람이 없습니다. (현재 안전)</div>';
                return;
            }

            // 백엔드의 진짜 데이터로 HTML 리스트 동적 생성
            alerts.forEach(alert => {
                // 시간 예쁘게 포맷팅 (ex: 14:23:40)
                const timeString = new Date(alert.alertedAt).toLocaleTimeString('ko-KR', { hour12: false });
                
                listContainer.innerHTML += `
                    <div class="log-item danger">
                        <span class="log-time">${timeString}</span>
                        <span class="log-type-tag danger">${alert.alertType}</span>
                        <span class="log-desc">🚨 [존 ${alert.zoneId} 감지] 자바 백엔드에서 불러온 실제 긴급 알람입니다!</span>
                    </div>
                `;
            });
        }
    } catch (e) {
        console.error("백엔드 알람 API 호출 실패 (서버가 꺼져있거나 CORS 에러):", e);
    }
}

// 화면이 열릴 때 자동으로 백엔드를 찌르도록 실행
loadRealAlertLogs();

// =========================================================
// 10. 증거/기록 보관소 (다운로드 센터) 제어 로직
// =========================================================
function openDownloadModal() {
    const backdrop = document.getElementById('download-center-modal-backdrop');
    if (backdrop) {
        backdrop.classList.add('active');
        // 기본 탭 로드 (상시 녹화)
        switchDownloadTab('routine');
    }
}

function closeDownloadModal() {
    const backdrop = document.getElementById('download-center-modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
}

async function switchDownloadTab(tabName) {
    // 1. 탭 버튼 스타일 갱신
    const btns = document.querySelectorAll('.download-tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    // 클릭한 버튼 활성화
    const clickedBtn = Array.from(btns).find(b => {
        if (tabName === 'routine' && b.innerText.includes('상시')) return true;
        if (tabName === 'clips' && b.innerText.includes('클립')) return true;
        if (tabName === 'reports' && b.innerText.includes('명세서')) return true;
        return false;
    });
    if (clickedBtn) clickedBtn.classList.add('active');

    const container = document.getElementById('download-list-container');
    if (!container) return;
    
    container.innerHTML = '<div class="download-loading">백엔드(S3)에서 데이터를 불러오는 중입니다...</div>';

    try {
        let url = '';
        if (tabName === 'routine') {
            url = 'http://localhost:8080/api/v1/routine-videos'; // 방금 만든 백엔드 API
        } else if (tabName === 'clips') {
            url = 'http://localhost:8080/api/v1/video-clips'; // 기존 백엔드 API
        } else if (tabName === 'reports') {
            url = 'http://localhost:8080/api/v1/post-reports'; // 3번째 탭: 명세서(PDF) 조회
        }

        let token = '';
        try {
            const authStorage = localStorage.getItem('tdtc-ai-auth');
            if (authStorage) {
                token = JSON.parse(authStorage).state.token || '';
            }
        } catch (e) {}

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const dataList = await response.json();

        container.innerHTML = ''; // 로딩 텍스트 제거

        if (!dataList || dataList.length === 0) {
            container.innerHTML = '<div class="download-loading">해당 항목의 데이터가 없습니다.</div>';
            return;
        }

        // 받아온 데이터를 리스트로 렌더링
        dataList.forEach(item => {
            // 각 API마다 내려주는 필드명이 약간 다를 수 있으므로 매핑
            let fileName = item.fileName || item.clipType || item.llmSummary || "알 수 없는 파일";
            let downloadUrl = item.downloadUrl || item.s3ClipUrl || item.viewUrl || item.s3PdfUrl || "#";
            let timeStr = item.lastModified || item.startTime || item.targetDate || "";

            // URL이 없는 경우는 다운로드 불가 처리
            const linkHtml = downloadUrl !== "#" 
                ? `<a href="${downloadUrl}" target="_blank" class="btn-download-link" download>📥 다운로드</a>`
                : `<span style="color:#64748b; font-size:0.75rem;">URL 없음</span>`;

            container.innerHTML += `
                <div class="download-item">
                    <div class="download-item-info">
                        <span class="download-item-name">${fileName}</span>
                        <span class="download-item-date">${timeStr}</span>
                    </div>
                    ${linkHtml}
                </div>
            `;
        });
    } catch (e) {
        console.error('다운로드 센터 데이터 로드 실패:', e);
        container.innerHTML = '<div class="download-loading" style="color:#ef4444;">백엔드 서버와 연결할 수 없습니다.<br>백엔드 서버가 실행 중인지 확인해 주세요.</div>';
    }
}
