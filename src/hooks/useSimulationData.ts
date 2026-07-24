import { useCallback, useEffect, useState } from 'react';
import { fetchDashboardSnapshot, fetchMarkets, fetchZones } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-07-24: BE /dashboard/snapshot이 marketId를 필수로 받도록 바뀌면서
// 시장 목록이 로드되어 marketId를 알 수 있을 때까지 스냅샷 조회를 미룸.
//
// 2026-07-24 (2차): 지금까지 로드 실패 시 console.error만 찍고 화면엔 아무 표시가
// 없어서 "왜 아무것도 안 보이지?"를 사용자가 알 수 없었음. loadError를 반환해서
// DashboardPage가 오류 배너를 보여줄 수 있게 함.
export function useSimulationData(capturedAt?: string) {
  const {
    markets,
    setMarkets,
    zones,
    setZones,
    dashboardSnapshot,
    setDashboardSnapshot,
    isDashboardLoading,
    setDashboardLoading,
  } = useSimulationStore();

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLayout = useCallback(async () => {
    if (markets.length > 0) return;
    try {
      const marketData = await fetchMarkets();
      setMarkets(marketData);

      // 첫 번째 시장을 기준으로 구역 정보를 로드합니다.
      if (marketData.length > 0) {
        const zoneData = await fetchZones(marketData[0].marketId);
        setZones(zoneData);
      }
    } catch (err) {
      console.error('시장 및 구역 정보 로드 실패', err);
      setLoadError(toDisplayErrorMessage(err, '시장/구역 정보를 불러오지 못했습니다.'));
    }
  }, [markets.length, setMarkets, setZones]);

  const marketId = markets[0]?.marketId;

  const loadSnapshot = useCallback(async () => {
    if (!marketId) return;
    setDashboardLoading(true);
    setLoadError(null);
    try {
      const snapshot = await fetchDashboardSnapshot(marketId, { capturedAt });
      setDashboardSnapshot(snapshot);
    } catch (err) {
      console.error('스냅샷 로드 실패', err);
      setLoadError(toDisplayErrorMessage(err, '관제 데이터를 불러오지 못했습니다.'));
    } finally {
      setDashboardLoading(false);
    }
  }, [marketId, capturedAt, setDashboardSnapshot, setDashboardLoading]);

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  return {
    zones,
    dashboardSnapshot,
    isDashboardLoading,
    loadError,
    refetch: loadSnapshot,
  };
}
