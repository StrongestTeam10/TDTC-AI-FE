import { useEffect } from 'react';
import HeatmapView from '../components/HeatmapView';
import RiskScorePanel from '../components/RiskScorePanel';
import ScenarioForm from '../components/ScenarioForm';
import { fetchSpatialLayout, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import type { ScenarioRequest } from '../types';

export default function ScenarioPage() {
  const {
    spatialLayout,
    setSpatialLayout,
    scenarioResult,
    setScenarioResult,
    isScenarioRunning,
    setScenarioRunning,
  } = useSimulationStore();

  useEffect(() => {
    if (spatialLayout.length === 0) {
      fetchSpatialLayout()
        .then(setSpatialLayout)
        .catch((err) => console.error('레이아웃 로드 실패', err));
    }
  }, [spatialLayout.length, setSpatialLayout]);

  const handleRunScenario = async (request: ScenarioRequest) => {
    setScenarioRunning(true);
    try {
      const result = await runScenarioSimulation(request);
      setScenarioResult(result);
    } catch (err) {
      console.error('시나리오 실행 실패', err);
    } finally {
      setScenarioRunning(false);
    }
  };

  const lastFrame = scenarioResult?.frames.at(-1) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">
        정책 시나리오 시뮬레이션
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <HeatmapView layout={spatialLayout} agents={lastFrame} />

          {scenarioResult && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>예상 대피 완료 시간</span>
                <span className="font-medium">
                  {scenarioResult.evacuationTimeSeconds != null
                    ? `${scenarioResult.evacuationTimeSeconds}초`
                    : '측정되지 않음'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ScenarioForm
            layout={spatialLayout}
            isRunning={isScenarioRunning}
            onSubmit={handleRunScenario}
          />
          <RiskScorePanel riskScore={scenarioResult?.finalRiskScore ?? null} />
        </div>
      </div>

      {/*
        TODO: frames 배열을 이용한 타임라인 재생(슬라이더/재생 버튼) 기능 추가
      */}
    </div>
  );
}
