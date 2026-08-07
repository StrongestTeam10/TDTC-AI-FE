import styles from './CctvDashboard.module.css';
import type { EmergencyAlert } from '../../types/cctv';

// 2026-08-06: 원본 index.html의 알람 로그 모달.
//
// 원본은 통계 배지("금일 총 알람 15회")와 로그 5줄이 전부 HTML에 하드코딩된
// 고정 문자열이었다. BE에 GET /api/ai/alerts/unresolved(EmergencyAlertDto)가 이미
// 있었으므로 실제 데이터로 바꿨다.
//
// ⚠️ 지금 BE가 열어둔 건 "미해결" 알람 조회뿐이라, 해제 완료 건수는 이 화면에서
// 셀 수 없다. 해제 이력까지 보여주려면 BE에 전체 이력 조회 API가 하나 더 필요하다.

interface CctvAlertLogModalProps {
  isOpen: boolean;
  alerts: EmergencyAlert[];
  isLoading: boolean;
  loadError: string | null;
  onClose: () => void;
}

/** 알람 종류를 로그 항목 색상으로 매핑. */
function resolveLogClass(alert: EmergencyAlert): string {
  const type = alert.alertType?.toUpperCase() ?? '';
  if (type.includes('CRITICAL')) return styles.danger;
  if (type.includes('SPIKE') || type.includes('INFLOW')) return styles.spike;
  return styles.warning;
}

function formatAlertTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('ko-KR', { hour12: false });
}

export default function CctvAlertLogModal({
  isOpen,
  alerts,
  isLoading,
  loadError,
  onClose,
}: CctvAlertLogModalProps) {
  const criticalCount = alerts.filter((a) => a.alertType?.toUpperCase().includes('CRITICAL')).length;
  const warningCount = alerts.length - criticalCount;

  return (
      <div
          className={`${styles.modalBackdrop} ${isOpen ? styles.active : ''}`}
          onClick={onClose}
      >
        <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>
              <span>🔔 미해결 알람 및 관제 로그</span>
              <span className={styles.modalBadge}>UNRESOLVED ALERT LOG</span>
            </div>
            <button type="button" className={styles.btnCloseModal} onClick={onClose}>
              ✕
            </button>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.alertSummaryGrid}>
              <div className={`${styles.summaryBadge} ${styles.total}`}>
                <span className={styles.summaryLabel}>미해결 총 알람</span>
                <span className={styles.summaryValue}>{alerts.length} 건</span>
              </div>
              <div className={`${styles.summaryBadge} ${styles.critical}`}>
                <span className={styles.summaryLabel}>Critical (경보)</span>
                <span className={styles.summaryValue}>{criticalCount} 건</span>
              </div>
              <div className={`${styles.summaryBadge} ${styles.warning}`}>
                <span className={styles.summaryLabel}>Warning (주의)</span>
                <span className={styles.summaryValue}>{warningCount} 건</span>
              </div>
            </div>

            <div className={styles.alertLogSectionTitle}>⏱️ 시간대별 알람 이력 리스트</div>

            <div className={styles.alertLogList}>
              {isLoading && (
                  <div className={styles.logItem}>
                    <span className={styles.logDesc}>알람 이력을 불러오는 중입니다...</span>
                  </div>
              )}

              {!isLoading && loadError && (
                  <div className={`${styles.logItem} ${styles.danger}`}>
                    <span className={styles.logDesc}>{loadError}</span>
                  </div>
              )}

              {!isLoading && !loadError && alerts.length === 0 && (
                  <div className={`${styles.logItem} ${styles.safe}`}>
                    <span className={styles.logDesc}>현재 미해결 상태인 긴급 알람이 없습니다.</span>
                  </div>
              )}

              {!isLoading &&
                  !loadError &&
                  alerts.map((alert) => (
                      <div key={alert.alertId} className={`${styles.logItem} ${resolveLogClass(alert)}`}>
                        <span className={styles.logTime}>{formatAlertTime(alert.alertedAt)}</span>
                        <span className={`${styles.logTypeTag} ${resolveLogClass(alert)}`}>
                          {alert.alertType}
                        </span>
                        <span className={styles.logDesc}>
                          [구역 {alert.zoneId}] 긴급 알람 발생 - 현장 조치 대기 중
                        </span>
                      </div>
                  ))}
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnModalConfirm} onClick={onClose}>
              확인 및 닫기
            </button>
          </div>
        </div>
      </div>
  );
}
