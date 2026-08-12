import React, { RefObject } from 'react';
import styles from './CctvDashboard.module.css';
import CctvMetricCards from './CctvMetricCards';
import CctvRiskChartCard from './CctvRiskChartCard';

interface Props {
  zoneId: number;
  onClose: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  videoSrc: string | null;
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
  videoRef,
  videoSrc,
  metrics,
  cri,
  statusResult,
  history,
  showEmergencyActions,
  onResolveEmergency
}: Props) {
  const zoneName = zoneId === 1 ? "남측" : zoneId === 2 ? "중앙" : "북측";
  const [isClosing, setIsClosing] = React.useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 250); // CSS 애니메이션 시간에 맞춤
  };

  return (
    <div className={`${styles.layerPopupOverlay} ${isClosing ? styles.closing : ''}`} onClick={handleClose}>
      <div className={styles.layerPopupContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.layerPopupVideoSide}>
          {videoSrc ? (
            <>
              {/* 블러 배경 처리 */}
              <video
                className={styles.layerPopupVideoBlur}
                src={videoSrc}
                muted
                loop={false}
                playsInline
                autoPlay
              />
              {/* 원본 영상 */}
              <video
                ref={videoRef}
                className={styles.layerPopupVideoMain}
                src={videoSrc}
                muted
                loop={false}
                playsInline
                autoPlay
              />
              <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.7)', padding: '6px 12px', borderRadius: 8, color: '#fff', fontWeight: 'bold', zIndex: 20 }}>
                {zoneName} 구역
              </div>
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#111827' }} />
          )}
        </div>
        
        <div className={styles.layerPopupInfoSide}>
          <div className={styles.layerPopupHeader}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', width: '100%' }}>
              <div className={styles.cardTitle} style={{ fontSize: '1.25rem', padding: 0 }}>
                {zoneName} 구역 실시간 대시보드
              </div>
              <button 
                onClick={handleClose}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {showEmergencyActions && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button 
                  onClick={() => onResolveEmergency?.('dispatch')}
                  style={{ flex: 1, padding: '12px', backgroundColor: '#ef4444', color: 'white', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                >
                  🚨 현장 출동 지시
                </button>
                <button 
                  onClick={() => onResolveEmergency?.('false_alarm')}
                  style={{ flex: 1, padding: '12px', backgroundColor: '#334155', color: 'white', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
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
