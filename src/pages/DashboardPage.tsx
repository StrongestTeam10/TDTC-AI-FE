import { useEffect, useState } from 'react';
import HeatmapView from '../components/HeatmapView';
import RiskScorePanel from '../components/RiskScorePanel';
import AlertLogTable from '../components/AlertLogTable';
import { useSimulationData } from '../hooks/useSimulationData';
import { fetchAvailableTimestamps } from '../api/client';
import type { Risk } from '../types';
import type { ZoneRisk } from '../components/HeatmapView';

export default function DashboardPage() {
  const [capturedAt, setCapturedAt] = useState<string | undefined>(undefined);
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);

  const { zones, dashboardSnapshot, isDashboardLoading, refetch } =
      useSimulationData(capturedAt);

  useEffect(() => {
    fetchAvailableTimestamps()
        .then(setAvailableTimestamps)
        .catch((err) => console.error('시점 목록 로드 실패', err));
  }, []);

  // RiskScorePanel/AlertLogTable은 기존 Risk[] 규격을 그대로 사용하므로,
  // SIM이 구역 단위로 내려주는 zones(ZoneResult[])를 Risk[] 형태로 임시 변환한다.
  // (파이프라인 B ScenarioPage에서 finalRiskScore -> Risk[] 변환한 것과 동일한 패턴)
  // ⚠️ SIM 스냅샷은 구역별 riskId/detectedAt을 별도로 내려주지 않으므로 zoneId를
  // riskId로 대체하고, detectedAt은 조회 시각으로 근사한다.
  const risks: Risk[] = dashboardSnapshot
      ? dashboardSnapshot.zones.map((zone) => ({
        riskId: zone.zoneId,
        marketId: dashboardSnapshot.marketId,
        zoneId: zone.zoneId,
        riskScore: zone.riskScore,
        riskLevel: zone.riskLevel,
        reasonCode: zone.reason,
        detectedAt: new Date().toISOString(),
      }))
      : [];

  // HeatmapView 구역 색상 표시용 (zones의 riskLevel/riskScore만 추출)
  const zoneRisks: ZoneRisk[] = dashboardSnapshot
      ? dashboardSnapshot.zones.map((zone) => ({
        zoneId: zone.zoneId,
        riskLevel: zone.riskLevel,
        riskScore: zone.riskScore,
      }))
      : [];

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-100">
            전통시장 실시간 위험도 관제
          </h1>
          <div className="flex items-center gap-2">
            <select
                value={capturedAt ?? ''}
                onChange={(e) => setCapturedAt(e.target.value || undefined)}
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
                zones={zones}
                agents={dashboardSnapshot?.agents ?? []}
                zoneRisks={zoneRisks}
            />
          </div>
          <div>
            <RiskScorePanel risks={risks} />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-2">구역별 위험 알림 이력</h2>
          <AlertLogTable risks={risks} />
        </div>
      </div>
  );
}
