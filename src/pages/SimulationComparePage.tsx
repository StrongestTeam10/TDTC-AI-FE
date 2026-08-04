import { useEffect, useState, useRef } from 'react';
import HeatmapView from '../components/HeatmapView';
import ScenarioForm from '../components/ScenarioForm';
import RiskTrendChart from '../components/RiskTrendChart';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { fetchMarkets, fetchZones, fetchCorridors, fetchGates, fetchBuildings, runPredictSimulation, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { PredictRequest, ScenarioRequest, PlacedObject, EventTrigger, CorridorPolicy, Corridor, Gate, Zone, Building } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];
const OBJECT_TYPES = new Set<PlacedObject['objectType']>(['food_truck', 'obstacle', 'event_zone', 'rest_area']);
const isEventPlacementType = (t: PlacementKind | null): t is EventTrigger['eventType'] =>
    t === 'fire' || t === 'acoustic_anomaly';
const SPEED_OPTIONS = [0.5, 1, 2, 4];
const BASE_INTERVAL_MS = 500;
const STEP_DURATION_SECONDS = 10;

export default function SimulationComparePage() {
  const {
    markets,
    setMarkets,
    zones,
    setZones,
    predictResult,
    setPredictResult,
    isPredicting,
    setPredicting,
    scenarioResult,
    setScenarioResult,
    isScenarioRunning,
    setScenarioRunning,
  } = useSimulationStore();

  const [isLayoutLoading, setLayoutLoading] = useState(markets.length === 0);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [closedGateIds, setClosedGateIds] = useState<Set<number>>(new Set());

  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [events, setEvents] = useState<EventTrigger[]>([]);
  const [submittedEvents, setSubmittedEvents] = useState<EventTrigger[]>([]);
  const [placementType, setPlacementType] = useState<PlacementKind | null>(null);
  const [nextIntensity, setNextIntensity] = useState(0.5);
  const [nextTriggerStep, setNextTriggerStep] = useState(1);
  const [corridorPolicies, setCorridorPolicies] = useState<CorridorPolicy[]>([]);

  const [steps, setSteps] = useState(30);
  const [agentCount, setAgentCount] = useState(100);

  const [playIndex, setPlayIndex] = useState(0);
  const [mapViewport, setMapViewport] = useState<{ lon: number; lat: number; zoom: number } | undefined>(undefined);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  const loadLayout = () => {
    setLayoutLoading(true);
    setLayoutError(null);
    fetchMarkets()
      .then((marketData) => {
        setMarkets(marketData);
        if (marketData.length > 0) {
          return Promise.all([
            fetchZones(marketData[0].marketId),
            fetchCorridors(marketData[0].marketId),
            fetchGates(marketData[0].marketId),
            fetchBuildings(marketData[0].marketId),
          ]);
        }
        return Promise.resolve([[], [], [], []] as [Zone[], Corridor[], Gate[], Building[]]);
      })
      .then(([zoneData, corridorData, gateData, buildingData]) => {
        const _zones = zoneData as Zone[];
        const _corridors = corridorData as Corridor[];
        const _gates = gateData as Gate[];
        const _buildings = buildingData as Building[];
        if (_zones.length > 0) setZones(_zones);
        setCorridors(_corridors);
        setGates(_gates);
        setBuildings(_buildings);
      })
      .catch((err) => {
        console.error('레이아웃 정보 로드 실패', err);
        setLayoutError(toDisplayErrorMessage(err, '레이아웃 정보를 불러오지 못했습니다.'));
      })
      .finally(() => setLayoutLoading(false));
  };

  useEffect(() => {
    if (markets.length === 0) loadLayout();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    setPlayIndex(0);
    setIsPlaying(false);
    if (predictResult || scenarioResult) {
      setIsPlaying(true);
    }
  }, [predictResult, scenarioResult]);

  const maxFrames = Math.max(predictResult?.frames.length ?? 0, scenarioResult?.frames.length ?? 0);
  const currentStepNumber = playIndex + 1;
  const hasResult = Boolean(predictResult || scenarioResult);
  const isNearAnyTrigger = hasResult
      ? submittedEvents.some((ev) => Math.abs(currentStepNumber - (ev.triggerStep ?? 1)) <= 2)
      : false;
  const effectiveSpeed = isNearAnyTrigger ? Math.min(playSpeed, 1) : playSpeed;
  const intervalMs = Math.max(80, BASE_INTERVAL_MS / effectiveSpeed);

  useEffect(() => {
    if (maxFrames === 0 || !isPlaying) return;
    timerRef.current = window.setInterval(() => {
      setPlayIndex((prev) => {
        if (prev >= maxFrames - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [intervalMs, maxFrames, isPlaying]);

  const handleRunSimulation = async () => {
    setSubmittedEvents(events);
    setPlacementType(null);
    setPredicting(true);
    setScenarioRunning(true);
    setRunError(null);

    const marketId = markets[0]?.marketId ?? 0;
    const predictReq: PredictRequest = { marketId, steps, totalInflow: agentCount, events };
    const scenarioReq: ScenarioRequest = {
      marketId,
      steps,
      agentCount,
      objects,
      events,
      closedGateIds: Array.from(closedGateIds),
      corridorPolicies: corridorPolicies,
    };

    const [predictOutcome, scenarioOutcome] = await Promise.allSettled([
      runPredictSimulation(predictReq),
      runScenarioSimulation(scenarioReq),
    ]);

    const errors: string[] = [];

    if (predictOutcome.status === 'fulfilled') {
      setPredictResult(predictOutcome.value);
    } else {
      console.error('예측 실행 실패', predictOutcome.reason);
      errors.push(`예측: ${toDisplayErrorMessage(predictOutcome.reason, '예측 시뮬레이션 실행 중 오류가 발생했습니다.')}`);
    }

    if (scenarioOutcome.status === 'fulfilled') {
      setScenarioResult(scenarioOutcome.value);
    } else {
      console.error('시나리오 실행 실패', scenarioOutcome.reason);
      errors.push(`시나리오: ${toDisplayErrorMessage(scenarioOutcome.reason, '시뮬레이션 실행 중 오류가 발생했습니다.')}`);
    }

    if (errors.length > 0) setRunError(errors.join(' / '));

    setPredicting(false);
    setScenarioRunning(false);
  };

  const handleReset = () => {
    setObjects([]);
    setEvents([]);
    setSubmittedEvents([]);
    setCorridorPolicies([]);
    setClosedGateIds(new Set());
    setPlacementType(null);
    setPredictResult(null);
    setScenarioResult(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setRunError(null);
  };

  const handleAddCorridor = (policy: CorridorPolicy) => {
    setCorridorPolicies((prev) => [...prev, policy]);
  };

  const handleRemoveCorridor = (index: number) => {
    setCorridorPolicies((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlaceObject = (zoneId: number, lat: number, lon: number) => {
    if (!placementType) return;
    if (OBJECT_TYPES.has(placementType as PlacedObject['objectType'])) {
      setObjects((prev) => [
        ...prev,
        { objectType: placementType as PlacedObject['objectType'], zoneId, intensity: nextIntensity, latitude: lat, longitude: lon },
      ]);
    } else {
      setEvents((prev) => [
        ...prev,
        {
          eventType: placementType as EventTrigger['eventType'],
          zoneId,
          intensity: nextIntensity,
          latitude: lat,
          longitude: lon,
          triggerStep: nextTriggerStep,
        },
      ]);
    }
  };

  const beforePlacementType = isEventPlacementType(placementType) ? placementType : null;

  const visibleEvents = hasResult
      ? submittedEvents.filter((ev) => (ev.triggerStep ?? 1) <= currentStepNumber)
      : events;
  const focusEvent = hasResult
      ? submittedEvents.find((ev) => (ev.triggerStep ?? 1) === currentStepNumber) ?? null
      : null;

  const handleGateClick = (facilityId: number) => {
    setClosedGateIds((prev) => {
      const next = new Set(prev);
      if (next.has(facilityId)) next.delete(facilityId);
      else next.add(facilityId);
      return next;
    });
  };

  const getBeforeAgents = () => {
    if (!predictResult) return [];
    const idx = Math.min(playIndex, predictResult.frames.length - 1);
    return predictResult.frames[idx] ?? [];
  };

  const getAfterAgents = () => {
    if (!scenarioResult) return [];
    const idx = Math.min(playIndex, scenarioResult.frames.length - 1);
    return scenarioResult.frames[idx] ?? [];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">비교 시뮬레이션</h1>
        <p className="mt-1 text-sm text-slate-500">
          정책 개입 전(Before)과 후(After)의 인구 이동 및 위험도를 듀얼 맵으로 직관적으로 비교합니다.
        </p>
      </div>

      {layoutError && <ErrorBanner message={layoutError} onRetry={loadLayout} />}

      {isLayoutLoading ? (
          <Spinner label="레이아웃 정보를 불러오는 중..." />
      ) : (
          <div className="flex flex-col xl:flex-row gap-6">

            <div className="w-full xl:w-[350px] space-y-4 shrink-0">
              {runError && <ErrorBanner message={runError} />}

              <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 font-medium text-slate-200 bg-slate-800 flex justify-between items-center">
                  <span>시뮬레이션 실행</span>
                  <span className="text-xs px-2 py-1 bg-slate-950 rounded text-slate-400">
                    {predictResult && scenarioResult ? '완료' : '대기'}
                  </span>
                </div>
                <div className="p-4 border-t border-slate-700 h-[650px] overflow-y-auto custom-scrollbar space-y-4">
                  <div className="text-xs text-slate-500">
                    현재 실측 상태(센서 관측값)를 출발점으로, 같은 스텝 수·유입 인원 조건에서
                    Before(정책 개입 없음)와 After(아래 정책 개입 반영)를 동시에 실행해서 비교합니다.
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-slate-300">예측 스텝 수</label>
                    <input
                        type="number"
                        min={1}
                        max={1000}
                        value={steps}
                        onChange={(e) => setSteps(Number(e.target.value))}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
                        disabled={isPredicting || isScenarioRunning}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-slate-300">
                      총 유입 인원 (전체 스텝에 무작위로 분산)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={100000}
                        value={agentCount}
                        onChange={(e) => setAgentCount(Number(e.target.value))}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
                        disabled={isPredicting || isScenarioRunning}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      스텝마다 인원수가 들쭉날쭉하게 무작위로 유입되고, 전체 합계가 이 값에
                      맞춰집니다. 0으로 두면 신규 유입 없이 현재 인원의 자연스러운 이동만 봅니다.
                    </p>
                  </div>

                  <div className="border-t border-slate-700 pt-3">
                    <h3 className="mb-2 text-xs font-semibold text-slate-400">
                      정책 개입 · 이벤트
                      <span className="block font-normal text-slate-500 normal-case">
                        오브젝트/통로정책/게이트는 After 전용, 이벤트(화재·음향이상)는
                        Before·After 양쪽 지도 어디서 찍든 같은 위치에 동시 반영됩니다.
                      </span>
                    </h3>
                    <ScenarioForm
                        isRunning={isPredicting || isScenarioRunning}
                        steps={steps}
                        zones={zones}
                        objects={objects}
                        onRemoveObject={(idx) => setObjects(prev => prev.filter((_, i) => i !== idx))}
                        events={events}
                        onRemoveEvent={(idx) => setEvents(prev => prev.filter((_, i) => i !== idx))}
                        onUpdateEventTriggerStep={(idx, val) => setEvents(prev => prev.map((ev, i) => i === idx ? { ...ev, triggerStep: val } : ev))}
                        placementType={placementType}
                        onSelectPlacementType={setPlacementType}
                        nextIntensity={nextIntensity}
                        onNextIntensityChange={setNextIntensity}
                        nextTriggerStep={nextTriggerStep}
                        onNextTriggerStepChange={setNextTriggerStep}
                        corridors={corridorPolicies}
                        onAddCorridor={handleAddCorridor}
                        onRemoveCorridor={handleRemoveCorridor}
                    />
                  </div>

                  <button
                      type="button"
                      onClick={handleRunSimulation}
                      disabled={isPredicting || isScenarioRunning}
                      className="w-full rounded bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                  >
                    {isPredicting || isScenarioRunning ? '시뮬레이션 실행 중...' : '시뮬레이션 실행'}
                  </button>

                  <button
                      type="button"
                      onClick={handleReset}
                      disabled={isPredicting || isScenarioRunning}
                      className="w-full rounded border border-slate-600 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    초기화
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
              <div className="flex flex-col md:flex-row gap-4 h-[450px]">
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="text-sm font-medium text-slate-300 mb-2">개입 전 (Before)</div>
                  <div className="flex-1 relative rounded-lg border border-slate-700 overflow-hidden bg-slate-900">
                    <HeatmapView
                        zones={zones}
                        agents={getBeforeAgents()}
                        width="100%"
                        height="100%"
                        transitionMs={intervalMs}
                        buildings={buildings}
                        placementType={beforePlacementType}
                        onPlaceObject={handlePlaceObject}
                        events={visibleEvents}
                        focusEvent={focusEvent}
                        viewCenter={mapViewport ? { lon: mapViewport.lon, lat: mapViewport.lat } : undefined}
                        viewZoom={mapViewport?.zoom}
                        onViewportChange={setMapViewport}
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0">
                  <div className="text-sm font-medium text-slate-300 mb-2 flex justify-between items-center">
                    <span>개입 후 (After)</span>
                  </div>
                  <div className="flex-1 relative rounded-lg border border-slate-700 overflow-hidden bg-slate-900">
                    <HeatmapView
                        zones={zones}
                        agents={getAfterAgents()}
                        width="100%"
                        height="100%"
                        transitionMs={intervalMs}
                        buildings={buildings}
                        corridors={corridors}
                        gates={gates}
                        closedGateIds={closedGateIds}
                        onGateClick={handleGateClick}
                        placementType={placementType}
                        onPlaceObject={handlePlaceObject}
                        placedObjects={objects}
                        events={visibleEvents}
                        focusEvent={focusEvent}
                        viewCenter={mapViewport ? { lon: mapViewport.lon, lat: mapViewport.lat } : undefined}
                        viewZoom={mapViewport?.zoom}
                        onViewportChange={setMapViewport}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded bg-slate-900 px-4 py-3 text-xs text-slate-300 shadow-sm border border-slate-700">
                <button
                  onClick={() => {
                    if (!isPlaying && maxFrames > 0 && playIndex >= maxFrames - 1) {
                      setPlayIndex(0);
                    }
                    setIsPlaying(!isPlaying);
                  }}
                  disabled={maxFrames === 0}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                <input
                  type="range"
                  min={0}
                  max={Math.max(0, maxFrames - 1)}
                  value={playIndex}
                  disabled={maxFrames === 0}
                  onChange={(e) => {
                    setPlayIndex(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="flex-1 accent-blue-500 cursor-pointer disabled:opacity-50"
                />

                <div className="flex flex-col items-end min-w-[70px] shrink-0">
                  <span className="font-mono">{playIndex + 1} / {Math.max(1, maxFrames)}</span>
                  <span className="text-[10px] text-slate-400">~{(playIndex + 1) * STEP_DURATION_SECONDS}초</span>
                </div>

                <select
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(Number(e.target.value))}
                    className="rounded border border-slate-600 bg-slate-800 px-1 py-1 text-slate-200 outline-none shrink-0"
                >
                  {SPEED_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}x</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-4">
                  <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">비교 결과 요약</h3>

                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">최종 위험도</div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-300">Before</span>
                        <span className="font-semibold text-orange-400">{predictResult?.finalOverallRiskScore.toFixed(2) ?? '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-300">After</span>
                        <span className="font-semibold text-blue-400">{scenarioResult?.finalRiskScore?.score.toFixed(2) ?? '-'}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-xs text-slate-500 mb-1">대피 소요 시간</div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-300">After (시나리오)</span>
                        <span className="font-semibold text-slate-200">
                          {scenarioResult?.evacuationTimeSeconds ? `${scenarioResult.evacuationTimeSeconds} 초` : (scenarioResult ? '대피 미완료' : '-')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <RiskTrendChart
                    beforeTrend={predictResult?.riskTrend}
                  />
                </div>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}