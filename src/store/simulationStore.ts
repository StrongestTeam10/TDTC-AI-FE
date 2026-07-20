import { create } from 'zustand';
import type { DashboardSnapshot, ScenarioResult, SpatialNode } from '../types';

interface SimulationStore {
  // 공통: 정적 레이아웃 (두 파이프라인이 공유)
  spatialLayout: SpatialNode[];
  setSpatialLayout: (layout: SpatialNode[]) => void;

  // 파이프라인 A 상태
  dashboardSnapshot: DashboardSnapshot | null;
  isDashboardLoading: boolean;
  setDashboardSnapshot: (snapshot: DashboardSnapshot | null) => void;
  setDashboardLoading: (loading: boolean) => void;

  // 파이프라인 B 상태
  scenarioResult: ScenarioResult | null;
  isScenarioRunning: boolean;
  setScenarioResult: (result: ScenarioResult | null) => void;
  setScenarioRunning: (running: boolean) => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  spatialLayout: [],
  setSpatialLayout: (layout) => set({ spatialLayout: layout }),

  dashboardSnapshot: null,
  isDashboardLoading: false,
  setDashboardSnapshot: (snapshot) => set({ dashboardSnapshot: snapshot }),
  setDashboardLoading: (loading) => set({ isDashboardLoading: loading }),

  scenarioResult: null,
  isScenarioRunning: false,
  setScenarioResult: (result) => set({ scenarioResult: result }),
  setScenarioRunning: (running) => set({ isScenarioRunning: running }),
}));
