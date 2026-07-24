import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RiskTrendPoint } from '../types';

interface RiskTrendChartProps {
  riskTrend: RiskTrendPoint[];
  currentStep?: number; // FramePlayer와 연동해서 현재 재생 위치를 표시하고 싶을 때 (선택)
}

export default function RiskTrendChart({ riskTrend }: RiskTrendChartProps) {
  if (riskTrend.length === 0) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-8 text-center text-slate-500 text-sm">
          예측을 실행하면 위험도 추이가 표시됩니다.
        </div>
    );
  }

  const data = riskTrend.map((point) => ({
    step: point.step,
    overallRiskScore: Number(point.overallRiskScore.toFixed(2)),
  }));

  return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-2 text-sm text-slate-400">스텝별 위험도 추이</h3>
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
                formatter={(value) => [value ?? '', '종합 위험도']}
                labelFormatter={(step) => `스텝 ${step}`}
            />
            <Line
                type="monotone"
                dataKey="overallRiskScore"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
  );
}
