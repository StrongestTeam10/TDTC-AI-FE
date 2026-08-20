import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CctvDashboard.module.css';
import CctvEmergencyOverlay from './CctvEmergencyOverlay';
import CctvMetricCards from './CctvMetricCards';
import CctvZoneGallery from './CctvZoneGallery';
import CctvZonePopupModal from './CctvZonePopupModal';
import CctvRiskChartCard from './CctvRiskChartCard';
import ErrorBanner from '../ui/ErrorBanner';
import { triggerCctvAlert } from '../../api/cctvClient';
import { fetchUnresolvedAlerts, fetchVideoClips, fetchPostReports, resolveAlert } from '../../api/client';
import { CCTV_ZONES, cctvZoneName } from '../../constants/cctvZone';
import { useCctvStream } from '../../hooks/useCctvStream';
import { useCriScore } from '../../hooks/useCriScore';
import { useEmergencyTimer } from '../../hooks/useEmergencyTimer';
import type { ControlParams, EmergencyAlert, WeatherMode, VideoClip, PostReport } from '../../types/cctv';
import { DEFAULT_CONTROL_PARAMS, formatStoppage } from '../../utils/criScore';
import { toDisplayErrorMessage } from '../../utils/errorMessage';

// 2026-08-06 신규: public/mangwon/index.html + dashboard.js를 대체하는 React 관제 대시보드.
//
// 기존에는 이 화면 전체가 public/ 아래 정적 HTML이었고 DashboardPage가 그걸 iframe으로
// 끼워 넣고 있었다. iframe 안이라 (1) position:fixed 오버레이가 앱 뷰포트를 못 덮고
// (2) 로그인 JWT가 전달되지 않아 BE 데이터를 하나도 못 읽고 (3) 앱 다크모드와 따로 놀았다.
// 세 문제 모두 iframe을 없애면서 사라진다.
//
// (2026-08-20: 여기 있던 FRAMES_PER_SECOND / FRAME_UPDATE_THROTTLE_MS 는 MP4 재생
//  위치를 프레임으로 환산하던 상수였다. 03ec190 에서 MP4 업로드가 MJPEG 실시간 뷰어로
//  바뀌며 쓰는 곳이 없어졌고, 지금 관제 프레임은 useCctvStream 의 liveFrameId 가 준다.)

export default function CctvControlDashboard() {
  // ----- 관제 파라미터 & 기상 시나리오 -----
  // 2026-08-20: setParams / setWeatherMode 는 d20913f UI 개편 때 조절 패널(CctvWeatherCard,
  // onParamsChange)이 빠지면서 호출부가 없어졌다. 값 자체는 아래 useCriScore /
  // useEmergencyTimer 가 계속 읽으므로 state 는 남기고, setter 만 _ 로 "의도적 미사용"
  // 표시한다. 조절 UI 를 되살릴 때 _ 를 떼고 쓰면 된다.
  const [params, _setParams] = useState<ControlParams>(DEFAULT_CONTROL_PARAMS);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [expandedZoneId, setExpandedZoneId] = useState<number | null>(null);
  const [weatherMode, _setWeatherMode] = useState<WeatherMode>('PREDICTIVE_RAIN');

  // ----- AI 파이프라인 실시간 스트림 -----
  const stream = useCctvStream();

  // ----- BE 미해결 알람 -----
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [postReports, setPostReports] = useState<PostReport[]>([]);
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
  // AI 스트림 실측이 있으면 그 값을, 없으면 0(isEstimated=true)을 쓴다.
  // (2026-08-20: 예전엔 "정적 폴백 데이터셋(원본 영상 604프레임)"이 한 단계 더 있어서
  //  hasStreamData 로 폴백 조회를 막았는데, 그 데이터셋이 46bfabf 에서 사라져 가드할
  //  대상이 없어졌다. 계산만 남아 있던 hasStreamData 를 제거했다.)
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

  // 2026-08-19: id/이름을 constants/cctvZone.ts 에서 가져온다. 세 줄로 펼쳐 둔 것은
  // 위의 useCriScore / useEmergencyTimer 가 구역당 하나씩 최상위 호출이라 그렇다
  // (훅은 개수가 변하는 반복문에서 부를 수 없다). 구역을 늘리려면 그 훅 호출도
  // 같이 늘려야 한다 - 자세한 배경은 constants/cctvZone.ts 주석 참고.
  const zonesData = useMemo(() => [
    { ...CCTV_ZONES[0], raw: rawZones[0], criData: zone1Cri, timer: zone1Timer },
    { ...CCTV_ZONES[1], raw: rawZones[1], criData: zone2Cri, timer: zone2Timer },
    { ...CCTV_ZONES[2], raw: rawZones[2], criData: zone3Cri, timer: zone3Timer },
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

  const currentZoneName = cctvZoneName(selectedZoneId);

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
            <div style={{ fontWeight: '800', fontSize: '1.35rem', color: 'var(--text-color)' }}>
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
                <button type="button" className={styles.btnRefresh} onClick={() => loadAlerts('ALARM')} disabled={loadingType === 'ALARM'} title="새로고침" aria-label="미해결 알람 및 관제 로그 새로고침">
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingType === 'ALARM' ? styles.spinIcon : ''}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  새로고침
                </button>
              </div>

              <div className={styles.inlineLogContent}>
                {/* 2026-08-20: alertError 는 d20913f 개편 때 표시 컴포넌트가 사라지면서
                    set 만 되고 어디에도 안 그려지고 있었다. 10초 폴링이 실패해도 콘솔
                    말고는 아무 신호가 없었다(video-clips 500 이 실제로 그 경우였다).
                    같은 커밋에서 import 만 남고 안 쓰이던 ErrorBanner 로 다시 연결한다. */}
                {alertError && <ErrorBanner message={alertError} onRetry={() => loadAlerts('ALARM')} />}
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
                                <div className={styles.inlineLogDesc} style={{ color: alert.isResolved ? 'var(--color-safe)' : 'var(--color-danger)' }}>
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
                                <button className={styles.btnInlineDownload} onClick={() => window.open(clip.s3ClipUrl || '', '_blank')} style={{ background: 'var(--color-danger)', border: 'none', color: '#fff' }}>
                                  ⬇️ 위험 클립 (35s)
                                </button>
                              )}
                              {pdf?.s3PdfUrl && (
                                <button className={styles.btnInlineDownload} onClick={() => window.open(pdf.s3PdfUrl!, '_blank')} style={{ background: 'var(--color-accent)', border: 'none', color: '#fff' }}>
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
                <button type="button" className={styles.btnRefresh} onClick={() => loadAlerts('VIDEO')} disabled={loadingType === 'VIDEO'} title="새로고침" aria-label="정기 녹화 영상 새로고침">
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingType === 'VIDEO' ? styles.spinIcon : ''}>
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