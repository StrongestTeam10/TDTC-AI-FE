import type { AlertLogEntry } from '../types';

interface AlertLogTableProps {
  alerts: AlertLogEntry[];
}

export default function AlertLogTable({ alerts }: AlertLogTableProps) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-500 text-sm">
        표시할 알림이 없습니다
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-slate-400 text-xs">
          <tr>
            <th className="px-3 py-2 text-left">시간</th>
            <th className="px-3 py-2 text-left">위치</th>
            <th className="px-3 py-2 text-left">유형</th>
            <th className="px-3 py-2 text-left">내용</th>
            <th className="px-3 py-2 text-left">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {alerts.map((alert) => (
            <tr key={alert.alertId} className="text-slate-300">
              <td className="px-3 py-2 whitespace-nowrap text-xs">
                {new Date(alert.timestamp).toLocaleTimeString('ko-KR')}
              </td>
              <td className="px-3 py-2">#{alert.nodeId}</td>
              <td className="px-3 py-2">{alert.alertType}</td>
              <td className="px-3 py-2">{alert.message}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs ${
                    alert.resolved
                      ? 'bg-slate-700 text-slate-400'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {alert.resolved ? '해제됨' : '진행중'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
