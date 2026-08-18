import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './CctvDashboard.module.css';
import { useChartTheme } from '../../hooks/useChartTheme';
import { CRITICAL_THRESHOLD_LINE } from '../../utils/criScore';
import type { CriHistoryPoint } from '../../hooks/useCriScore';
import type { ControlStatus } from '../../types/cctv';
import { useSmoothNumber } from '../../hooks/useSmoothNumber';

// 2026-08-06: 원본 index.html의 <div class="card chart-card"> 블록 + dashboard.js 5번 섹션.
//
// 차트는 Chart.js(jsdelivr CDN)에서 recharts로 갈아탔다. package.json에 recharts가
// 이미 있었고(RiskTrendChart가 쓰던 것), 이걸로 index.html의 마지막 외부 CDN 의존이
// 사라진다. 색/축 범위/점선 임계선 등 시각적 규격은 원본 옵션 그대로 맞췄다.

interface CctvRiskChartCardProps {
  cri: number;
  status: ControlStatus;
  statusLabel: string;
  barColor: string;
  history: CriHistoryPoint[];
}

export default function CctvRiskChartCard({
  cri,
  status,
  statusLabel,
  barColor,
  history,
}: CctvRiskChartCardProps) {
  const chartTheme = useChartTheme();
  const smoothCri = useSmoothNumber(cri);

  return (
      <div className={`${styles.card} ${styles.chartCard}`} style={{ boxShadow: 'none' }}>
        <div className={styles.cardTitle}>
          <span>📈 실시간 위험도 (CRI Score) 추이 그래프</span>
          <span className={styles.chartTag}>CRITICAL LIMIT: {CRITICAL_THRESHOLD_LINE}pt</span>
        </div>

        <div className={styles.statusSummaryRow}>
          <div className={`${styles.statusDisplay} ${styles[status]}`}>
            <div className={styles.statusTitle}>STATUS / 관제 경보</div>
            <div className={styles.statusValue}>{statusLabel}</div>
          </div>
          <div className={styles.scoreDisplayBox}>
            <div className={styles.scoreTitle}>종합 위험 지수</div>
            <div className={styles.scoreNumber}>{smoothCri.toFixed(1)} pt</div>
          </div>
        </div>

        <div className={styles.progressBarContainer}>
          <div
              className={styles.progressBar}
              style={{ width: `${smoothCri}%`, backgroundColor: barColor }}
          />
        </div>

        <div className={styles.lineChartContainer}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={chartTheme.grid} />
              <XAxis dataKey="t" stroke={chartTheme.axis} fontSize={9} tickLine={false} />
              <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  stroke={chartTheme.axis}
                  fontSize={10}
                  tickLine={false}
              />
              <Tooltip
                  contentStyle={chartTheme.tooltipContentStyle}
                  labelStyle={chartTheme.tooltipLabelStyle}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area
                  name="CRI 스코어 곡선"
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="rgba(59, 130, 246, 0.15)"
                  dot={false}
                  isAnimationActive={false}
              />
              <Line
                  name={`${CRITICAL_THRESHOLD_LINE}pt 대피 임계선`}
                  type="monotone"
                  dataKey="limit"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
  );
}
