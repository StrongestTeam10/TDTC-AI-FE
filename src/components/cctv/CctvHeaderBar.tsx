import styles from './CctvDashboard.module.css';
import type { ControlStatus } from '../../types/cctv';

// 2026-08-06: 원본 index.html의 <header class="sticky-header"> 블록.
// 인라인 onclick="openAlertModal()"이던 것을 onOpenAlertLog prop으로 바꿨다.

interface CctvHeaderBarProps {
  cri: number;
  status: ControlStatus;
  statusLabel: string;
  /** 미해결 긴급 알람 수(BE /api/ai/alerts/unresolved 기준) */
  alertCount: number;
  onOpenAlertLog: () => void;
}

export default function CctvHeaderBar({
  cri,
  status,
  statusLabel,
  alertCount,
  onOpenAlertLog,
}: CctvHeaderBarProps) {
  return (
      <header className={styles.stickyHeader}>
        <div className={styles.headerContainer}>
          <div className={styles.headerBrand}>
            <div className={styles.logoIcon}>📹</div>
            <div>
              <h1 className={styles.headerTitle}>MANGWON SMART CROWD CONTROL</h1>
              <span className={styles.headerSubtitle}>
                실시간 CCTV 3D BEV &amp; 기상 융합 지능형 관제 시스템
              </span>
            </div>
          </div>

          <div className={styles.headerScoreSummary}>
            <span className={styles.scoreSummaryLabel}>현재 종합 위험도 (CRI)</span>
            <span className={`${styles.scoreSummaryVal} ${styles[status]}`}>
              {cri.toFixed(1)} pt
            </span>
            <span className={`${styles.scoreSummaryStatus} ${styles[status]}`}>{statusLabel}</span>
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={styles.btnAlertLog} onClick={onOpenAlertLog}>
              <span>🔔 알람 로그 / 이력</span>
              <span className={styles.alertCountBadge}>{alertCount}</span>
            </button>
          </div>
        </div>
      </header>
  );
}
