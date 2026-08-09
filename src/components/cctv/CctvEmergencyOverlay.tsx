import styles from './CctvDashboard.module.css';

// 2026-08-06: 원본 index.html의 emergency-block-backdrop + emergency-top-drawer.
// 위험 15초 지속 시 화면 조작을 차단하고, 30초까지 미확인이면 자동 신고가 접수된다.
// 타이머 계산은 useEmergencyTimer가 담당하고 여기서는 표시만 한다.

interface CctvEmergencyOverlayProps {
  isVisible: boolean;
  countdownSec: number;
  isAutoDispatched: boolean;
  onConfirm: () => void;
}

export default function CctvEmergencyOverlay({
  isVisible,
  countdownSec,
  isAutoDispatched,
  onConfirm,
}: CctvEmergencyOverlayProps) {
  const activeClass = isVisible ? styles.active : '';

  return (
      <>
        <div className={`${styles.emergencyBlockBackdrop} ${activeClass}`} />
        <div className={`${styles.emergencyTopDrawer} ${activeClass}`}>
          <div className={styles.emergencyDrawerContent}>
            <div className={styles.emergencyDrawerHeader}>
              <span className={styles.emergencyBadgePulse}>🚨 인파 밀집 위험 15초 지속 감지</span>
              <div className={styles.emergencyTimerBox}>
                <span className={styles.timerLabel}>자동 112/119 신고까지</span>
                <span className={styles.timerValue}>{countdownSec}초</span>
              </div>
            </div>
            <div className={styles.emergencyDrawerBody}>
              <div className={styles.emergencyMsg}>
                {isAutoDispatched ? (
                    <>
                      🚨 <strong>[30초 경과 - 112/119 긴급 자동 신고 접수 완료]</strong>
                      <br />
                      미확인 30초 경과로 관제 센터 조작이 일시 잠금되며 112/119 현장 출동 명령이
                      발송되었습니다.
                    </>
                ) : (
                    <>
                      ⚠️ 혼잡도 위험 점수가 15초 이상 유지되고 있습니다.
                      <br />
                      <strong>확인 버튼을 누르지 않으면 관제 화면 조작이 금지</strong>되며, 30초 경과
                      시 자동으로 긴급 신고가 접수됩니다.
                    </>
                )}
              </div>
              <button type="button" className={styles.btnEmergencyConfirm} onClick={onConfirm}>
                {isAutoDispatched
                    ? '🚨 [112/119 긴급 출동 완료 - 조작 해제]'
                    : '🚨 [확인 및 관제 조작 해제]'}
              </button>
            </div>
          </div>
        </div>
      </>
  );
}
