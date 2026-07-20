import { useCallback, useEffect } from 'react';
import { fetchDashboardSnapshot, fetchSpatialLayout } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';

/**
 * 파이프라인 A(관제 대시보드)용 데이터 로딩 훅.
 * 정적 레이아웃은 최초 1회만 로드하고, 스냅샷은 refetch로 갱신 가능.
 */
export function useSimulationData(snapshotTime?: string) {
  const {
    spatialLayout,
    setSpatialLayout,
    dashboardSnapshot,
    setDashboardSnapshot,
    isDashboardLoading,
    setDashboardLoading,
  } = useSimulationStore();

  const loadLayout = useCallback(async () => {
    if (spatialLayout.length > 0) return;
    try {
      const layout = await fetchSpatialLayout();
      setSpatialLayout(layout);
    } catch (err) {
      console.error('레이아웃 로드 실패', err);
    }
  }, [spatialLayout.length, setSpatialLayout]);

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
    spatialLayout,
    dashboardSnapshot,
    isDashboardLoading,
    refetch: loadSnapshot,
  };
}
