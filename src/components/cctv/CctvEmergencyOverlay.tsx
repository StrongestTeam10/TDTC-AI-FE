import styles from './CctvDashboard.module.css';

// 2026-08-06: 원본 index.html의 emergency-block-backdrop + emergency-top-drawer.
// 위험 15초 지속 시 화면 조작을 차단하고, 30초까지 미확인이면 자동 신고가 접수된다.
// 타이머 계산은 useEmergencyTimer가 담당하고 여기서는 표시만 한다.

export interface ActiveEmergency {
  zoneId: number;
  zoneName: string;
  countdownSec: number;
  isAutoDispatched: boolean;
  onConfirm: () => void;
}

interface CctvEmergencyOverlayProps {
  emergencies: ActiveEmergency[];
}

export default function CctvEmergencyOverlay({ emergencies }: CctvEmergencyOverlayProps) {
  if (emergencies.length === 0) return null;

  return (
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        pointerEvents: 'none' // To allow clicking through the container
      }}>
        {emergencies.map((em, index) => (
          <div key={em.zoneId} className={`${styles.emergencyTopDrawer} ${styles.active}`} style={{
            position: 'relative',
            top: 0,
            right: 0,
            left: 0,
            transform: 'none',
            width: '450px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            pointerEvents: 'auto',
            animation: 'slideInRight 0.3s ease-out forwards',
            borderLeft: '5px solid #ef4444'
          }}>
            <div className={styles.emergencyDrawerContent}>
              <div className={styles.emergencyDrawerHeader}>
                <span className={styles.emergencyBadgePulse}>🚨 [{em.zoneName}] 인파 밀집 위험 지속 감지</span>
                <div className={styles.emergencyTimerBox}>
                  <span className={styles.timerLabel}>자동 112/119 신고까지</span>
                  <span className={styles.timerValue}>{em.countdownSec}초</span>
                </div>
              </div>
              <div className={styles.emergencyDrawerBody}>
                <div className={styles.emergencyMsg} style={{ wordBreak: 'keep-all' }}>
                  {em.isAutoDispatched ? (
                      <>
                        🚨 <strong>[30초 경과 - 긴급 자동 신고 접수 완료]</strong><br />
                        해당 구역의 112/119 현장 출동 명령이 발송되었습니다.
                      </>
                  ) : (
                      <>
                        ⚠️ <strong>{em.zoneName}</strong>의 혼잡도 위험 점수가 높습니다.<br />
                        확인 버튼을 누르지 않으면 30초 경과 시 자동으로 긴급 신고가 접수됩니다.
                      </>
                  )}
                </div>
                <button type="button" className={styles.btnEmergencyConfirm} onClick={em.onConfirm}>
                  {em.isAutoDispatched
                      ? '🚨 [112/119 긴급 출동 완료 - 조작 해제]'
                      : '🚨 [확인 및 관람 조작 해제]'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
  );
}
