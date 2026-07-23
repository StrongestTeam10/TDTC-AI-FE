import type { Risk } from '../types';

interface AlertLogTableProps {
  risks: Risk[];
}

export default function AlertLogTable({ risks }: AlertLogTableProps) {
  if (risks.length === 0) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-500 text-sm">
          현재 보고된 위험 구역이 없습니다
        </div>
    );
  }

  return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs">
          <tr>
            <th className="px-3 py-2 text-left">발생 시간</th>
            <th className="px-3 py-2 text-left">구역(Zone)</th>
            <th className="px-3 py-2 text-left">위험 등급</th>
            <th className="px-3 py-2 text-left">위험 점수</th>
            <th className="px-3 py-2 text-left">발생 사유</th>
          </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
          {risks.map((risk) => (
              <tr key={risk.riskId} className="text-slate-300">
                <td className="px-3 py-2 whitespace-nowrap text-xs">
                  {new Date(risk.detectedAt).toLocaleTimeString('ko-KR')}
                </td>
                <td className="px-3 py-2">#{risk.zoneId}</td>
                <td className="px-3 py-2 uppercase">{risk.riskLevel}</td>
                <td className="px-3 py-2">{risk.riskScore.toFixed(1)}</td>
                <td className="px-3 py-2">{risk.reasonCode}</td>
              </tr>
          ))}
          </tbody>
        </table>
      </div>
  );
}