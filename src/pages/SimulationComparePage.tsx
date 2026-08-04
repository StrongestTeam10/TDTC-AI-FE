import { useEffect, useState, useRef } from 'react';
import HeatmapView from '../components/HeatmapView';
import KakaoMapView from '../components/KakaoMapView';
import PredictForm from '../components/PredictForm';
import ScenarioForm from '../components/ScenarioForm';
import RiskTrendChart from '../components/RiskTrendChart';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { fetchMarkets, fetchZones, fetchCorridors, fetchGates, runPredictSimulation, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { PredictRequest, ScenarioRequest, PlacedObject, EventTrigger, CorridorPolicy, Corridor, Gate, Zone } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];
const OBJECT_TYPES = new Set<PlacedObject['objectType']>(['food_truck', 'obstacle', 'event_zone', 'rest_area']);
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

  // Scenario specific states
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [closedGateIds, setClosedGateIds] = useState<Set<number>>(new Set());

  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [events, setEvents] = useState<EventTrigger[]>([]);
  const [submittedEvents, setSubmittedEvents] = useState<EventTrigger[]>([]);
  const [placementType, setPlacementType] = useState<PlacementKind | null>(null);
  const [nextIntensity, setNextIntensity] = useState(0.5);
  const [nextTriggerStep, setNextTriggerStep] = useState(1);

  // Form step state
  const [activeStep, setActiveStep] = useState<'before' | 'after'>('before');

  // Master Playback Controller
  const [playIndex, setPlayIndex] = useState(0);
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
          ]);
        }
        return Promise.resolve([[], [], []] as [Zone[], Corridor[], Gate[]]);
      })
      .then(([zoneData, corridorData, gateData]) => {
        const _zones = zoneData as Zone[];
        const _corridors = corridorData as Corridor[];
        const _gates = gateData as Gate[];
        if (_zones.length > 0) setZones(_zones);
        setCorridors(_corridors);
        setGates(_gates);
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

  // When either simulation finishes, reset playback
  useEffect(() => {
    setPlayIndex(0);
    setIsPlaying(false);
    if (predictResult || scenarioResult) {
      setIsPlaying(true);
    }
  }, [predictResult, scenarioResult]);

  const maxFrames = Math.max(predictResult?.frames.length ?? 0, scenarioResult?.frames.length ?? 0);
  const currentStepNumber = playIndex + 1;
  const isNearAnyTrigger = scenarioResult
      ? submittedEvents.some((ev) => Math.abs(currentStepNumber - (ev.triggerStep ?? 1)) <= 2)
      : false;
  const effectiveSpeed = isNearAnyTrigger ? Math.min(playSpeed, 1) : playSpeed;
  const intervalMs = Math.max(80, BASE_INTERVAL_MS / effectiveSpeed);

  useEffect(() => {
    if (maxFrames === 0 || !isPlaying) return;
    timerRef.current = window.setInterval(() => {
      setPlayIndex((prev) => (prev >= maxFrames - 1 ? 0 : prev + 1));
    }, intervalMs);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [intervalMs, maxFrames, isPlaying]);

  const handleRunPredict = async (request: PredictRequest) => {
    setPredicting(true);
    setRunError(null);
    try {
      const result = await runPredictSimulation(request);
      setPredictResult(result);
      setActiveStep('after');
    } catch (err) {
      console.error('예측 실행 실패', err);
      setRunError(toDisplayErrorMessage(err, '예측 시뮬레이션 실행 중 오류가 발생했습니다.'));
    } finally {
      setPredicting(false);
    }
  };

  const handleRunScenario = async (
      basicFields: Pick<ScenarioRequest, 'agentCount' | 'steps'> & { corridorPolicies: CorridorPolicy[] }
  ) => {
    const request: ScenarioRequest = {
      ...basicFields,
      marketId: markets[0]?.marketId ?? 0,
      objects,
      events,
      closedGateIds: Array.from(closedGateIds),
    };
    setSubmittedEvents(events);
    setPlacementType(null);
    setScenarioRunning(true);
    setRunError(null);
    try {
      const result = await runScenarioSimulation(request);
      setScenarioResult(result);
    } catch (err) {
      console.error('시나리오 실행 실패', err);
      setRunError(toDisplayErrorMessage(err, '시뮬레이션 실행 중 오류가 발생했습니다.'));
    } finally {
      setScenarioRunning(false);
    }
  };

  // UI Handlers for Scenario Form (After)
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

  const visibleEvents = scenarioResult
      ? submittedEvents.filter((ev) => (ev.triggerStep ?? 1) <= currentStepNumber)
      : events;
  const focusEvent = scenarioResult
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
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">비교 시뮬레이션</h1>
        <p className="mt-1 text-sm text-slate-500">
          정책 개입 전(Before)과 후(After)의 인구 이동 및 위험도를 듀얼 맵으로 직관적으로 비교합니다.
        </p>
      </div>

      {layoutError && <ErrorBanner message={layoutError} onRetry={loadLayout} />}

      {isLayoutLoading ? (
          <Spinner label="레이아웃 정보를 불러오는 중..." />
      ) : (
          <div className="flex flex-col xl:flex-row gap-6">
            
            {/* 좌측 패널 (폼 영역) */}
            <div className="w-full xl:w-[350px] space-y-4 shrink-0">
              {runError && <ErrorBanner message={runError} />}
              
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                  <button 
                    className="w-full px-4 py-3 text-left font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex justify-between items-center"
                    onClick={() => setActiveStep('before')}
                  >
                    <span>1. 상태 예측 (Before)</span>
                    <span className="text-xs px-2 py-1 bg-slate-50 dark:bg-slate-950 rounded text-slate-500 dark:text-slate-400">
                      {predictResult ? '완료' : '대기'}
                    </span>
                  </button>
                  {activeStep === 'before' && (
                    <div className="p-4 border-t border-slate-300 dark:border-slate-700">
                      <PredictForm
                          marketId={markets[0]?.marketId ?? 0}
                          isRunning={isPredicting}
                          onSubmit={handleRunPredict}
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                  <button 
                    className="w-full px-4 py-3 text-left font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex justify-between items-center"
                    onClick={() => setActiveStep('after')}
                  >
                    <span>2. 정책 개입 (After)</span>
                    <span className="text-xs px-2 py-1 bg-slate-50 dark:bg-slate-950 rounded text-slate-500 dark:text-slate-400">
                      {scenarioResult ? '완료' : '대기'}
                    </span>
                  </button>
                  {activeStep === 'after' && (
                    <div className="p-4 border-t border-slate-300 dark:border-slate-700 h-[600px] overflow-y-auto custom-scrollbar">
                      <ScenarioForm
                          isRunning={isScenarioRunning}
                          onSubmit={handleRunScenario}
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
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 우측 패널 (듀얼 맵 & 차트) */}
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
              <div className="flex flex-col md:flex-row gap-4 h-[450px]">
                {/* Before Map */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">개입 전 (Before)</div>
                  <div className="flex-1 relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                    <HeatmapView
                        zones={zones}
                        agents={getBeforeAgents()}
                        width="100%"
                        height="100%"
                        transitionMs={intervalMs}
                    />
                    {!predictResult && (
                      <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 z-10 backdrop-blur-[2px]">
                        예측을 실행해주세요
                      </div>
                    )}
                  </div>
                </div>

                {/* After Map */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex justify-between items-center">
                    <span>개입 후 (After)</span>
                  </div>
                  <div className="flex-1 relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                    <KakaoMapView
                        zones={zones}
                        agents={getAfterAgents()}
                        width="100%"
                        height="100%"
                        transitionMs={intervalMs}
                        corridors={corridors}
                        gates={gates}
                        closedGateIds={closedGateIds}
                        onGateClick={handleGateClick}
                        placementType={placementType}
                        onPlaceObject={handlePlaceObject}
                        placedObjects={objects}
                        events={visibleEvents}
                        focusEvent={focusEvent}
                    />
                  </div>
                </div>
              </div>

              {/* Master Playback Controller */}
              <div className="flex items-center gap-3 rounded bg-white dark:bg-slate-900 px-4 py-3 text-xs text-slate-700 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-700">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={maxFrames === 0}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
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
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">~{(playIndex + 1) * STEP_DURATION_SECONDS}초</span>
                </div>

                <select
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(Number(e.target.value))}
                    className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1 py-1 text-slate-800 dark:text-slate-200 outline-none shrink-0"
                >
                  {SPEED_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}x</option>
                  ))}
                </select>
              </div>

              {/* Summary and Chart */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">비교 결과 요약</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">최종 위험도</div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700 dark:text-slate-300">Before</span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400">{predictResult?.finalOverallRiskScore.toFixed(2) ?? '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700 dark:text-slate-300">After</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{scenarioResult?.finalRiskScore?.score.toFixed(2) ?? '-'}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="text-xs text-slate-500 mb-1">대피 소요 시간</div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-700 dark:text-slate-300">After (시나리오)</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {scenarioResult?.evacuationTimeSeconds ? `${scenarioResult.evacuationTimeSeconds} 초` : (scenarioResult ? '대피 미완료' : '-')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <RiskTrendChart 
                    beforeTrend={predictResult?.riskTrend}
                    // ScenarioResult does not include riskTrend, so we cannot plot afterTrend
                  />
                </div>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
