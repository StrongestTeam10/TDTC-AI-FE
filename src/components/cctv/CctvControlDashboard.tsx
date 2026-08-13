import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './CctvDashboard.module.css';
import CctvEmergencyOverlay from './CctvEmergencyOverlay';
import CctvMetricCards from './CctvMetricCards';
import CctvZoneGallery from './CctvZoneGallery';
import CctvZonePopupModal from './CctvZonePopupModal';
import CctvRiskChartCard from './CctvRiskChartCard';
import CctvVideoPanel from './CctvVideoPanel';
import CctvWeatherCard from './CctvWeatherCard';
import ErrorBanner from '../ui/ErrorBanner';
import { fetchCctvResultVideoUrl, uploadCctvVideo, triggerCctvAlert } from '../../api/cctvClient';
import { fetchUnresolvedAlerts, fetchVideoClips, fetchPostReports } from '../../api/client';
import { WEATHER_SCENARIOS } from '../../constants/weatherScenario';
import { useCctvStream } from '../../hooks/useCctvStream';
import { useCriScore } from '../../hooks/useCriScore';
import { useEmergencyTimer } from '../../hooks/useEmergencyTimer';
import type { ControlParams, EmergencyAlert, WeatherMode, VideoClip } from '../../types/cctv';
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
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [expandedZoneId, setExpandedZoneId] = useState<number | null>(null);
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('PREDICTIVE_RAIN');

  // ----- 영상 재생 상태 -----
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [totalFrames, setTotalFrames] = useState(0);
  const [isPlaying, setPlaying] = useState(false);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState('CCTV 영상을 업로드해 주세요');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastFrameUpdateRef = useRef(0);

  // ----- AI 파이프라인 실시간 스트림 -----
  const stream = useCctvStream();

  // ----- BE 미해결 알람 -----
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [postReports, setPostReports] = useState<any[]>([]);
  const [isAlertLoading, setAlertLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setAlertLoading(true);
    setAlertError(null);
    try {
      const [alertsData, clipsData, reportsData] = await Promise.all([
        fetchUnresolvedAlerts(),
        fetchVideoClips(selectedZoneId === null ? undefined : selectedZoneId),
        fetchPostReports(selectedZoneId === null ? undefined : selectedZoneId)
      ]);
      setAlerts(alertsData);
      setVideoClips(clipsData);
      setPostReports(reportsData);
    } catch (err) {
      console.error('미해결 알람 로드 실패', err);
      setAlertError(toDisplayErrorMessage(err, '알람 이력을 불러오지 못했습니다.'));
    } finally {
      setAlertLoading(false);
    }
  }, [selectedZoneId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // ----- 현재 프레임의 관제 지표 결정 -----
  // 우선순위: AI 스트림 실측 > 정적 폴백(원본 영상 604프레임) > 0
  // 스트림 데이터가 하나라도 들어온 뒤에는 폴백을 조회하지 않는다. 업로드한 영상을
  // 보고 있는데 원본 영상의 인원수가 섞여 나오면 안 되기 때문이다(원본 동작 유지).
  const hasStreamData = useMemo(() => {
    return Object.values(stream.multiZoneFrameData).some(zoneData => Object.keys(zoneData).length > 0);
  }, [stream.multiZoneFrameData]);

  const rawZones = useMemo(() => {
    const getZoneData = (zId: number) => {
      const streamed = stream.multiZoneFrameData[zId]?.[currentFrame];
      if (streamed) {
        return {
          pedestrianCount: streamed.pedestrianCount,
          occupancyRate: streamed.occupancyRate,
          stagnationSec: streamed.stagnationSec,
          criScore: streamed.criScore,
          isEstimated: false
        };
      }
      return {
        pedestrianCount: 0,
        occupancyRate: 0,
        stagnationSec: 0,
        criScore: null,
        isEstimated: true
      };
    };
    return [getZoneData(1), getZoneData(2), getZoneData(3)];
  }, [stream.multiZoneFrameData, currentFrame]);

  // 구역별 개별 CRI 스코어 및 타이머 산출 (항상 3구역 모두 백그라운드 추적)
  const zone1Cri = useCriScore({ pedestrianCount: rawZones[0].pedestrianCount, incomingCriScore: rawZones[0].criScore, weatherMode, params });
  const zone2Cri = useCriScore({ pedestrianCount: rawZones[1].pedestrianCount, incomingCriScore: rawZones[1].criScore, weatherMode, params });
  const zone3Cri = useCriScore({ pedestrianCount: rawZones[2].pedestrianCount, incomingCriScore: rawZones[2].criScore, weatherMode, params });

  const zone1Timer = useEmergencyTimer(zone1Cri.statusResult.status, params.alarmDelaySec);
  const zone2Timer = useEmergencyTimer(zone2Cri.statusResult.status, params.alarmDelaySec);
  const zone3Timer = useEmergencyTimer(zone3Cri.statusResult.status, params.alarmDelaySec);

  const zonesData = useMemo(() => [
    { id: 1, name: '남측 구역', raw: rawZones[0], criData: zone1Cri, timer: zone1Timer },
    { id: 2, name: '중앙 구역', raw: rawZones[1], criData: zone2Cri, timer: zone2Timer },
    { id: 3, name: '북측 구역', raw: rawZones[2], criData: zone3Cri, timer: zone3Timer },
  ], [rawZones, zone1Cri, zone2Cri, zone3Cri, zone1Timer, zone2Timer, zone3Timer]);

  const metrics = useMemo(() => {
    // 1. 단일 구역 선택 시
    if (selectedZoneId !== null) {
      const z = rawZones[selectedZoneId - 1];
      return {
        pedestrianCount: z.pedestrianCount,
        occupancyRate: z.occupancyRate,
        stagnationSec: z.stagnationSec,
        incomingCriScore: z.criScore,
        highestRiskZoneId: selectedZoneId,
        isEstimated: z.isEstimated,
      };
    }

    // 2. 종합 대시보드 (3개 구역 데이터 병합)
    const z1 = rawZones[0];
    const z2 = rawZones[1];
    const z3 = rawZones[2];

    const totalCount = z1.pedestrianCount + z2.pedestrianCount + z3.pedestrianCount;
    // 공간 밀집률 평균 계산 시 소수점이 길어지는 것을 방지 (소수점 1자리까지 반올림)
    const avgOccupancy = Math.round(((z1.occupancyRate + z2.occupancyRate + z3.occupancyRate) / 3) * 10) / 10;
    const maxStagnation = Math.max(z1.stagnationSec, z2.stagnationSec, z3.stagnationSec);
    let maxCriScore: number | null = null;
    let highestRiskZoneId: number | null = 1;
    [z1, z2, z3].forEach((z, idx) => {
      if (z.criScore !== null && (maxCriScore === null || z.criScore > maxCriScore)) {
        maxCriScore = z.criScore;
        highestRiskZoneId = idx + 1;
      }
    });

    return {
      pedestrianCount: totalCount,
      occupancyRate: Math.min(100, avgOccupancy), // 최대 100%
      stagnationSec: maxStagnation,
      incomingCriScore: maxCriScore,
      highestRiskZoneId,
      isEstimated: z1.isEstimated && z2.isEstimated && z3.isEstimated,
    };
  }, [rawZones, selectedZoneId]);

  // ----- 위험도 산출 & 비상 타이머 (글로벌 차트용 단일 인스턴스) -----
  const { cri, statusResult, history, reset: resetCri } = useCriScore({
    pedestrianCount: metrics.pedestrianCount,
    incomingCriScore: metrics.incomingCriScore,
    weatherMode,
    params,
  });
  
  // ----- [Method A] 수동/자동 신고 연동 상태 (구역별 분리) -----
  const [actionTakenState, setActionTakenState] = useState<Record<number, boolean>>({ 1: false, 2: false, 3: false });
  
  // 위험 상태가 해제되거나, 타이머가 0초(countdown 30초)로 리셋되면 actionTaken 초기화
  useEffect(() => {
    zonesData.forEach(z => {
      if (z.criData.statusResult.status !== 'danger' || z.timer.countdownSec === 30) {
        if (actionTakenState[z.id]) {
          setActionTakenState(prev => ({ ...prev, [z.id]: false }));
        }
      }
    });
  }, [zonesData, actionTakenState]);

  // 30초 경과 시 자동 신고(AUTO_REPORT) 발송 (독립 타이머 기반)
  useEffect(() => {
    zonesData.forEach(z => {
      if (z.timer.isAutoDispatched && !actionTakenState[z.id]) {
        setActionTakenState(prev => ({ ...prev, [z.id]: true }));
        triggerCctvAlert('AUTO_REPORT', z.id).catch((err) => {
          console.error(`[${z.id}구역] 자동 신고 API 호출 실패:`, err);
        });
      }
    });
  }, [zonesData, actionTakenState]);

  // 오버레이용 알람 배열 구성
  const activeEmergencies = useMemo(() => {
    return zonesData
      .filter(z => z.timer.isBlocking)
      .map(z => ({
        zoneId: z.id,
        zoneName: z.name,
        countdownSec: z.timer.countdownSec,
        isAutoDispatched: z.timer.isAutoDispatched,
        onConfirm: () => {
          z.timer.confirm();
          setExpandedZoneId(z.id);
        }
      }));
  }, [zonesData]);

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
        setTotalFrames(0);

        setLocalVideoUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(file);
        });
        setFileLabel(file.name);
        setPlaying(true);

        stream.beginAnalysis(`🤖 [AI 모델링 분석 대기 중...] ${file.name}`);

        try {
          await uploadCctvVideo(file, selectedZoneId || 1);
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
      [resetCri, stream, selectedZoneId]
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

  const frameTimeLabel = `${(currentFrame / FRAMES_PER_SECOND).toFixed(1)}s`;

  const currentZoneName = selectedZoneId === null ? '종합대시보드' : selectedZoneId === 1 ? '남측 구역' : selectedZoneId === 2 ? '중앙 구역' : '북측 구역';

  return (
      <div className={styles.dashboardRoot}>
        <main className={styles.mainWrapper}>
          {uploadError && (
              <div style={{ marginBottom: 16 }}>
                <ErrorBanner message={uploadError} onRetry={() => setUploadError(null)} />
              </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '16px' }}>
          </div>

          <CctvZoneGallery
            activeZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onExpandZone={setExpandedZoneId}
            videoRef={videoRef}
            videoSrc={videoSrc}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
          />

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '24px 0 32px 0', minHeight: '32px' }}>
            <div style={{ fontWeight: '800', fontSize: '1.75rem', color: 'var(--text-main)' }}>
              {currentZoneName}
            </div>
          </div>

          <div className={styles.inlineDashboardGrid}>
            <div className={styles.verticalMetricsWrapper} style={{ position: 'relative' }}>
              <div className={`${styles.aiStatusBadgeInline} ${styles[stream.status]}`} style={{ position: 'absolute', left: 0, top: '-40px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                AI 서버 {stream.status === 'open' ? '연결됨 (실시간 데이터)' : stream.status === 'connecting' ? '연결 중...' : '미연결 (폴백 데이터)'}
              </div>
              <CctvMetricCards
                  pedestrianCount={metrics.pedestrianCount}
                  occupancyRate={metrics.occupancyRate}
                  stoppageLabel={formatStoppage(metrics.stagnationSec)}
                  isEstimated={metrics.isEstimated}
                  layout="vertical"
              />
            </div>

            <div className={styles.inlineLogBox}>
              <div className={styles.inlineLogTitle}>🔔 미해결 알람 및 관제 로그</div>
              <div className={styles.inlineLogContent}>
                {alerts.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    현재 해결되지 않은 긴급 알람이 없습니다.
                  </div>
                ) : (
                  alerts
                    .filter(a => !selectedZoneId || a.zoneId === selectedZoneId)
                    .sort((a, b) => new Date(b.alertedAt).getTime() - new Date(a.alertedAt).getTime()) // 최신순 정렬
                    .map((alert) => {
                      // 1. 해당 알람과 연결된 PDF 명세서 찾기 (alert_id)
                      const pdf = postReports.find(r => r.alert_id === alert.alertId);
                      
                      // 2. 해당 알람 시간(alertedAt)과 구역(zoneId)에 근접한 위험 클립(RISK) 찾기
                      // (alertedAt이 35초 클립 시간대에 포함된다고 가정하거나 단순 시간차로 매핑)
                      const alertTime = new Date(alert.alertedAt).getTime();
                      const clip = videoClips.find(c => 
                        c.clipType === 'RISK' && 
                        c.zoneId === alert.zoneId && 
                        c.startTime && Math.abs(new Date(c.startTime).getTime() - alertTime) < 60000 // 1분 이내 생성된 RISK 클립
                      );

                      return (
                        <div key={`alert-${alert.alertId}`} className={styles.inlineLogItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className={styles.inlineLogTime}>
                              {new Date(alert.alertedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              {` [구역 ${alert.zoneId}]`}
                            </div>
                            <div className={styles.inlineLogDesc} style={{ color: alert.isResolved ? '#10b981' : '#ef4444' }}>
                              {alert.alertType} ({alert.isResolved ? 'RESOLVED' : 'UNRESOLVED'})
                            </div>
                          </div>
                          
                          {(clip || pdf) && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                              {clip && (
                                <button className={styles.btnInlineDownload} onClick={() => window.open(clip.s3ClipUrl || '', '_blank')} style={{ background: '#ef4444', border: 'none', color: '#fff' }}>
                                  ⬇️ 위험 클립 (35s)
                                </button>
                              )}
                              {pdf && (
                                <button className={styles.btnInlineDownload} onClick={() => window.open(pdf.s3_pdf_url, '_blank')} style={{ background: '#3b82f6', border: 'none', color: '#fff' }}>
                                  ⬇️ PDF 명세서
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                  })
                )}
              </div>
            </div>
            
            <div className={styles.inlineLogBox}>
              <div className={styles.inlineLogTitle}>🎥 정기 녹화 영상 (raw-videos)</div>
              <div className={styles.inlineLogContent}>
                {videoClips.filter(c => (c.clipType === 'TEMP' || c.clipType === 'LIVE') && (!selectedZoneId || c.zoneId === selectedZoneId)).length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    녹화된 영상이 없습니다.
                  </div>
                ) : (
                  videoClips
                    .filter(c => (c.clipType === 'TEMP' || c.clipType === 'LIVE') && (!selectedZoneId || c.zoneId === selectedZoneId))
                    .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime()) // 최신순 정렬
                    .map((clip) => (
                    <div key={`video-${clip.clipId}`} className={styles.inlineVideoItem}>
                      <div>
                        <div className={styles.inlineLogTime}>
                          {new Date(clip.startTime || '').toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          {` [구역 ${clip.zoneId}]`}
                        </div>
                        <div className={styles.inlineLogDesc}>1분 정기 영상 (raw)</div>
                      </div>
                      <button className={styles.btnInlineDownload} onClick={() => window.open(clip.s3ClipUrl || '', '_blank')}>
                        ⬇️ 받기
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.inlineLogBox} style={{ padding: 0, background: 'transparent', border: 'none', boxShadow: 'none' }}>
              <CctvRiskChartCard
                  cri={cri}
                  status={statusResult.status}
                  statusLabel={statusResult.label}
                  barColor={statusResult.barColor}
                  history={history}
              />
            </div>
          </div>
        </main>

        {expandedZoneId && (() => {
          const targetZone = zonesData.find(z => z.id === expandedZoneId)!;
          const isShowActions = targetZone.criData.statusResult.status === 'danger' && targetZone.timer.countdownSec > 0 && targetZone.timer.countdownSec <= 15 && !targetZone.timer.isBlocking && !actionTakenState[expandedZoneId];
          return (
            <CctvZonePopupModal
              zoneId={expandedZoneId}
              onClose={() => setExpandedZoneId(null)}
              videoRef={videoRef}
              videoSrc={videoSrc}
              metrics={{
                pedestrianCount: targetZone.raw.pedestrianCount,
                occupancyRate: targetZone.raw.occupancyRate,
                stagnationSec: targetZone.raw.stagnationSec,
                incomingCriScore: targetZone.raw.criScore,
                highestRiskZoneId: expandedZoneId,
                isEstimated: targetZone.raw.isEstimated
              }}
              cri={targetZone.criData.cri}
              statusResult={targetZone.criData.statusResult}
              history={targetZone.criData.history}
              showEmergencyActions={isShowActions}
              onResolveEmergency={(type) => {
                setActionTakenState(prev => ({ ...prev, [expandedZoneId]: true }));
                if (type === 'dispatch') {
                  triggerCctvAlert('MANUAL_REPORT', expandedZoneId)
                    .then(() => console.log('수동 신고 접수 완료'))
                    .catch((err) => console.error('수동 신고 접수 실패:', err));
                  targetZone.timer.confirm();
                } else if (type === 'false_alarm') {
                  targetZone.timer.confirm();
                }
              }}
            />
          );
        })()}

        <CctvEmergencyOverlay emergencies={activeEmergencies} />
      </div>
  );
}
