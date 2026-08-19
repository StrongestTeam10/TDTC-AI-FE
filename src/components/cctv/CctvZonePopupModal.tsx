import { CCTV_API_BASE_URL } from '../../api/cctvClient';
import React from 'react';
import styles from './CctvDashboard.module.css';
import { cctvZoneName } from '../../constants/cctvZone';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import CctvMetricCards from './CctvMetricCards';
import CctvRiskChartCard from './CctvRiskChartCard';

interface Props {
  zoneId: number;
  onClose: () => void;
  // useRef<HTMLVideoElement>(null) 의 타입은 RefObject<HTMLVideoElement | null> 이다.
  // (React 19 타입 정의 기준) null 을 빼면 호출부에서 대입이 막힌다.
  metrics: any;
  cri: number;
  statusResult: any;
  history: any;
  showEmergencyActions?: boolean;
  onResolveEmergency?: (type: 'dispatch' | 'false_alarm') => void;
}

export default function CctvZonePopupModal({
  zoneId,
  onClose,
  metrics,
  cri,
  statusResult,
  history,
  showEmergencyActions,
  onResolveEmergency
}: Props) {
  // 2026-08-19: 삼항으로 이름을 만들던 것을 constants/cctvZone.ts 로 모았다.
  // 예전 방식은 목록에 없는 id 가 오면 전부 '북측'으로 보였다.
  // 여기서 오는 이름은 '남측 구역'처럼 '구역'까지 포함하므로 뒤에 덧붙이지 않는다.
  const zoneName = cctvZoneName(zoneId);
  const [isClosing, setIsClosing] = React.useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  // 2026-08-19 (접근성): 닫힘 애니메이션 250ms 뒤에 onClose 를 부르는 구조는 그대로 두되
  //  - isClosing 가드: Escape 연타나 배경 더블클릭으로 타이머가 겹치지 않게
  //  - ref 로 타이머를 들고 언마운트 시 정리: 애니메이션 도중 부모가 먼저 사라지면
  //    없어진 컴포넌트에서 onClose 가 불리던 문제(3차 감사 P2)
  const handleClose = React.useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 250); // CSS 애니메이션 시간에 맞춤
  }, [isClosing, onClose]);

  React.useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  // 2026-08-20: Escape·초점 이동/복원·트랩·스크롤 잠금을 hooks/useModalDismiss 로.
  // D 작업에서 여기 직접 넣었던 Escape/초점 로직을 공용 훅으로 옮긴 것이다.
  // handleClose(isClosing 가드 포함)를 넘겨야 Escape 연타에도 타이머가 안 겹친다.
  // 배경 클릭 닫기는 마우스 편의 기능으로 그대로 두고, 키보드 경로는 훅이 보장한다.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useModalDismiss(dialogRef, handleClose);

  return (
    <div className={`${styles.layerPopupOverlay} ${isClosing ? styles.closing : ''}`} onClick={handleClose}>
      <div
        ref={dialogRef}
        className={styles.layerPopupContent}
        role="dialog"
        aria-modal="true"
        aria-label={`${zoneName} 실시간 대시보드`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.layerPopupVideoSide}>
          <>
            {/* 블러 배경 처리 */}
            <img
              className={styles.layerPopupVideoBlur}
              src={`${CCTV_API_BASE_URL}/api/v1/cctv/stream?zone_id=${zoneId}&ngrok-skip-browser-warning=true`}
              alt={`Zone ${zoneId} Blur Background`}
            />
            {/* 메인 영상 */}
            <img
              className={styles.layerPopupVideoMain}
              src={`${CCTV_API_BASE_URL}/api/v1/cctv/stream?zone_id=${zoneId}&ngrok-skip-browser-warning=true`}
              alt={`Zone ${zoneId} Live Stream`}
            />
            <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.7)', padding: '6px 12px', borderRadius: 8, color: '#fff', fontWeight: 'bold', zIndex: 20 }}>
              {zoneName}
            </div>
          </>
          
        </div>
        
        <div className={styles.layerPopupInfoSide}>
          <div className={styles.layerPopupHeader}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', width: '100%' }}>
              <div className={styles.cardTitle} style={{ fontSize: '1.25rem', padding: 0 }}>
                {zoneName} 실시간 대시보드
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={handleClose}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {showEmergencyActions && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button 
                  onClick={() => {
                    onResolveEmergency?.('dispatch');
                    handleClose();
                  }}
                  style={{ flex: 1, padding: '12px', backgroundColor: 'var(--color-danger)', color: '#fff', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                >
                  🚨 현장 출동 지시
                </button>
                <button 
                  onClick={() => {
                    onResolveEmergency?.('false_alarm');
                    handleClose();
                  }}                                                                        
                  style={{ flex: 1, padding: '12px', backgroundColor: 'rgb(var(--surface-raised-rgb))', color: 'var(--text-color)', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                >
                  ✅ 오경보 해제
                </button>
              </div>
            )}
            <div className={styles.metricsCardGridVertical}>
              <CctvMetricCards
                  pedestrianCount={metrics.pedestrianCount}
                  occupancyRate={metrics.occupancyRate}
                  stoppageLabel={`${metrics.stagnationSec}초`}
                  isEstimated={metrics.isEstimated}
                  layout="vertical"
              />
            </div>
            
            <CctvRiskChartCard
                cri={cri}
                status={statusResult.status}
                statusLabel={statusResult.label}
                barColor={statusResult.barColor}
                history={history}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
