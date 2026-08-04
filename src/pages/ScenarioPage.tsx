import { useEffect, useRef, useState } from 'react';
import HeatmapView from '../components/KakaoMapView';
import RiskScorePanel from '../components/RiskScorePanel';
import ScenarioForm from '../components/ScenarioForm';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { fetchMarkets, fetchZones, fetchCorridors, fetchGates, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { ScenarioRequest, PlacedObject, EventTrigger, CorridorPolicy, Corridor, Gate, Zone } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];

const OBJECT_TYPES = new Set<PlacedObject['objectType']>(['food_truck', 'obstacle', 'event_zone', 'rest_area']);

const MAP_SIZE = 720;
const SPEED_OPTIONS = [0.5, 1, 2, 4];
const BASE_INTERVAL_MS = 500;
const STEP_DURATION_SECONDS = 10;

export default function ScenarioPage() {
  const {
    markets,
    setMarkets,
    zones,
    setZones,
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
  const [closedGateIds, setClosedGateIds] = useState<Set<number>>(new Set());

  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [events, setEvents] = useState<EventTrigger[]>([]);
  const [submittedEvents, setSubmittedEvents] = useState<EventTrigger[]>([]);
  const [placementType, setPlacementType] = useState<PlacementKind | null>(null);
  const [nextIntensity, setNextIntensity] = useState(0.5);
  const [nextTriggerStep, setNextTriggerStep] = useState(1);

  const [playIndex, setPlayIndex] = useState(0);
  const [playSpeed, setPlaySpeed] = useState(1);
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
          if (_zones.length > 0) {
            setZones(_zones);
          }
          setCorridors(_corridors);
          setGates(_gates);
        })
        .catch((err) => {
          console.error('시장/구역/통로/게이트 정보 로드 실패', err);
          setLayoutError(toDisplayErrorMessage(err, '시장/구역/통로/게이트 정보를 불러오지 못했습니다.'));
        })
        .finally(() => setLayoutLoading(false));
  };

  useEffect(() => {
    loadLayout();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    setPlayIndex(0);
  }, [scenarioResult]);

  const totalFrames = scenarioResult?.frames.length ?? 0;
  const currentStepNumber = playIndex + 1;

  const isNearAnyTrigger = scenarioResult
      ? submittedEvents.some((ev) => Math.abs(currentStepNumber - (ev.triggerStep ?? 1)) <= 2)
      : false;
  const effectiveSpeed = isNearAnyTrigger ? Math.min(playSpeed, 1) : playSpeed;
  const intervalMs = Math.max(80, BASE_INTERVAL_MS / effectiveSpeed);

  useEffect(() => {
    if (totalFrames === 0) return;
    timerRef.current = window.setInterval(() => {
      setPlayIndex((prev) => (prev >= totalFrames - 1 ? 0 : prev + 1));
    }, intervalMs);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [intervalMs, totalFrames]);

  const visibleEvents = scenarioResult
      ? submittedEvents.filter((ev) => (ev.triggerStep ?? 1) <= currentStepNumber)
      : events;

  const focusEvent = scenarioResult
      ? submittedEvents.find((ev) => (ev.triggerStep ?? 1) === currentStepNumber) ?? null
      : null;

  const handlePlaceObject = (zoneId: number, latitude: number, longitude: number) => {
    if (!placementType) return;
    if (OBJECT_TYPES.has(placementType as PlacedObject['objectType'])) {
      setObjects((prev) => [
        ...prev,
        { objectType: placementType as PlacedObject['objectType'], zoneId, intensity: nextIntensity, latitude, longitude },
      ]);
    } else {
      setEvents((prev) => [
        ...prev,
        {
          eventType: placementType as EventTrigger['eventType'],
          zoneId,
          intensity: nextIntensity,
          latitude,
          longitude,
          triggerStep: nextTriggerStep,
        },
      ]);
    }
  };

  const handleRemoveObject = (index: number) => {
    setObjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveEvent = (index: number) => {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  };

  // 2026-07-29 추가: 이미 배치한 이벤트의 발생 스텝을 리스트에서 바로 수정.
  // "지도 클릭이 스텝 입력보다 먼저 일어나면 옛날 값(기본 1)으로 고정되는"
  // 순서 함정을 근본적으로 없애기 위해 추가함 - 순서를 안 지켜도 나중에 고칠 수 있음.
  const handleUpdateEventTriggerStep = (index: number, value: number) => {
    setEvents((prev) => prev.map((ev, i) => (i === index ? { ...ev, triggerStep: value } : ev)));
  };

  const handleGateClick = (facilityId: number) => {
    setClosedGateIds((prev) => {
      const next = new Set(prev);
      if (next.has(facilityId)) {
        next.delete(facilityId);
      } else {
        next.add(facilityId);
      }
      return next;
    });
  };

  const handleRunScenario = async (
      basicFields: Pick<ScenarioRequest, 'agentCount' | 'steps'> & { corridorPolicies: CorridorPolicy[] }
  ) => {
    const request: ScenarioRequest = {
      agentCount: basicFields.agentCount,
      steps: basicFields.steps,
      corridorPolicies: basicFields.corridorPolicies,
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

  const displayedAgents = scenarioResult ? scenarioResult.frames[playIndex] ?? [] : [];
  const elapsedSeconds = scenarioResult ? currentStepNumber * STEP_DURATION_SECONDS : 0;

  return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          시나리오 기반 What-if 실험
        </h1>

        {layoutError && <ErrorBanner message={layoutError} onRetry={loadLayout} />}

        {isLayoutLoading ? (
            <Spinner label="시장/구역/통로/게이트 정보를 불러오는 중..." />
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1 space-y-4">
                {runError && <ErrorBanner message={runError} />}
                <ScenarioForm
                    isRunning={isScenarioRunning}
                    onSubmit={handleRunScenario}
                    zones={zones}
                    objects={objects}
                    onRemoveObject={handleRemoveObject}
                    events={events}
                    onRemoveEvent={handleRemoveEvent}
                    onUpdateEventTriggerStep={handleUpdateEventTriggerStep}
                    placementType={placementType}
                    onSelectPlacementType={setPlacementType}
                    nextIntensity={nextIntensity}
                    onNextIntensityChange={setNextIntensity}
                    nextTriggerStep={nextTriggerStep}
                    onNextTriggerStepChange={setNextTriggerStep}
                />
              </div>

              <div className="lg:col-span-3 space-y-6">
                <div className="relative" style={{ width: MAP_SIZE }}>
                  <HeatmapView
                      zones={zones}
                      agents={displayedAgents}
                      width={MAP_SIZE}
                      height={MAP_SIZE}
                      transitionMs={scenarioResult ? intervalMs : 0}
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

                  {scenarioResult && (
                      <div className="absolute top-2 right-24 flex items-center gap-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-300">
                        <span className="whitespace-nowrap">
                          {currentStepNumber}/{totalFrames} (~{elapsedSeconds}초)
                          {isNearAnyTrigger ? ' ⚠' : ''}
                        </span>
                        <select
                            value={playSpeed}
                            onChange={(e) => setPlaySpeed(Number(e.target.value))}
                            className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-slate-800 dark:text-slate-200"
                        >
                          {SPEED_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}x</option>
                          ))}
                        </select>
                      </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RiskScorePanel
                      risks={scenarioResult?.finalRiskScore ? [
                        {
                          riskId: 999,
                          marketId: markets[0]?.marketId ?? 0,
                          zoneId: 0,
                          riskScore: scenarioResult.finalRiskScore.score,
                          riskLevel: scenarioResult.finalRiskScore.level,
                          reasonCode: '시뮬레이션 결과',
                          detectedAt: scenarioResult.finalRiskScore.timestamp
                        }
                      ] : []}
                  />
                  <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                    <h3 className="text-sm text-slate-500 dark:text-slate-400 mb-2">실험 결과 요약</h3>
                    {scenarioResult ? (
                        <div className="space-y-2 text-slate-800 dark:text-slate-200 text-sm">
                          <div className="flex justify-between">
                            <span className="opacity-80">대피 소요 시간</span>
                            <span className="font-semibold">
                          {scenarioResult.evacuationTimeSeconds
                              ? `${scenarioResult.evacuationTimeSeconds} 초`
                              : '대피 미완료'}
                        </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-80">시뮬레이션 프레임</span>
                            <span>{scenarioResult.frames.length} steps</span>
                          </div>
                        </div>
                    ) : (
                        <div className="text-slate-500 text-sm">
                          시나리오를 실행하면 결과가 표시됩니다.
                        </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        )}
      </div>
  );
}