import { create } from 'zustand';
import type { DashboardSnapshot, ScenarioResult, PredictResult, Market, Zone } from '../types';

interface SimulationStore {
  // 공통: 시장 및 구역 정보
  markets: Market[];
  zones: Zone[];
  setMarkets: (markets: Market[]) => void;
  setZones: (zones: Zone[]) => void;

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

  // 2026-07-24 추가: 예측 시뮬레이션(파이프라인 A 확장) 상태
  predictResult: PredictResult | null;
  isPredicting: boolean;
  setPredictResult: (result: PredictResult | null) => void;
  setPredicting: (running: boolean) => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  markets: [],
  zones: [],
  setMarkets: (markets) => set({ markets }),
  setZones: (zones) => set({ zones }),

  dashboardSnapshot: null,
  isDashboardLoading: false,
  setDashboardSnapshot: (snapshot) => set({ dashboardSnapshot: snapshot }),
  setDashboardLoading: (loading) => set({ isDashboardLoading: loading }),

  scenarioResult: null,
  isScenarioRunning: false,
  setScenarioResult: (result) => set({ scenarioResult: result }),
  setScenarioRunning: (running) => set({ isScenarioRunning: running }),

  predictResult: null,
  isPredicting: false,
  setPredictResult: (result) => set({ predictResult: result }),
  setPredicting: (running) => set({ isPredicting: running }),
}));