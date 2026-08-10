import { useEffect, useState, useRef } from 'react';
import HeatmapView from '../components/HeatmapView';
import ScenarioForm from '../components/ScenarioForm';
import PolicyAnalysisPanel from '../components/PolicyAnalysisPanel';
import type { ObjectRemovalResult } from '../components/PolicyAnalysisPanel';
import RiskTrendChart from '../components/RiskTrendChart';
import ComparisonKpiTiles from '../components/ComparisonKpiTiles';
import ZoneRiskSmallMultiples from '../components/ZoneRiskSmallMultiples';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
import { fetchMarkets, fetchZones, fetchCorridors, fetchGates, fetchBuildings, runPredictSimulation, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { useAuthStore } from '../store/authStore';
import { canSwitchMarket } from '../auth/permissions';
import { useReportGeneration } from '../hooks/useReportGeneration';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { PredictRequest, ScenarioRequest, PlacedObject, EventTrigger, CorridorPolicy, Corridor, Gate, Zone, Building } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];
const OBJECT_TYPES = new Set<PlacedObject['objectType']>(['food_truck', 'obstacle', 'event_zone', 'rest_area']);
const isEventPlacementType = (t: PlacementKind | null): t is EventTrigger['eventType'] =>
    t === 'fire';
const SPEED_OPTIONS = [0.5, 1, 2, 4];

// 2026-08-XX: 건물 폴리곤(GeoJSON 문자열)의 중심 좌표(lat/lon)를 구한다.
// 화재를 가장 가까운 건물 위로 스냅하는 데 쓴다.
function buildingCentroid(polygonCoordinates: string): { lat: number; lon: number } | null {
  try {
    const geo = JSON.parse(polygonCoordinates);
    const ring = geo?.coordinates?.[0];
    if (!ring || ring.length === 0) return null;
    let sx = 0, sy = 0, n = 0;
    for (const [plon, plat] of ring) { sx += plon; sy += plat; n++; }
    if (n === 0) return null;
    return { lat: sy / n, lon: sx / n };
  } catch {
    return null;
  }
}

// 2026-08-XX: 개입 전/후 비교 요약용 포맷·변화 헬퍼.
function fmtNum(v: number | null | undefined, digits = 2, suffix = ''): string {
  if (v === null || v === undefined) return '-';
  return v.toFixed(digits) + suffix;
}
// 개입 전(before) → 후(after) 변화 배지. lowerIsBetter면 감소가 개선(초록).
function DeltaBadge({
  before, after, lowerIsBetter = true, digits = 2, suffix = '', zone, neutral = false, minBaseForPct = 0,
}: {
  before: number | null | undefined;
  after: number | null | undefined;
  lowerIsBetter?: boolean;
  digits?: number;
  suffix?: string;
  zone?: string | null;
  // neutral=true: 개선/악화 판정(색)을 하지 않고 변화량만 회색으로 표시.
  // (대피 인원·시간처럼 유동인구에 딸려 움직여 "좋다/나쁘다"로 단정하기 어려운 지표용)
  neutral?: boolean;
  // 기준값(before)이 이 값보다 작으면 백분율을 생략한다(절대차만 표시).
  // 예: 최종 위험도가 화재 진압 후 1.6→2.0처럼 둘 다 노이즈 수준일 때
  // (2.0-1.6)/1.6=+25% 같은 과장된 %가 뜨는 것을 막는다.
  minBaseForPct?: number;
}) {
  if (before === null || before === undefined || after === null || after === undefined) {
    return <span className="text-slate-500 text-xs">-</span>;
  }
  const diff = after - before;
  const zoneStr = zone ? <span className="text-slate-500 font-normal"> {zone}</span> : null;
  if (Math.abs(diff) < Math.pow(10, -digits) / 2) {
    return <span className="text-xs text-slate-500 dark:text-slate-400">±0{zoneStr}</span>;
  }
  const arrow = diff < 0 ? '▼' : '▲';
  const showPct = before !== 0 && Math.abs(before) >= minBaseForPct;
  const pct = showPct ? ` (${diff > 0 ? '+' : ''}${Math.round((diff / before) * 100)}%)` : '';
  const body = `${arrow} ${diff > 0 ? '+' : ''}${diff.toFixed(digits)}${suffix}${pct}`;
  if (neutral) {
    return <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{body}{zoneStr}</span>;
  }
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  const color = improved
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
    : 'text-red-600 dark:text-red-400 bg-red-500/10';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {body}{zoneStr}
    </span>
  );
}

// 클릭한 (lon,lat)가 이 건물 폴리곤 안에 있는지 (ray-casting).
function buildingContains(polygonCoordinates: string, lon: number, lat: number): boolean {
  try {
    const geo = JSON.parse(polygonCoordinates);
    const ring = geo?.coordinates?.[0];
    if (!ring || ring.length === 0) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  } catch {
    return false;
  }
}
const BASE_INTERVAL_MS = 500;
const STEP_DURATION_SECONDS = 10;

// 2026-08-06 추가 (시장 선택 · 보고서 생성)
//
// 시장 선택: 지금까지 markets[0]을 그대로 쓰고 있어서, 관리자(ROL01)는 시장이 여러
// 개여도 첫 번째만 실험할 수 있었다. 관제요원(ROL02)은 BE /markets 응답 자체가 담당
// 시장 1개로 필터링되어 내려오므로(MarketService.getMarkets) 고를 것이 없어 탭을
// 띄우지 않는다. 실행 요청의 marketId는 BE가 다시 검증한다
// (SimulationService.assertMarketInScope) - 화면의 선택을 믿고 통과시키지 않는다.
//
// 보고서 생성: 방금 실행한 시나리오로 곧바로 정책 보고서를 만든다. 제목과 질문은
// 기본값에 맡기고 한 번 누르면 끝나도록 했다. 직접 지정하거나 다시 만들려면
// 시나리오 이력 화면(/scenario-history)을 쓴다 - 이 화면은 이미 설정 항목이 많아 입력 폼을
// 하나 더 얹으면 실행 흐름이 묻힌다.
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

  const user = useAuthStore((s) => s.user);
  const showMarketTabs = canSwitchMarket(user);

  const [isLayoutLoading, setLayoutLoading] = useState(markets.length === 0);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // 실험 대상 시장. undefined는 "아직 시장 목록을 못 받았다"는 뜻이고, 목록이 오면
  // 첫 번째로 확정한다(그래야 탭의 active 표시가 실제 대상과 항상 일치한다).
  const [selectedMarketId, setSelectedMarketId] = useState<number | undefined>(undefined);

  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  // 2026-08-XX: 게이트 개폐를 개입 전(before)/후(after) 독립적으로 관리.
  const [afterClosedGateIds, setAfterClosedGateIds] = useState<Set<number>>(new Set());
  const [beforeClosedGateIds, setBeforeClosedGateIds] = useState<Set<number>>(new Set());

  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [events, setEvents] = useState<EventTrigger[]>([]);
  const [submittedEvents, setSubmittedEvents] = useState<EventTrigger[]>([]);
  const [placementType, setPlacementType] = useState<PlacementKind | null>(null);
  const [nextIntensity, setNextIntensity] = useState(0.5);
  const [nextTriggerStep, setNextTriggerStep] = useState(1);
  // 2026-08-XX: 화재 진압 스텝(사용자 지정). 발생~진압 사이가 연소 기간.
  const [nextExtinguishStep, setNextExtinguishStep] = useState(20);
  const RECOVERY_STEPS = 12; // 진압 후 복구(위험도 감쇠) 기간(자동)
  const [corridorPolicies, setCorridorPolicies] = useState<CorridorPolicy[]>([]);

  const [steps, setSteps] = useState(30);
  const [agentCount, setAgentCount] = useState(100);
  /**
   * 'llm': LLM 분석 완료 후 자동 세팅 상태. ScenarioForm이 잠김.
   * 'manual': 기본 상태. ScenarioForm을 사용자가 직접 조작 가능.
   */
  const [scenarioMode, setScenarioMode] = useState<'manual' | 'llm'>('manual');
  /**
   * 현행안(Before)에 배치된 오브젝트 목록.
   * 지금은 빈 배열(없음).
   * 나중에 DB에 장애물 데이터를 심으면 이수학으로 로드하면 돼.
   */
  const [beforeObjects, setBeforeObjects] = useState<PlacedObject[]>([]);
  /**
   * LLM objectsToRemove 항목별 제거 결과.
   * 목분은 beforeObjects와 매칭한 결과:
   *  'removed'  → Before에 해당 오브젝트가 있었고 삭제됨 (철거 완료 배지)
   *  'compliant'→ Before에 없었음 / 이미 준수 (현장 준수 처리 배지)
   */
  const [objectRemovalResults, setObjectRemovalResults] = useState<ObjectRemovalResult[]>([]);

  const {
    generate: generateReportFor,
    isGenerating: isGeneratingReport,
    error: reportError,
    clearError: clearReportError,
    lastReport,
  } = useReportGeneration();

  const [playIndex, setPlayIndex] = useState(0);
  const [mapViewport, setMapViewport] = useState<{ lon: number; lat: number; zoom: number } | undefined>(undefined);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 2026-08-06: 시장 목록 로드와 구역/통로/게이트/건물 로드를 분리했다. 관리자가 시장을
  // 전환하면 뒤쪽만 다시 불러야 하는데, 하나로 묶여 있으면 시장 목록까지 매번 다시
  // 읽는다(useSimulationData가 대시보드에서 같은 이유로 분리한 것과 같은 구조).
  const loadLayout = (marketId: number) => {
    setLayoutLoading(true);
    setLayoutError(null);
    Promise.all([
      fetchZones(marketId),
      fetchCorridors(marketId),
      fetchGates(marketId),
      fetchBuildings(marketId),
    ])
      .then(([zoneData, corridorData, gateData, buildingData]: [Zone[], Corridor[], Gate[], Building[]]) => {
        setZones(zoneData);
        setCorridors(corridorData);
        setGates(gateData);
        setBuildings(buildingData);
      })
      .catch((err) => {
        console.error('레이아웃 정보 로드 실패', err);
        setLayoutError(toDisplayErrorMessage(err, '레이아웃 정보를 불러오지 못했습니다.'));
      })
      .finally(() => setLayoutLoading(false));
  };

  const loadMarkets = () => {
    setLayoutError(null);
    fetchMarkets()
      .then((marketData) => {
        setMarkets(marketData);
        if (marketData.length === 0) {
          setLayoutLoading(false);
          setLayoutError('조회할 수 있는 시장이 없습니다. 담당 시장이 지정되어 있는지 확인해주세요.');
          return;
        }
        setSelectedMarketId((prev) => prev ?? marketData[0].marketId);
      })
      .catch((err) => {
        console.error('시장 정보 로드 실패', err);
        setLayoutError(toDisplayErrorMessage(err, '시장 정보를 불러오지 못했습니다.'));
        setLayoutLoading(false);
      });
  };

  useEffect(() => {
    loadMarkets();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (selectedMarketId === undefined) return;
    loadLayout(selectedMarketId);
    // eslint-disable-next-line
  }, [selectedMarketId]);

  /**
   * 시장을 바꾼다.
   *
   * 배치한 오브젝트·이벤트·통로정책은 모두 이전 시장의 zoneId를 가리키므로 함께
   * 비운다. 남겨두면 새 시장에 없는 구역을 지목한 요청이 되어 SIM이 엉뚱한 곳을
   * 계산하거나 400으로 거절한다. 실행 결과도 다른 시장 것이라 같이 지운다.
   */
  const handleSelectMarket = (marketId: number) => {
    if (marketId === selectedMarketId) return;
    handleReset();
    setSelectedMarketId(marketId);
  };

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
    // 시장 목록이 아직 안 왔거나 비어 있으면 실행할 대상이 없다. 예전에는 이 경우
    // marketId 0으로 요청이 나가 BE에서 "시장을 찾을 수 없습니다"로 끝났다.
    if (selectedMarketId === undefined) {
      setRunError('시장 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setSubmittedEvents(events);
    setPlacementType(null);
    setPredicting(true);
    setScenarioRunning(true);
    setRunError(null);
    clearReportError();

    const marketId = selectedMarketId;
    // 개입 후(scenario) SIM은 agentCount >= 1만 허용한다. 입력칸을 min=1로 막아뒀지만
    // 직접 0/빈값을 타이핑한 경우까지 방어해 양쪽 파이프라인이 같은 유효값을 받게 한다.
    const safeAgentCount = Math.max(1, Math.floor(agentCount) || 1);
    // 실행 시점에 발생/진압 스텝으로 연소기간(burnSteps)을 재계산해 SIM에 보낸다.
    // (발생·진압을 나중에 수정해도 항상 일관되게 반영되도록)
    const simEvents: EventTrigger[] = events.map((ev) => {
      const trig = ev.triggerStep ?? 1;
      const ext = ev.extinguishStep ?? trig + 18;
      return {
        ...ev,
        burnSteps: Math.max(1, ext - trig),
        recoverySteps: ev.recoverySteps ?? RECOVERY_STEPS,
      };
    });
    const predictReq: PredictRequest = {
      marketId,
      steps,
      totalInflow: safeAgentCount,
      events: simEvents,
      closedGateIds: Array.from(beforeClosedGateIds),
    };
    const scenarioReq: ScenarioRequest = {
      marketId,
      steps,
      agentCount: safeAgentCount,
      objects,
      events: simEvents,
      closedGateIds: Array.from(afterClosedGateIds),
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
    setAfterClosedGateIds(new Set());
    setBeforeClosedGateIds(new Set());
    setPlacementType(null);
    setPredictResult(null);
    setScenarioResult(null);
    setPlayIndex(0);
    setIsPlaying(false);
    setRunError(null);
    clearReportError();
    setScenarioMode('manual');
    setBeforeObjects([]);
    setObjectRemovalResults([]);
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
      // 화재는 현실적으로 상가 건물에서 발생하므로, 클릭 지점에서 가장 가까운
      // 건물 폴리곤(DB mrkbldg01m)의 중심으로 스냅해 그 상가 건물 위에 🔥가
      // 뜨게 한다. SIM도 이 좌표를 그대로 써서 그 건물 앞 길에 있던 사람부터
      // 대피시키므로 아이콘과 발화 지점이 일치한다.
      let fireLat = lat;
      let fireLon = lon;
      // 1) 클릭 지점이 어떤 건물 폴리곤 안이면 바로 그 건물 중심에 화재.
      const containing = buildings.find((b) => buildingContains(b.polygonCoordinates, lon, lat));
      if (containing) {
        const c = buildingCentroid(containing.polygonCoordinates);
        if (c) { fireLat = c.lat; fireLon = c.lon; }
      } else {
        // 2) 건물 밖(길 등)을 클릭했으면 가장 가까운 건물 중심에.
        let bestD = Infinity;
        for (const b of buildings) {
          const c = buildingCentroid(b.polygonCoordinates);
          if (!c) continue;
          const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
          if (d < bestD) { bestD = d; fireLat = c.lat; fireLon = c.lon; }
        }
      }
      // 발생/진압 스텝은 그대로 저장(연소기간 burnSteps는 실행 시 재계산).
      // 이렇게 해야 나중에 목록에서 발생·진압을 수정해도 진압 시점이 안 어긋난다.
      setEvents((prev) => [
        ...prev,
        {
          eventType: placementType as EventTrigger['eventType'],
          zoneId,
          intensity: nextIntensity,
          latitude: fireLat,
          longitude: fireLon,
          triggerStep: nextTriggerStep,
          extinguishStep: nextExtinguishStep,
          recoverySteps: RECOVERY_STEPS,
        },
      ]);
    }
  };

  const beforePlacementType = isEventPlacementType(placementType) ? placementType : null;

  // 화재 마커는 발생~진압(extinguish) 스텝까지만 표시하고, 진압 스텝에
  // 사라진다(사용자가 설정한 "진압 스텝"과 일치). 진압 이후의 복구(위험도가
  // 서서히 0으로 감소 + 유동인구 재유입)는 불이 이미 꺼진 상태라 마커 없이
  // 진행된다.
  const fireLifeEnd = (ev: EventTrigger) => {
      const trig = ev.triggerStep ?? 1;
      return ev.extinguishStep ?? trig + (ev.burnSteps ?? 18);
  };
  const visibleEvents = hasResult
      ? submittedEvents.filter(
          (ev) => (ev.triggerStep ?? 1) <= currentStepNumber && currentStepNumber <= fireLifeEnd(ev),
        )
      : events;
  const focusEvent = hasResult
      ? submittedEvents.find((ev) => (ev.triggerStep ?? 1) === currentStepNumber) ?? null
      : null;

  const toggleGate = (setter: React.Dispatch<React.SetStateAction<Set<number>>>) => (facilityId: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(facilityId)) next.delete(facilityId);
      else next.add(facilityId);
      return next;
    });
  };
  const handleBeforeGateClick = toggleGate(setBeforeClosedGateIds);
  const handleAfterGateClick = toggleGate(setAfterClosedGateIds);

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

  // 보고서 대상은 방금 실행한 시나리오(After)다. Before는 비교 기준인 현행안이라
  // 따로 지목하지 않고 BE가 같은 시장의 최신 현행안 결과를 찾아 쓴다.
  //
  // persistedScenarioId는 BE가 실행을 simscnr01m에 저장하고 받은 번호다. scenarioResult가
  // 있는데도 이 값이 없으면 BE가 아직 옛 버전이라는 뜻이라, 버튼을 잠그고 이유를 알린다
  // (scenarioResult.scenarioId는 SIM이 만든 UUID여서 대신 쓸 수 없다).
  const reportScenarioId = scenarioResult?.persistedScenarioId ?? null;
  const canGenerateReport = reportScenarioId !== null && !isGeneratingReport;

  const handleGenerateReport = () => {
    if (reportScenarioId === null) return;
    generateReportFor({ scenarioId: reportScenarioId });
  };

  // 버튼 바로 아래 한 줄로 들어가는 안내다. 두 줄로 접히면 버튼이 위로 밀려 헤더가
  // 흔들리므로 whitespace-nowrap으로 줄바꿈을 막고, 한 줄에 들어갈 길이로 쓴다.
  const reportHint = isGeneratingReport
      ? '자료 검색과 문서 작성에 1~3분 걸립니다'
      : !scenarioResult
      ? '시뮬레이션 결과를 바탕으로 보고서를 생성합니다'
      : reportScenarioId === null
      ? '시나리오 번호가 없어 보고서를 생성할 수 없습니다'
      : '시뮬레이션 결과를 바탕으로 보고서를 생성합니다';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">비교 시뮬레이션</h1>
          <p className="mt-1 text-sm text-slate-500">
            정책 개입 전(Before)과 후(After)의 인구 이동 및 위험도를 듀얼 맵으로 직관적으로 비교합니다.
          </p>
        </div>

        {/* 실행한 시나리오로 정책 보고서(DOCX)를 만든다. 제목과 질문을 직접 지정하거나
            다시 만들려면 시나리오 이력 화면을 쓴다. */}
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={!canGenerateReport}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGeneratingReport ? '보고서 생성 중...' : '보고서 생성'}
          </button>
          {reportHint && (
            <span className="whitespace-nowrap text-right text-xs text-slate-500">{reportHint}</span>
          )}
          {/* 지금 화면에 보이는 실행의 보고서일 때만 알린다. 초기화하거나 시장을 바꾸면
              다른 실행이 되므로 이 안내도 사라져야 한다. */}
          {lastReport && !isGeneratingReport && lastReport.scenarioId === reportScenarioId && (
            <span className="whitespace-nowrap text-xs text-emerald-600 dark:text-emerald-400">
              보고서를 내려받았습니다 · 시나리오 이력에서 다시 받을 수 있습니다
            </span>
          )}
        </div>
      </div>

      {/* 관리자 전용 시장 전환 탭. 관제요원은 담당 시장 1개만 내려와 고를 것이 없다.
          시장이 하나뿐이어도 탭을 띄운다 - 지금 어느 시장을 실험하는지 보여야 하고,
          관제 대시보드도 같은 조건(markets.length > 0)으로 칩을 노출한다. */}
      {showMarketTabs && markets.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {markets.map((m) => (
            <TabButton
              key={m.marketId}
              active={selectedMarketId === m.marketId}
              onClick={() => handleSelectMarket(m.marketId)}
              small
            >
              {m.marketName}
            </TabButton>
          ))}
        </div>
      )}

      {reportError && <ErrorBanner message={reportError} />}
      {layoutError && (
        <ErrorBanner
          message={layoutError}
          onRetry={() => (selectedMarketId === undefined ? loadMarkets() : loadLayout(selectedMarketId))}
        />
      )}

      {isLayoutLoading ? (
        <Spinner label="레이아웃 정보를 불러오는 중..." />
      ) : (
        <div className="flex flex-col xl:flex-row gap-6">
          <div className="w-full xl:w-[350px] space-y-4 shrink-0">
            {runError && <ErrorBanner message={runError} />}

            <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 flex justify-between items-center">
                <span>시뮬레이션 설정</span>
                <span className="text-xs px-2 py-1 bg-white dark:bg-slate-950 rounded text-slate-500 dark:text-slate-400">
                  {predictResult && scenarioResult ? '완료' : '대기'}
                </span>
              </div>
              <div className="p-4 border-t border-slate-300 dark:border-slate-700 h-[650px] overflow-y-auto custom-scrollbar space-y-4">
                <div className="text-xs text-slate-500">
                  현재 실측 상태(센서 관측값)를 출발점으로, 같은 스텝 수·유입 인원 조건에서
                  Before(정책 개입 없음)와 After(아래 정책 개입 반영)를 동시에 실행해서 비교합니다.
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">예측 스텝 수</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200"
                    disabled={isPredicting || isScenarioRunning}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                    총 유입 인원 (전체 스텝에 무작위로 분산)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={agentCount}
                    onChange={(e) => setAgentCount(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200"
                    disabled={isPredicting || isScenarioRunning}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    스텝마다 인원수가 들쭉날쭉하게 무작위로 유입되고, 전체 합계가 이 값에
                    맞춰집니다. 최소 1명 이상이어야 합니다(개입 후 시나리오가 0명을 허용하지 않음).
                  </p>
                </div>

                <div className="border-t border-slate-300 dark:border-slate-700 pt-3">
                  <h3 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    정책 개입 · 이벤트
                    <span className="block font-normal text-slate-500 normal-case mt-1">
                      오브젝트/통로정책/게이트는 After 전용, 이벤트(화재)는
                      Before·After 양쪽 지도 어디서 찍든 같은 위치에 동시 반영됩니다.
                    </span>
                  </h3>
                  <PolicyAnalysisPanel
                    isLlmMode={scenarioMode === 'llm'}
                    objectRemovalResults={objectRemovalResults}
                    onSwitchToManual={() => setScenarioMode('manual')}
                    onReset={() => {
                      setCorridorPolicies([]);
                      setAfterClosedGateIds(new Set());
                      setObjectRemovalResults([]);
                      setScenarioMode('manual');
                    }}
                    onAnalyzeSuccess={(result) => {
                      // objectsToRemove: beforeObjects와 매칭 → '철거됨' vs '현장 준수' 결정
                      const removals = result.objectsToRemove ?? [];
                      const newRemovalResults: ObjectRemovalResult[] = removals.map(removal => {
                        const zn = zones.find(z => z.zoneId === removal.zoneId)?.zoneName
                          ?? `Zone ${removal.zoneId}`;
                        const matched = beforeObjects.find(
                          o => o.zoneId === removal.zoneId && o.objectType === removal.objectType
                        );
                        return { ...removal, zoneName: zn, status: matched ? 'removed' : 'compliant' };
                      });
                      setObjectRemovalResults(newRemovalResults);

                      // Before에서 매칭된 오브젝트 실제 제거 (나중에 DB 연동 시 효과적)
                      const removedKeys = new Set(
                        newRemovalResults
                          .filter(r => r.status === 'removed')
                          .map(r => `${r.zoneId}:${r.objectType}`)
                      );
                      if (removedKeys.size > 0) {
                        setBeforeObjects(prev =>
                          prev.filter(o => !removedKeys.has(`${o.zoneId}:${o.objectType}`))
                        );
                      }

                      if (result.corridorPolicies) {
                        setCorridorPolicies(result.corridorPolicies);
                      }
                      if (result.closedGateIds) {
                        setAfterClosedGateIds(new Set(result.closedGateIds));
                      }
                      if (result.agentCount) {
                        setAgentCount(result.agentCount);
                      }
                      setScenarioMode('llm');
                    }}
                  />

                  <div className="mt-4">
                    <ScenarioForm
                      isRunning={isPredicting || isScenarioRunning}
                      isLlmMode={scenarioMode === 'llm'}
                      steps={steps}
                      zones={zones}
                    objects={objects}
                    onRemoveObject={(idx) => setObjects((prev) => prev.filter((_, i) => i !== idx))}
                    events={events}
                    onRemoveEvent={(idx) => setEvents((prev) => prev.filter((_, i) => i !== idx))}
                    onUpdateEventTriggerStep={(idx, val) =>
                      setEvents((prev) => prev.map((ev, i) => (i === idx ? { ...ev, triggerStep: val } : ev)))
                    }
                    onUpdateEventExtinguishStep={(idx, val) =>
                      setEvents((prev) => prev.map((ev, i) => (i === idx ? { ...ev, extinguishStep: val } : ev)))
                    }
                    placementType={placementType}
                    onSelectPlacementType={setPlacementType}
                    nextIntensity={nextIntensity}
                    onNextIntensityChange={setNextIntensity}
                    nextTriggerStep={nextTriggerStep}
                    onNextTriggerStepChange={setNextTriggerStep}
                    nextExtinguishStep={nextExtinguishStep}
                    onNextExtinguishStepChange={setNextExtinguishStep}
                    corridors={corridorPolicies}
                    onAddCorridor={handleAddCorridor}
                      onRemoveCorridor={handleRemoveCorridor}
                    />
                  </div>
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
                  className="w-full rounded border border-slate-300 dark:border-slate-600 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="flex flex-col md:flex-row gap-4 h-[450px]">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">개입 전 (Before)</div>
                <div className="flex-1 relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                  <HeatmapView
                    zones={zones}
                    agents={getBeforeAgents()}
                    width="100%"
                    height="100%"
                    transitionMs={intervalMs}
                    buildings={buildings}
                    corridors={corridors}
                    gates={gates}
                    closedGateIds={beforeClosedGateIds}
                    onGateClick={handleBeforeGateClick}
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
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex justify-between items-center">
                  <span>개입 후 (After)</span>
                </div>
                <div className="flex-1 relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                  <HeatmapView
                    zones={zones}
                    agents={getAfterAgents()}
                    width="100%"
                    height="100%"
                    transitionMs={intervalMs}
                    buildings={buildings}
                    corridors={corridors}
                    gates={gates}
                    closedGateIds={afterClosedGateIds}
                    onGateClick={handleAfterGateClick}
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

            <div className="flex items-center gap-3 rounded bg-white dark:bg-slate-900 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-700">
              <button
                onClick={() => {
                  if (!isPlaying && maxFrames > 0 && playIndex >= maxFrames - 1) {
                    setPlayIndex(0);
                  }
                  setIsPlaying(!isPlaying);
                }}
                disabled={maxFrames === 0}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 transition-colors hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
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
                <span className="font-mono">
                  {playIndex + 1} / {Math.max(1, maxFrames)}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  ~{(playIndex + 1) * STEP_DURATION_SECONDS}초
                </span>
              </div>

              <select
                value={playSpeed}
                onChange={(e) => setPlaySpeed(Number(e.target.value))}
                className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1 py-1 text-slate-800 dark:text-slate-200 outline-none shrink-0"
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </div>

            {/* 개입 전/후 요약 KPI — 어떤 개입에서도 항상 반응하는 3개 지표 */}
            <ComparisonKpiTiles
              before={predictResult}
              after={scenarioResult}
              hasFire={submittedEvents.some((e) => e.eventType === 'fire')}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">비교 결과 요약</h3>

                {/* 지표 비교표 */}
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left font-medium pb-1">지표</th>
                      <th className="text-right font-medium pb-1 text-orange-600 dark:text-orange-400">개입 전</th>
                      <th className="text-right font-medium pb-1 text-blue-600 dark:text-blue-400">개입 후</th>
                      <th className="text-right font-medium pb-1">변화</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-300">
                    <tr className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">최종 위험도</td>
                      <td className="text-right text-orange-600 dark:text-orange-400 font-semibold">{fmtNum(predictResult?.finalOverallRiskScore, 1)}</td>
                      <td className="text-right text-blue-600 dark:text-blue-400 font-semibold">{fmtNum(scenarioResult?.finalRiskScore?.score, 1)}</td>
                      <td className="text-right"><DeltaBadge before={predictResult?.finalOverallRiskScore} after={scenarioResult?.finalRiskScore?.score} digits={1} minBaseForPct={10} /></td>
                    </tr>
                    <tr className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">평균 밀집도</td>
                      <td className="text-right text-orange-600 dark:text-orange-400 font-semibold">{fmtNum(predictResult?.averageDensity, 2)}</td>
                      <td className="text-right text-blue-600 dark:text-blue-400 font-semibold">{fmtNum(scenarioResult?.averageDensity, 2)}</td>
                      <td className="text-right"><DeltaBadge before={predictResult?.averageDensity} after={scenarioResult?.averageDensity} digits={2} minBaseForPct={0.05} /></td>
                    </tr>
                    <tr className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">최대 밀집도</td>
                      <td className="text-right text-orange-600 dark:text-orange-400 font-semibold">{fmtNum(predictResult?.maxDensity, 2)}</td>
                      <td className="text-right text-blue-600 dark:text-blue-400 font-semibold">{fmtNum(scenarioResult?.maxDensity, 2)}</td>
                      <td className="text-right"><DeltaBadge before={predictResult?.maxDensity} after={scenarioResult?.maxDensity} digits={2} zone={scenarioResult?.maxDensityZoneName} minBaseForPct={0.05} /></td>
                    </tr>
                    <tr className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">대피 인원</td>
                      <td className="text-right text-orange-600 dark:text-orange-400 font-semibold">{fmtNum(predictResult?.evacuatedCount, 0)}</td>
                      <td className="text-right text-blue-600 dark:text-blue-400 font-semibold">{fmtNum(scenarioResult?.evacuatedCount, 0)}</td>
                      <td className="text-right"><DeltaBadge before={predictResult?.evacuatedCount} after={scenarioResult?.evacuatedCount} digits={0} neutral /></td>
                    </tr>
                    <tr className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">대피 소요(초)</td>
                      <td className="text-right text-orange-600 dark:text-orange-400 font-semibold">{predictResult ? (predictResult.evacuationTimeSeconds ?? '미완료') : '-'}</td>
                      <td className="text-right text-blue-600 dark:text-blue-400 font-semibold">{scenarioResult ? (scenarioResult.evacuationTimeSeconds ?? '미완료') : '-'}</td>
                      <td className="text-right"><DeltaBadge before={predictResult?.evacuationTimeSeconds ?? undefined} after={scenarioResult?.evacuationTimeSeconds ?? undefined} digits={0} suffix="초" neutral /></td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">
                  최종 위험도·평균/최대 밀집도는 <b>마지막 스텝</b> 값이고, 대피 인원은 대피를 <b>시작한 누적</b> 인원(막혀서 못 나간 사람 포함)입니다.
                </p>
              </div>

              <div className="md:col-span-2">
                <RiskTrendChart beforeTrend={predictResult?.riskTrend} afterTrend={scenarioResult?.riskTrend} />
              </div>
            </div>

            {/* 구역별 위험도 추이 — 자동 스케일 스몰멀티플(어떤 개입/조건이든 차이가 보이게) */}
            {(predictResult || scenarioResult) && zones.length > 0 && (
              <ZoneRiskSmallMultiples before={predictResult} after={scenarioResult} zones={zones} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
