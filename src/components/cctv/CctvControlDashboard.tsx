import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './CctvDashboard.module.css';
import CctvEmergencyOverlay from './CctvEmergencyOverlay';
import CctvMetricCards from './CctvMetricCards';
import CctvZoneGallery from './CctvZoneGallery';
import CctvZonePopupModal from './CctvZonePopupModal';
import CctvRiskChartCard from './CctvRiskChartCard';
import CctvWeatherCard from './CctvWeatherCard';
import ErrorBanner from '../ui/ErrorBanner';
import { fetchCctvResultVideoUrl, triggerCctvAlert } from '../../api/cctvClient';
import { fetchUnresolvedAlerts, fetchVideoClips, fetchPostReports, resolveAlert } from '../../api/client';
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

  // ----- AI 파이프라인 실시간 스트림 -----
  const stream = useCctvStream();

  // ----- BE 미해결 알람 -----
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [postReports, setPostReports] = useState<any[]>([]);
  const [loadingType, setLoadingType] = useState<'ALARM' | 'VIDEO' | 'NONE'>('NONE');
  const [alertError, setAlertError] = useState<string | null>(null);

  const loadAlerts = useCallback(async (type: 'ALARM' | 'VIDEO' | 'NONE' = 'NONE') => {
    if (type !== 'NONE') setLoadingType(type); // 수동 클릭일 때만 해당 버튼 로딩 ON
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
      setLoadingType('NONE'); // 무조건 로딩 OFF
    }
  }, [selectedZoneId]);


  useEffect(() => {
    loadAlerts('NONE'); // 처음엔 몰래 가져오기
    const intervalId = setInterval(() => {
      loadAlerts('NONE'); // 10초마다 몰래 가져오기
    }, 10000);
    return () => clearInterval(intervalId);
  }, [loadAlerts]);

  const handleResolveAlert = async (alertId: number) => {
    try {
      await resolveAlert(alertId);
      loadAlerts('NONE');
    } catch (err) {
      console.error("알람 해결 처리 실패", err);
      alert("알람 해결 처리에 실패했습니다.");
    }
  };


  // ----- 현재 프레임의 관제 지표 결정 -----
  // 우선순위: AI 스트림 실측 > 정적 폴백(원본 영상 604프레임) > 0
  // 스트림 데이터가 하나라도 들어온 뒤에는 폴백을 조회하지 않는다. 업로드한 영상을
  // 보고 있는데 원본 영상의 인원수가 섞여 나오면 안 되기 때문이다(원본 동작 유지).
  const hasStreamData = useMemo(() => {
    return Object.values(stream.multiZoneFrameData).some(zoneData => Object.keys(zoneData).length > 0);
  }, [stream.multiZoneFrameData]);

  const rawZones = useMemo(() => {
    const getZoneData = (zId: number) => {
      const targetFrame = stream.liveFrameId || 1;
      const streamed = stream.multiZoneFrameData[zId]?.[targetFrame];
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
  }, [stream.multiZoneFrameData, stream.liveFrameId]);


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

  // ----- 종합 대시보드 전용 글로벌 차트 인스턴스 (선택된 영상과 무관하게 항상 전체 상태 추적) -----
  const globalMetrics = useMemo(() => {
    let maxCri: number | null = null;
    rawZones.forEach(z => { 
      if (z.criScore !== null && (maxCri === null || z.criScore > maxCri)) maxCri = z.criScore; 
    });
    return {
      count: rawZones[0].pedestrianCount + rawZones[1].pedestrianCount + rawZones[2].pedestrianCount,
      criScore: maxCri
    };
  }, [rawZones]);

  const globalCriData = useCriScore({
    pedestrianCount: globalMetrics.count,
    incomingCriScore: globalMetrics.criScore,
    weatherMode,
    params,
  });

  // 💡 현재 화면에 보여줄 진짜 차트 데이터 (종합 화면이면 전체 차트, 개별 화면이면 그 구역만의 차트)
  const chartData = selectedZoneId === null 
    ? globalCriData 
    : zonesData.find(z => z.id === selectedZoneId)!.criData;

  
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

  const currentZoneName = selectedZoneId === null ? '종합대시보드' : selectedZoneId === 1 ? '남측 구역' : selectedZoneId === 2 ? '중앙 구역' : '북측 구역';

  return (
      <div className={styles.dashboardRoot}>
        <main className={styles.mainWrapper}>
        
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '16px' }}>
          </div>

          <CctvZoneGallery
            activeZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onExpandZone={setExpandedZoneId}
          />


          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0px 0 0px 0', minHeight: '32px' }}>
            <div style={{ fontWeight: '800', fontSize: '1.35rem', color: 'var(--text-main)' }}>
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
              <div className={styles.inlineLogTitle}>
                <span>🔔 미해결 알람 및 관제 로그</span>
                <button className={styles.btnRefresh} onClick={() => loadAlerts('ALARM')} disabled={loadingType === 'ALARM'} title="새로고침">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingType === 'ALARM' ? styles.spinIcon : ''}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  새로고침
                </button>
              </div>

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
                      const pdf = postReports.find(r => r.alertId === alert.alertId);
                      
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div className={styles.inlineLogTime}>
                                  {new Date(alert.alertedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  {` [구역 ${alert.zoneId}]`}
                                </div>
                                <div className={styles.inlineLogDesc} style={{ color: alert.isResolved ? '#10b981' : '#ef4444' }}>
                                  {alert.alertType} ({alert.isResolved ? 'RESOLVED' : 'UNRESOLVED'})
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                {!alert.isResolved && (
                                  <button
                                    onClick={() => handleResolveAlert(alert.alertId)}
                                    style={{
                                      background: '#3b82f6', color: '#fff', border: 'none',
                                      borderRadius: '4px', padding: '4px 8px', fontSize: '0.7rem', 
                                      cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    확인(해결)
                                  </button>
                                )}
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
                                <button className={styles.btnInlineDownload} onClick={() => window.open(pdf.s3PdfUrl, '_blank')} style={{ background: '#3b82f6', border: 'none', color: '#fff' }}>
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
              <div className={styles.inlineLogTitle}>
                <span>🎥 정기 녹화 영상 </span>
                <button className={styles.btnRefresh} onClick={() => loadAlerts('VIDEO')} disabled={loadingType === 'VIDEO'} title="새로고침">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingType === 'VIDEO' ? styles.spinIcon : ''}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  새로고침
                </button>
              </div>

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
                        <div className={styles.inlineLogDesc}>정기 영상</div>
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
                  cri={chartData.cri}
                  status={chartData.statusResult.status}
                  statusLabel={chartData.statusResult.label}
                  barColor={chartData.statusResult.barColor}
                  history={chartData.history}
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