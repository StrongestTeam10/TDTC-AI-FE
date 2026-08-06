import { useEffect, useState } from 'react';
// import HeatmapView from '../components/HeatmapView';
// import RiskScorePanel from '../components/RiskScorePanel';
// import AlertLogTable from '../components/AlertLogTable';
// import Spinner from '../components/ui/Spinner';
// import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
// import { useSimulationData } from '../hooks/useSimulationData';
import { useAuthStore } from '../store/authStore';
// import { fetchAvailableTimestamps } from '../api/client';
// import type { Risk } from '../types';
// import type { ZoneRisk } from '../components/HeatmapView';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  // 2026-07-27 추가: 게시판과 동일한 권한 체계(관리자 ROL01은 전체, 그 외 상인회/
  // 지자체 등은 본인 담당 시장만) - 관리자만 시장 전환 탭을 보여준다. 비관리자는
  // BE /markets 응답 자체가 본인 담당 시장 1개로 이미 필터링되어 내려오므로 탭이
  // 필요 없다(게시판의 "관리자 시장 탭 결정"과 동일한 판단).
  const isAdmin = user?.rulesCode === 'ROL01';

//   const [capturedAt, setCapturedAt] = useState<string | undefined>(undefined);
//   const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);
  // 2026-07-27 추가: 관리자가 탭으로 선택한 시장. 선택 전(최초 진입)에는 undefined로
  // 두고 훅이 로드된 시장 목록의 첫 번째를 기본값으로 쓰도록 한다.
  const [selectedMarketId, setSelectedMarketId] = useState<number | undefined>(undefined);

//   const { markets, zones, dashboardSnapshot, isDashboardLoading, loadError, isPolling, refetch } =
//       useSimulationData(capturedAt, selectedMarketId);

//   useEffect(() => {
//     fetchAvailableTimestamps()
//         .then(setAvailableTimestamps)
//         .catch((err) => console.error('시점 목록 로드 실패', err));
//   }, []);

  // 2026-07-27 추가: 시장 목록이 로드되면 아직 아무 탭도 선택 안 한 상태(최초 진입)를
  // 첫 번째 시장으로 확정한다. 이렇게 selectedMarketId를 명시적으로 채워둬야 탭의
  // active 표시가 실제 조회 중인 시장과 항상 일치한다.
//   useEffect(() => {
//     if (selectedMarketId === undefined && markets.length > 0) {
//       setSelectedMarketId(markets[0].marketId);
//     }
//   }, [markets, selectedMarketId]);

  // RiskScorePanel/AlertLogTable은 기존 Risk[] 규격을 그대로 사용하므로,
  // SIM이 구역 단위로 내려주는 zones(ZoneResult[])를 Risk[] 형태로 임시 변환한다.
  // (파이프라인 B ScenarioPage에서 finalRiskScore -> Risk[] 변환한 것과 동일한 패턴)
  // ⚠️ SIM 스냅샷은 구역별 riskId/detectedAt을 별도로 내려주지 않으므로 zoneId를
  // riskId로 대체하고, detectedAt은 조회 시각으로 근사한다.
//   const risks: Risk[] = dashboardSnapshot
//       ? dashboardSnapshot.zones.map((zone) => ({
//         riskId: zone.zoneId,
//         marketId: dashboardSnapshot.marketId,
//         zoneId: zone.zoneId,
//         riskScore: zone.riskScore,
//         riskLevel: zone.riskLevel,
//         reasonCode: zone.reason,
//         detectedAt: new Date().toISOString(),
//       }))
//       : [];

  // HeatmapView 구역 색상 표시용 (zones의 riskLevel/riskScore만 추출)
//   const zoneRisks: ZoneRisk[] = dashboardSnapshot
//       ? dashboardSnapshot.zones.map((zone) => ({
//         zoneId: zone.zoneId,
//         riskLevel: zone.riskLevel,
//         riskScore: zone.riskScore,
//       }))
//       : [];







  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              전통시장 실시간 위험도 관제
            </h1>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                실시간 CCTV AI 관제 연동 중
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
                            disabled
                            className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 opacity-70 cursor-not-allowed"
                        >
                          <option value="">최신 (실시간)</option>
                        </select>
                        <button
                            disabled
                            className="rounded bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 opacity-70 cursor-not-allowed"
                        >
                          새로고침
                        </button>
          </div>
        </div>

        {/* 2026-07-27 추가: 관리자 전용 시장 전환 탭. 비관리자는 markets 배열 자체가
            본인 담당 시장 1개로 이미 필터링되어 내려오므로 탭을 보여줄 필요가 없다. */}
        {/*
        {isAdmin && markets.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              {markets.map((m) => (
                  <TabButton
                      key={m.marketId}
                      active={selectedMarketId === m.marketId}
                      onClick={() => setSelectedMarketId(m.marketId)}
                      small
                  >
                    {m.marketName}
                  </TabButton>
              ))}
            </div>
        )}*/}


    {isAdmin && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <TabButton
                      active={selectedMarketId === 1}
                      onClick={() => setSelectedMarketId(1)}
                      small
                  >
                    망원시장
                  </TabButton>
                </div>
            )}



        <div className="w-full min-h-[85vh] rounded-xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-700 bg-[#0f172a]">
                  <iframe
                      src="/mangwon/index.html"
                      title="망원시장 스마트 CCTV 라이브 관제 대시보드"
                      className="w-full h-full border-none min-h-[85vh]"
                  />
        </div>
      </div>
  );
}
