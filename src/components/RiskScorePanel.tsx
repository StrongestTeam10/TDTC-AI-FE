import type { RiskScore } from '../types';

interface RiskScorePanelProps {
  riskScore: RiskScore | null;
}

const LEVEL_STYLE: Record<RiskScore['level'], string> = {
  low: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
};

export default function RiskScorePanel({ riskScore }: RiskScorePanelProps) {
  if (!riskScore) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-500 text-sm">
        위험도 데이터 없음
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-4 ${LEVEL_STYLE[riskScore.level]}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm opacity-80">현재 위험도</span>
        <span className="text-xs uppercase tracking-wide">
          {riskScore.level}
        </span>
      </div>
      <div className="mt-1 text-3xl font-semibold">{riskScore.score.toFixed(1)}</div>

      <div className="mt-3 space-y-1 text-xs opacity-80">
        <div className="flex justify-between">
          <span>밀집도</span>
          <span>{riskScore.contributingFactors.density.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span>음향 이상</span>
          <span>{riskScore.contributingFactors.acoustic.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span>이동 흐름</span>
          <span>{riskScore.contributingFactors.flowRate.toFixed(1)}</span>
        </div>
      </div>

      <div className="mt-2 text-[11px] opacity-60">
        {new Date(riskScore.timestamp).toLocaleString('ko-KR')}
      </div>
    </div>
  );
}
