import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './CctvDashboard.module.css';
import CctvAlertLogModal from './CctvAlertLogModal';
import CctvEmergencyOverlay from './CctvEmergencyOverlay';
import CctvHeaderBar from './CctvHeaderBar';
import CctvMetricCards from './CctvMetricCards';
import CctvRiskChartCard from './CctvRiskChartCard';
import CctvSideDrawers from './CctvSideDrawers';
import type { OpenDrawer } from './CctvSideDrawers';
import CctvVideoPanel from './CctvVideoPanel';
import CctvWeatherCard from './CctvWeatherCard';
import ErrorBanner from '../ui/ErrorBanner';
import { fetchCctvResultVideoUrl, uploadCctvVideo } from '../../api/cctvClient';
import { fetchUnresolvedAlerts } from '../../api/client';
import { WEATHER_SCENARIOS } from '../../constants/weatherScenario';
import { FALLBACK_TOTAL_FRAMES, REAL_FRAME_DATA_MAP } from '../../data/realFrameData';
import { useCctvStream } from '../../hooks/useCctvStream';
import { useCriScore } from '../../hooks/useCriScore';
import { useEmergencyTimer } from '../../hooks/useEmergencyTimer';
import type { ControlParams, EmergencyAlert, WeatherMode } from '../../types/cctv';
import {
  DEFAULT_CONTROL_PARAMS,
  estimateOccupancyRate,
  estimateStagnationSec,
  formatStoppage,
} from '../../utils/criScore';
import { toDisplayErrorMessage } from '../../utils/errorMessage';

// 2026-08-06 신규: public/mangwon/index.html + dashboard.js를 대체하는 React 관제 대시보드.
//
// 기존에는 이 화면 전체가 public/ 아래 정적 HTML이었고 DashboardPage가 그걸 iframe으로
// 끼워 넣고 있었다. iframe 안이라 (1) position:fixed 오버레이가 앱 뷰포트를 못 덮고
// (2) 로그인 JWT가 전달되지 않아 BE 데이터를 하나도 못 읽고 (3) 앱 다크모드와 따로 놀았다.
// 세 문제 모두 iframe을 없애면서 사라진다.
//
// 영상 재생 위치가 곧 관제 프레임이라, currentFrame을 이 컴포넌트가 들고 있고
// 지표/스코어/비상 타이머는 전부 그 파생값으로 계산된다.

/** 원본과 동일하게 1초당 10프레임 기준으로 타임라인을 끊는다. */
const FRAMES_PER_SECOND = 10;

/** timeupdate가 초당 수십 번 올라오므로 이 간격으로만 상태를 갱신한다. */
const FRAME_UPDATE_THROTTLE_MS = 180;

export default function CctvControlDashboard() {
  // ----- 관제 파라미터 & 기상 시나리오 -----
  const [params, setParams] = useState<ControlParams>(DEFAULT_CONTROL_PARAMS);
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('PREDICTIVE_RAIN');

  // ----- 패널 열림 상태 -----
  const [openDrawer, setOpenDrawer] = useState<OpenDrawer>(null);
  const [isAlertModalOpen, setAlertModalOpen] = useState(false);

  // ----- 영상 재생 상태 -----
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [totalFrames, setTotalFrames] = useState(FALLBACK_TOTAL_FRAMES);
  const [isPlaying, setPlaying] = useState(false);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState('CCTV 영상을 업로드해 주세요');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastFrameUpdateRef = useRef(0);

  // ----- AI 파이프라인 실시간 스트림 -----
  const stream = useCctvStream();

  // ----- BE 미해결 알람 -----
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [isAlertLoading, setAlertLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setAlertLoading(true);
    setAlertError(null);
    try {
      setAlerts(await fetchUnresolvedAlerts());
    } catch (err) {
      console.error('미해결 알람 로드 실패', err);
      setAlertError(toDisplayErrorMessage(err, '알람 이력을 불러오지 못했습니다.'));
    } finally {
      setAlertLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // ----- 현재 프레임의 관제 지표 결정 -----
  // 우선순위: AI 스트림 실측 > 정적 폴백(원본 영상 604프레임) > 0
  // 스트림 데이터가 하나라도 들어온 뒤에는 폴백을 조회하지 않는다. 업로드한 영상을
  // 보고 있는데 원본 영상의 인원수가 섞여 나오면 안 되기 때문이다(원본 동작 유지).
  const hasStreamData = Object.keys(stream.frameData).length > 0;

  const metrics = useMemo(() => {
    const streamed = stream.frameData[currentFrame];
    if (streamed) {
      return {
        pedestrianCount: streamed.pedestrianCount,
        occupancyRate: streamed.occupancyRate,
        stagnationSec: streamed.stagnationSec,
        incomingCriScore: streamed.criScore,
        isEstimated: false,
      };
    }

    const fallbackCount = REAL_FRAME_DATA_MAP[currentFrame];
    if (!hasStreamData && fallbackCount !== undefined) {
      return {
        pedestrianCount: fallbackCount,
        occupancyRate: estimateOccupancyRate(fallbackCount),
        stagnationSec: estimateStagnationSec(fallbackCount),
        incomingCriScore: null,
        isEstimated: true,
      };
    }

    // 업로드 영상 재생 중인데 해당 프레임 데이터가 아직 안 온 경우.
    // 인원 0으로 두되 스코어가 완전히 0으로 떨어지지 않도록 바닥값을 준다(원본과 동일).
    return {
      pedestrianCount: 0,
      occupancyRate: 0,
      stagnationSec: 0,
      incomingCriScore: hasStreamData ? 10 : null,
      isEstimated: true,
    };
  }, [stream.frameData, currentFrame, hasStreamData]);

  // ----- 위험도 산출 & 비상 타이머 -----
  const { cri, statusResult, history, reset: resetCri } = useCriScore({
    pedestrianCount: metrics.pedestrianCount,
    incomingCriScore: metrics.incomingCriScore,
    weatherMode,
    params,
  });

  const emergency = useEmergencyTimer(statusResult.status, params.alarmDelaySec);

  // ----- 분석 완료 시 비식별 처리된 결과 영상으로 교체 -----
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!stream.completedFilename) return;

    // 2026-08-10 변경: 서버 주소를 <video src>에 바로 넣지 않고 blob으로 받아온다.
    // ngrok 무료 플랜이 브라우저 요청에 안내 페이지를 끼워넣는데, <video>에는
    // 그걸 우회할 헤더를 붙일 수 없어서 재생이 실패했다.
    let cancelled = false;
    let created: string | null = null;

    fetchCctvResultVideoUrl(stream.completedFilename)
        .then((objectUrl) => {
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          created = objectUrl;
          setResultVideoUrl(objectUrl);
        })
        .catch((err) => {
          // 결과 영상만 실패한 것이므로 업로드한 로컬 영상으로 계속 재생한다.
          console.error('[CCTV] 결과 영상 로드 실패 (로컬 영상으로 재생)', err);
          setResultVideoUrl(null);
        });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [stream.completedFilename]);

  // 업로드한 로컬 파일의 objectURL은 다 쓰고 나면 반드시 해제한다.
  useEffect(() => {
    return () => {
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    };
  }, [localVideoUrl]);

  const videoSrc = resultVideoUrl ?? localVideoUrl;

  // ----- 영상 선택 & AI 서버 업로드 -----
  const handleSelectVideo = useCallback(
      async (file: File) => {
        setUploadError(null);

        // 이전 영상의 잔상(프레임 데이터/차트/결과 영상)을 모두 비운다.
        resetCri();
        stream.resetFrameData();
        setResultVideoUrl(null);
        setCurrentFrame(1);
        setTotalFrames(FALLBACK_TOTAL_FRAMES);

        setLocalVideoUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(file);
        });
        setFileLabel(file.name);
        setPlaying(true);

        stream.beginAnalysis(`🤖 [AI 모델링 분석 대기 중...] ${file.name}`);

        try {
          await uploadCctvVideo(file);
          // 이후 진행률/완료/프레임 스트리밍은 WebSocket으로 도착한다.
        } catch (err) {
          console.error('[CCTV] AI 서버 업로드 실패', err);
          stream.endAnalysis();
          setUploadError(
              toDisplayErrorMessage(
                  err,
                  'CCTV AI 분석 서버에 영상을 보내지 못했습니다. 업로드한 영상은 로컬 재생만 됩니다.'
              )
          );
        }
      },
      [resetCri, stream]
  );

  // ----- 재생 컨트롤 -----
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  const handleSeekFrame = useCallback(
      (frame: number) => {
        setCurrentFrame(frame);
        const video = videoRef.current;
        if (video?.duration) {
          video.currentTime = (frame / totalFrames) * video.duration;
        }
      },
      [totalFrames]
  );

  const handleLoadedMetadata = useCallback(() => {
    const duration = videoRef.current?.duration;
    if (!duration || Number.isNaN(duration)) return;
    setTotalFrames(Math.max(10, Math.floor(duration * FRAMES_PER_SECOND)));
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video?.duration || Number.isNaN(video.duration)) return;

    const now = performance.now();
    if (now - lastFrameUpdateRef.current < FRAME_UPDATE_THROTTLE_MS) return;
    lastFrameUpdateRef.current = now;

    setCurrentFrame(Math.max(1, Math.floor((video.currentTime / video.duration) * totalFrames)));
  }, [totalFrames]);

  // ----- 드로어 제어 -----
  const handleToggleDrawer = useCallback((drawer: Exclude<OpenDrawer, null>) => {
    setOpenDrawer((prev) => (prev === drawer ? null : drawer));
  }, []);

  const handleOpenAlertLog = useCallback(() => {
    setAlertModalOpen(true);
    loadAlerts();
  }, [loadAlerts]);

  const frameTimeLabel = `${(currentFrame / FRAMES_PER_SECOND).toFixed(1)}s`;

  return (
      <div className={styles.dashboardRoot}>
        <CctvHeaderBar
            cri={cri}
            status={statusResult.status}
            statusLabel={statusResult.label}
            alertCount={alerts.length}
            onOpenAlertLog={handleOpenAlertLog}
        />

        <CctvSideDrawers
            openDrawer={openDrawer}
            onToggle={handleToggleDrawer}
            onClose={() => setOpenDrawer(null)}
            params={params}
            onParamsChange={setParams}
            weatherMode={weatherMode}
            onWeatherModeChange={setWeatherMode}
        />

        <main className={styles.mainWrapper}>
          {uploadError && (
              <div style={{ marginBottom: 16 }}>
                <ErrorBanner message={uploadError} onRetry={() => setUploadError(null)} />
              </div>
          )}

          <div className={styles.gridContainer}>
            <section className={styles.gridLeftCol}>
              <CctvVideoPanel
                  videoRef={videoRef}
                  videoSrc={videoSrc}
                  fileLabel={fileLabel}
                  isPlaying={isPlaying}
                  currentFrame={currentFrame}
                  totalFrames={totalFrames}
                  frameTimeLabel={frameTimeLabel}
                  analysis={stream.analysis}
                  wsStatus={stream.status}
                  isDispatchAlarmActive={emergency.isDispatchAlarmActive}
                  weatherBadgeText={WEATHER_SCENARIOS[weatherMode].badgeText}
                  onSelectVideo={handleSelectVideo}
                  onTogglePlay={handleTogglePlay}
                  onSeekFrame={handleSeekFrame}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
              />

              <CctvMetricCards
                  pedestrianCount={metrics.pedestrianCount}
                  occupancyRate={metrics.occupancyRate}
                  stoppageLabel={formatStoppage(metrics.stagnationSec)}
                  isEstimated={metrics.isEstimated}
              />
            </section>

            <section className={styles.gridRightCol}>
              <CctvWeatherCard mode={weatherMode} onChange={setWeatherMode} />
              <CctvRiskChartCard
                  cri={cri}
                  status={statusResult.status}
                  statusLabel={statusResult.label}
                  barColor={statusResult.barColor}
                  history={history}
              />
            </section>
          </div>
        </main>

        <CctvAlertLogModal
            isOpen={isAlertModalOpen}
            alerts={alerts}
            isLoading={isAlertLoading}
            loadError={alertError}
            onClose={() => setAlertModalOpen(false)}
        />

        <CctvEmergencyOverlay
            isVisible={emergency.isBlocking}
            countdownSec={emergency.countdownSec}
            isAutoDispatched={emergency.isAutoDispatched}
            onConfirm={emergency.confirm}
        />
      </div>
  );
}
