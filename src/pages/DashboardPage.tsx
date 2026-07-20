import { useEffect, useState } from 'react';
import HeatmapView from '../components/HeatmapView';
import RiskScorePanel from '../components/RiskScorePanel';
import AlertLogTable from '../components/AlertLogTable';
import { useSimulationData } from '../hooks/useSimulationData';
import { fetchAvailableTimestamps } from '../api/client';

export default function DashboardPage() {
  const [snapshotTime, setSnapshotTime] = useState<string | undefined>(undefined);
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);
  const { spatialLayout, dashboardSnapshot, isDashboardLoading, refetch } =
    useSimulationData(snapshotTime);

  useEffect(() => {
    fetchAvailableTimestamps()
      .then(setAvailableTimestamps)
      .catch((err) => console.error('시점 목록 로드 실패', err));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">
          전통시장 실시간 위험도 관제
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={snapshotTime ?? ''}
            onChange={(e) => setSnapshotTime(e.target.value || undefined)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="">최신 (실시간)</option>
            {availableTimestamps.map((ts) => (
              <option key={ts} value={ts}>
                {new Date(ts).toLocaleString('ko-KR')}
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            disabled={isDashboardLoading}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50"
          >
            {isDashboardLoading ? '갱신 중...' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HeatmapView
            layout={spatialLayout}
            agents={dashboardSnapshot?.agents ?? []}
          />
        </div>
        <div>
          <RiskScorePanel riskScore={dashboardSnapshot?.riskScore ?? null} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">알림 이력</h2>
        <AlertLogTable alerts={dashboardSnapshot?.alerts ?? []} />
      </div>
    </div>
  );
}
