import type { Risk } from '../types';

interface RiskScorePanelProps {
  risks: Risk[];
}

const LEVEL_STYLE: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  critical: 'bg-red-500/20 text-red-300 border-red-500/40',
};

export default function RiskScorePanel({ risks }: RiskScorePanelProps) {
  if (risks.length === 0) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-500 text-sm">
          위험도 데이터 없음
        </div>
    );
  }

  // 가장 위험도가 높은 구역을 상단에 노출하기 위해 정렬
  const sortedRisks = [...risks].sort((a, b) => b.riskScore - a.riskScore);
  const highestRisk = sortedRisks[0];

  return (
      <div className={`rounded-lg border p-4 ${LEVEL_STYLE[highestRisk.riskLevel.toLowerCase()] || LEVEL_STYLE.low}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm opacity-80">최고 위험 구역 (Zone {highestRisk.zoneId})</span>
          <span className="text-xs uppercase tracking-wide">
          {highestRisk.riskLevel}
        </span>
        </div>
        <div className="mt-1 text-3xl font-semibold">{highestRisk.riskScore.toFixed(1)}</div>

        <div className="mt-3 pt-3 border-t border-slate-600/30 text-xs opacity-80">
          <div className="mb-2 text-slate-200 font-semibold">다른 구역 현황</div>
          {sortedRisks.slice(1, 4).map((r) => (
              <div key={r.riskId} className="flex justify-between py-0.5">
                <span>Zone {r.zoneId} ({r.reasonCode})</span>
                <span>{r.riskScore.toFixed(1)}</span>
              </div>
          ))}
        </div>

        <div className="mt-4 text-[11px] opacity-60">
          {new Date(highestRisk.detectedAt).toLocaleString('ko-KR')}
        </div>
      </div>
  );
}