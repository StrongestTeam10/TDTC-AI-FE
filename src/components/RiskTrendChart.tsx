import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import type { RiskTrendPoint } from '../types';

interface RiskTrendChartProps {
  riskTrend?: RiskTrendPoint[];
  beforeTrend?: RiskTrendPoint[];
  afterTrend?: RiskTrendPoint[];
}

export default function RiskTrendChart({ riskTrend, beforeTrend, afterTrend }: RiskTrendChartProps) {
  const hasData = (riskTrend && riskTrend.length > 0) || 
                  (beforeTrend && beforeTrend.length > 0) || 
                  (afterTrend && afterTrend.length > 0);

  if (!hasData) {
    return (
        <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 text-sm">
          시뮬레이션을 실행하면 위험도 추이가 표시됩니다.
        </div>
    );
  }

  const maxLen = Math.max(
    riskTrend?.length ?? 0,
    beforeTrend?.length ?? 0,
    afterTrend?.length ?? 0
  );

  const data = Array.from({ length: maxLen }).map((_, i) => {
    const d: any = { step: i + 1 };
    if (riskTrend && i < riskTrend.length) {
      d.risk = Number(riskTrend[i].overallRiskScore.toFixed(2));
    }
    if (beforeTrend && i < beforeTrend.length) {
      d.before = Number(beforeTrend[i].overallRiskScore.toFixed(2));
    }
    if (afterTrend && i < afterTrend.length) {
      d.after = Number(afterTrend[i].overallRiskScore.toFixed(2));
    }
    return d;
  });

  return (
      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h3 className="mb-2 text-sm text-slate-500 dark:text-slate-400">스텝별 위험도 추이</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
                dataKey="step"
                stroke="#94a3b8"
                fontSize={11}
                label={{ value: '스텝', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }}
            />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0' }}
                labelFormatter={(step) => `스텝 ${step}`}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
            {riskTrend && riskTrend.length > 0 && (
              <Line
                  name="종합 위험도"
                  type="monotone"
                  dataKey="risk"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
              />
            )}
            {beforeTrend && beforeTrend.length > 0 && (
              <Line
                  name="Before (예측)"
                  type="monotone"
                  dataKey="before"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
              />
            )}
            {afterTrend && afterTrend.length > 0 && (
              <Line
                  name="After (정책)"
                  type="monotone"
                  dataKey="after"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
  );
}
