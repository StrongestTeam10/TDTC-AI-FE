import { useEffect, useState } from 'react';
import styles from './CctvDashboard.module.css';
import CctvWeatherModeSlider from './CctvWeatherModeSlider';
import CctvWeatherTimeline from './CctvWeatherTimeline';
import { WEATHER_SCENARIOS } from '../../constants/weatherScenario';
import type { ControlParams, WeatherMode, VideoClip } from '../../types/cctv';
import { fetchVideoClips } from '../../api/client';

// 2026-08-06: 원본 index.html의 우측 토글 버튼 2개 + 백드롭 + <aside class="right-drawer"> 2개.
// dashboard.js의 toggleParamDrawer/toggleWeatherDrawer/closeAllDrawers가
// classList로 'open'/'active'를 붙였다 뗐다 하던 것을 openDrawer 상태 하나로 바꿨다.

export type OpenDrawer = 'params' | 'videos' | 'weather' | null;

interface CctvSideDrawersProps {
  openDrawer: OpenDrawer;
  onToggle: (drawer: Exclude<OpenDrawer, null>) => void;
  onClose: () => void;
  params: ControlParams;
  onParamsChange: (params: ControlParams) => void;
  weatherMode: WeatherMode;
  onWeatherModeChange: (mode: WeatherMode) => void;
}

/** 슬라이더 한 줄. 원본의 .control-group 마크업을 그대로 유지한다. */
function ParamSlider({
  label,
  valueText,
  valueClass,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueText: string;
  valueClass: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
      <div className={styles.controlGroup}>
        <div className={styles.controlLabelRow}>
          <span className={styles.controlLabel}>{label}</span>
          <span className={`${styles.controlVal} ${valueClass}`}>{valueText}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            className={styles.timelineSlider}
            onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
  );
}

export default function CctvSideDrawers({
  openDrawer,
  onToggle,
  onClose,
  params,
  onParamsChange,
  weatherMode,
  onWeatherModeChange,
}: CctvSideDrawersProps) {
  function updateParam<K extends keyof ControlParams>(key: K, value: ControlParams[K]) {
    onParamsChange({ ...params, [key]: value });
  }

  const [routineClips, setRoutineClips] = useState<VideoClip[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (openDrawer === 'videos') {
      setIsLoading(true);
      fetchVideoClips()
        .then((data) => {
          // ROUTINE 타입만 필터링하거나, 1분 단위 영상 위주로 보여줍니다.
          // 백엔드 구현에 따라 다를 수 있으므로 여기서는 클립 타입이 DANGER가 아닌 것(또는 ROUTINE)을 필터링합니다.
          const routines = data.filter(c => c.clipType !== 'DANGER');
          setRoutineClips(routines);
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [openDrawer]);

  return (
      <>
        <button
            type="button"
            className={`${styles.drawerToggleBtn} ${styles.paramBtn}`}
            title="파라미터 조율 패널 열기"
            onClick={() => onToggle('params')}
        >
          <span className={styles.toggleArrow}>◀</span>
          <span className={styles.toggleLabel}>파라미터</span>
          <span className={styles.toggleIcon}>⚙️</span>
        </button>

        <button
            type="button"
            className={`${styles.drawerToggleBtn} ${styles.videoBtn}`}
            title="정기 녹화 영상 패널 열기"
            onClick={() => onToggle('videos')}
        >
          <span className={styles.toggleArrow}>◀</span>
          <span className={styles.toggleLabel}>녹화영상</span>
          <span className={styles.toggleIcon}>📼</span>
        </button>

        <button
            type="button"
            className={`${styles.drawerToggleBtn} ${styles.weatherBtn}`}
            title="기상 시나리오 패널 열기"
            onClick={() => onToggle('weather')}
        >
          <span className={styles.toggleArrow}>◀</span>
          <span className={styles.toggleLabel}>기상시나리오</span>
          <span className={styles.toggleIcon}>🌦️</span>
        </button>

        <div
            className={`${styles.drawerBackdrop} ${openDrawer ? styles.active : ''}`}
            onClick={onClose}
        />

        {/* 드로어 1: 관제 파라미터 조절 */}
        <aside className={`${styles.rightDrawer} ${openDrawer === 'params' ? styles.open : ''}`}>
          <div className={styles.drawerHeader}>
            <div className={styles.drawerTitle}>
              <span>🎛️ 관제 파라미터 조절</span>
              <span className={styles.drawerSubtitle}>REALTIME CONFIG</span>
            </div>
            <button type="button" className={styles.btnCloseDrawer} onClick={onClose}>
              ✕
            </button>
          </div>

          <div className={styles.drawerContent}>
            <div className={styles.controlBox}>
              <ParamSlider
                  label="대피 경보 기준치 (Threshold)"
                  valueText={`${params.evacThreshold} pt`}
                  valueClass={styles.warning}
                  min={30}
                  max={90}
                  step={1}
                  value={params.evacThreshold}
                  onChange={(v) => updateParam('evacThreshold', v)}
              />
              <ParamSlider
                  label="출동 알람 지연 시간 (Delay)"
                  valueText={`${params.alarmDelaySec} 초`}
                  valueClass={styles.danger}
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={params.alarmDelaySec}
                  onChange={(v) => updateParam('alarmDelaySec', v)}
              />
              <ParamSlider
                  label="대인 밀집 가중치 (Density Wt.)"
                  valueText={`${params.densityWeightPercent} %`}
                  valueClass={styles.accent}
                  min={0}
                  max={100}
                  step={1}
                  value={params.densityWeightPercent}
                  onChange={(v) => updateParam('densityWeightPercent', v)}
              />
              <ParamSlider
                  label="수동 위험도 가산점 (Score Boost)"
                  valueText={`${params.manualScoreOffset >= 0 ? '+' : ''}${params.manualScoreOffset} pt`}
                  valueClass={styles.purple}
                  min={-30}
                  max={50}
                  step={1}
                  value={params.manualScoreOffset}
                  onChange={(v) => updateParam('manualScoreOffset', v)}
              />
            </div>

            <div className={styles.drawerInfoCard}>
              💡 <b>스마트 관제 파라미터 가이드</b>
              <br />
              슬라이더 조율 시 실시간 스코어 계산 및 경보 발령 임계치가 즉각 갱신됩니다.
            </div>
          </div>
        </aside>

        {/* 드로어 2: 정기 녹화 영상 (1분 단위) */}
        <aside className={`${styles.rightDrawer} ${openDrawer === 'videos' ? styles.open : ''}`}>
          <div className={styles.drawerHeader}>
            <div className={styles.drawerTitle}>
              <span>📼 정기 녹화 영상</span>
              <span className={styles.drawerSubtitle}>1-MIN ROUTINE CLIPS</span>
            </div>
            <button type="button" className={styles.btnCloseDrawer} onClick={onClose}>
              ✕
            </button>
          </div>

          <div className={styles.drawerContent} style={{ overflowY: 'auto' }}>
            <div className={styles.alertLogList} style={{ gap: '10px' }}>
              {isLoading && <div className={styles.logItem} style={{ justifyContent: 'center' }}>로딩 중...</div>}
              {!isLoading && routineClips.length === 0 && (
                <div className={`${styles.logItem} ${styles.safe}`} style={{ justifyContent: 'center' }}>
                  현재 저장된 정기 녹화 영상이 없습니다.
                </div>
              )}
              {!isLoading && routineClips.map((clip) => {
                const date = new Date(clip.startTime || '');
                const timeStr = Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('ko-KR');
                
                return (
                  <div key={clip.clipId} className={styles.logItem} style={{ borderLeft: '4px solid var(--color-accent)' }}>
                    <div className={styles.logItemLeft}>
                      <span className={styles.logTime}>{timeStr}</span>
                      <span className={styles.logDesc}>
                        [구역 {clip.zoneId}] 1분 정기 영상
                      </span>
                    </div>
                    <div className={styles.logItemRight}>
                      {clip.s3ClipUrl && (
                        <button
                          className={styles.btnDownload}
                          onClick={() => window.open(clip.s3ClipUrl!, '_blank')}
                          title="다운로드"
                        >
                          ⬇️ 받기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 드로어 3: 기상 시나리오 스위처 */}
        <aside className={`${styles.rightDrawer} ${openDrawer === 'weather' ? styles.open : ''}`}>
          <div className={styles.drawerHeader}>
            <div className={styles.drawerTitle}>
              <span>🌦️ 기상 시나리오 스위처</span>
              <span className={styles.drawerSubtitle}>WEATHER DRAG CONTROL</span>
            </div>
            <button type="button" className={styles.btnCloseDrawer} onClick={onClose}>
              ✕
            </button>
          </div>

          <div className={styles.drawerContent}>
            <div className={styles.weatherModeDragBox}>
              <div className={styles.controlLabelRow}>
                <span className={styles.controlLabel}>🌦️ 날씨 드래그 변경 (Drag Weather)</span>
                <span className={styles.weatherModeVal}>{WEATHER_SCENARIOS[weatherMode].label}</span>
              </div>
              <CctvWeatherModeSlider mode={weatherMode} onChange={onWeatherModeChange} />
            </div>

            <div className={styles.weatherTimelineSection}>
              <div className={styles.sectionTitle}>⏱️ 기상청 3단계 예측 타임라인 상세</div>
              <CctvWeatherTimeline mode={weatherMode} />
            </div>
          </div>
        </aside>
      </>
  );
}
