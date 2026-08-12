import styles from './CctvDashboard.module.css';

// 2026-08-06: 원본 index.html의 <div class="metrics-card-grid"> 블록.

interface CctvMetricCardsProps {
  pedestrianCount: number;
  occupancyRate: number;
  /** formatStoppage()로 이미 "1분 05초" 형태까지 가공된 문자열 */
  stoppageLabel: string;
  /** 지표가 AI 서버 실측인지, 인원수로부터 추정한 값인지 */
  isEstimated: boolean;
  /** 세로 정렬 여부 (팝업용) */
  layout?: 'horizontal' | 'vertical';
}

export default function CctvMetricCards({
  pedestrianCount,
  occupancyRate,
  stoppageLabel,
  isEstimated,
  layout = 'horizontal',
}: CctvMetricCardsProps) {
  // 원본은 하위 문구가 항상 "BEV 3D 역투영 기준"으로 고정이라, 실측인지 추정인지
  // 구분이 안 됐다. AI 서버가 안 붙어 있을 때 추정값을 실측처럼 읽는 걸 막는다.
  const sourceSuffix = isEstimated ? ' (추정)' : '';

  return (
      <div className={layout === 'vertical' ? styles.metricsCardGridVertical : styles.metricsCardGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span className={styles.metricCardTitle}>👥 실시간 인원수</span>
            <span className={styles.metricCardIcon}>COUNT</span>
          </div>
          <div className={styles.metricCardValue}>{pedestrianCount} 명</div>
          <div className={styles.metricCardSub}>실시간 감지 기준</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span className={styles.metricCardTitle}>📐 3D 공간 밀집율</span>
            <span className={styles.metricCardIcon}>OCCUPANCY</span>
          </div>
          <div className={styles.metricCardValue}>{occupancyRate} %</div>
          <div className={styles.metricCardSub}>BEV 3D 역투영 기준{sourceSuffix}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricCardHeader}>
            <span className={styles.metricCardTitle}>⏱️ 정체 / 멈춤 시간</span>
            <span className={styles.metricCardIcon}>STOPPAGE</span>
          </div>
          <div className={styles.metricCardValue}>{stoppageLabel}</div>
          <div className={styles.metricCardSub}>체류 이탈 지연 시간{sourceSuffix}</div>
        </div>
      </div>
  );
}
