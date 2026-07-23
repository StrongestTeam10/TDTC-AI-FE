import { useCallback, useEffect } from 'react';
import { fetchDashboardSnapshot, fetchMarkets, fetchZones } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';

export function useSimulationData(snapshotTime?: string) {
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
    }
  }, [markets.length, setMarkets, setZones]);

  const loadSnapshot = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const snapshot = await fetchDashboardSnapshot(snapshotTime);
      setDashboardSnapshot(snapshot);
    } catch (err) {
      console.error('스냅샷 로드 실패', err);
    } finally {
      setDashboardLoading(false);
    }
  }, [snapshotTime, setDashboardSnapshot, setDashboardLoading]);

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
    refetch: loadSnapshot,
  };
}