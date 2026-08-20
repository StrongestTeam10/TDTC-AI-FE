import { useEffect, useState, useRef, lazy, Suspense } from 'react';
// 2026-08-19: 비교 지도를 3D(HeatmapView3D)로 교체했다. 2D판(HeatmapView)은
// 같은 props 계약을 유지한 채 src/components/HeatmapView.tsx에 그대로 남아 있어,
// 되돌리려면 이 import와 아래 두 곳의 컴포넌트 이름만 바꾸면 된다.
//
// 2026-08-20: 정적 import → React.lazy. three.js 가 이 컴포넌트에만 쓰이는데 정적으로
// 두면 첫 번들에 통째로 들어가(전체 JS 2.04MB 중 ~0.6MB) 게시판만 보는 조회자도 3D
// 엔진을 내려받는다. lazy 로 떼면 /compare 진입 시에만 별도 청크로 로드된다.
// 폴백은 기존 공용 Spinner - 지도 영역 크기는 부모 div 가 잡고 있어 레이아웃이 안 튄다.
const HeatmapView3D = lazy(() => import('../components/HeatmapView3D'));
import ScenarioForm from '../components/ScenarioForm';
import EventSettingsPanel from '../components/EventSettingsPanel';
import PolicyAnalysisPanel from '../components/PolicyAnalysisPanel';
import type { ObjectRemovalResult } from '../components/PolicyAnalysisPanel';
import RiskTrendChart from '../components/RiskTrendChart';
import ComparisonKpiTiles from '../components/ComparisonKpiTiles';
import ZoneRiskSmallMultiples from '../components/ZoneRiskSmallMultiples';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
import InfoTooltip from '../components/ui/InfoTooltip';
import { fetchMarkets, fetchZones, fetchCorridors, fetchGates, fetchBuildings, fetchMarketObjects, runPredictSimulation, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { useAuthStore } from '../store/authStore';
import { canSwitchMarket } from '../auth/permissions';
import { useReportGeneration } from '../hooks/useReportGeneration';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { PredictRequest, ScenarioRequest, PlacedObject, EventTrigger, CorridorPolicy, Corridor, Gate, Building, RiskTrendPoint } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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

// 2026-08-12 추가 (UIUX 피드백)
// 숫자 입력을 끝까지 지울 수 있게 하려고 상태를 number 대신 number | null로 둔다.
// 예전에는 value={steps}에 number를 그대로 물려서, 마지막 한 글자를 지우면
// Number('')가 0이 되어 화면에 "0"이 다시 박혔다. 지워지지 않는 입력처럼 보인다.
// null은 "비어 있음"이고, 실행할 때만 0으로 읽는다.
type NumericInput = number | null;

/** 비어 있으면 0으로 읽는다("다 지우면 0으로"). */
function readNumber(value: NumericInput): number {
  return value ?? 0;
}

/** 입력창에 표시할 값. null이면 빈 문자열이라 실제로 아무것도 남지 않는다. */
function displayNumber(value: NumericInput): string {
  return value === null ? '' : String(value);
}

function parseNumberInput(raw: string): NumericInput {
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 좌측 설정을 Step 1·2·3으로 나눈 아코디언 한 칸.
 *
 * 왜 아코디언인가: 예전에는 설정 전체가 h-[650px] 안에 세로로 쌓여 있어서, 무엇부터
 * 해야 하는지 순서가 드러나지 않고 스크롤을 내려야 뒤쪽 항목이 있는 줄 알 수 있었다.
 * 한 번에 한 단계만 펼치면 (1) 순서가 화면에 그대로 보이고 (2) 각 단계가 짧아져
 * 패널 안쪽 스크롤 자체가 필요 없어진다.
 *
 * 접힌 단계에도 summary를 남겨서, 접어둔 단계에 무엇을 설정했는지 다시 펼치지 않고
 * 확인할 수 있게 했다.
 */
function StepSection({
  step,
  title,
  summary,
  info,
  isOpen,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  summary: string;
  /** 제목 옆 ⓘ 안에 접어 넣을 설명. 없으면 아이콘도 나오지 않는다. */
  info?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
      {/* 2026-08-12 (2차): ⓘ를 제목 바로 옆에 두라는 요청.
          토글 버튼 안에 넣으면 button 안에 button이 되어 마크업이 깨지고, 설명을
          열려고 누른 클릭이 단계 접기까지 같이 실행된다. 그렇다고 버튼 바깥 형제로
          두면 줄 맨 끝(화살표 뒤)으로 밀린다.
          그래서 머리글 줄 전체를 덮는 투명 버튼을 아래에 깔고, 그 위에 내용을 얹되
          내용에는 pointer-events-none을 줘서 클릭이 버튼으로 통과하게 했다.
          ⓘ만 pointer-events-auto로 되살려 자기 클릭(과 말풍선 안 클릭)을 직접 받는다.

          ⚠️ 이 relative 컨테이너는 머리글 줄만 감싼다. 펼쳐진 내용까지 감싸면
          absolute inset-0 버튼이 그 위를 덮어(위치 지정 요소가 일반 흐름 위에 그려진다)
          Step 2의 입력을 누를 때마다 단계가 접힌다. */}
      <div className="group relative">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={`${title} ${isOpen ? '접기' : '펼치기'}`}
          className="absolute inset-0 h-full w-full"
        />
        <div className="pointer-events-none relative flex items-center gap-3 px-4 py-3 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            isOpen
              ? 'bg-blue-600 text-white'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          {step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
            <span className="truncate">{title}</span>
            {info && (
              <span className="pointer-events-auto">
                <InfoTooltip label={`${title} 설명`}>{info}</InfoTooltip>
              </span>
            )}
          </span>
          {/* 접었을 때만 요약을 보여준다. 펼친 상태에서는 실제 입력이 바로 아래 있어서
              같은 내용을 두 번 읽게 된다. */}
          {!isOpen && summary && (
            <span className="mt-0.5 block truncate text-xs text-slate-500">{summary}</span>
          )}
        </span>
          {/* 닫힘 ◀ / 열림 ▼. 화살표가 줄 오른쪽 끝에 있어서, 닫힌 상태에서 왼쪽을
              가리키면 "이쪽 내용을 펼친다"로 읽힌다. */}
          <span aria-hidden className="shrink-0 text-xs text-slate-400">
            {isOpen ? '▼' : '◀'}
          </span>
        </div>
      </div>
      {isOpen && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

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
  useDocumentTitle('시뮬레이션 비교');
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

  const [steps, setSteps] = useState<NumericInput>(30);
  // 2026-08-14: 기본값 0 — 추가 유입 없이 CCTV로 초기 배치된(관측) 인원만으로 시뮬을 돌린다.
  const [agentCount, setAgentCount] = useState<NumericInput>(0);
  // 지금 펼쳐둔 단계. 한 번에 하나만 연다 - 여러 개를 열면 다시 스크롤이 생긴다.
  // null은 "전부 접힘". 2026-08-12: 펼쳐진 단계를 다시 누르면 닫히도록 바꿨다.
  // 예전에는 누르면 항상 열기만 해서, 이미 열린 단계의 머리글은 눌러도 아무 반응이
  // 없었다(접는 방법이 다른 단계를 여는 것뿐이었다).
  const [openStep, setOpenStep] = useState<1 | 2 | 3 | null>(1);

  /** 열린 단계를 누르면 닫고, 닫힌 단계를 누르면 그것만 연다(항상 최대 한 개). */
  const toggleStep = (step: 1 | 2 | 3) => setOpenStep((current) => (current === step ? null : step));
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
   * 2026-08-12 완성본: 시장 구조 등록(mrkobjt01m)에서 불러온 "현행" 오브젝트/통로정책.
   * 개입 전(Before)은 이 현행을 그대로 표시·전송하고 수정하지 않는다(불변).
   * 개입 후(After)는 loadLayout에서 이 현행을 복사한 objects/corridorPolicies state에서 편집한다.
   * (공문분석이 쓰는 beforeObjects와는 별개 - 그쪽 로직은 건드리지 않는다.)
   */
  const [baselineObjects, setBaselineObjects] = useState<PlacedObject[]>([]);
  const [baselineCorridorPolicies, setBaselineCorridorPolicies] = useState<CorridorPolicy[]>([]);
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
  // 읽는다.
  const loadLayout = (marketId: number) => {
    setLayoutLoading(true);
    setLayoutError(null);
    Promise.all([
      fetchZones(marketId),
      fetchCorridors(marketId),
      fetchGates(marketId),
      fetchBuildings(marketId),
      // 2026-08-12: 현행 조회는 실패해도 화면 전체를 막지 않는다(빈 현행으로 폴백).
      // 권한/네트워크 등으로 조회가 안 되더라도 개입 전은 빈 상태로라도 뜨게 한다.
      fetchMarketObjects(marketId).catch((err) => {
        console.warn('현행(시장 구조) 조회 실패 - 빈 현행으로 진행', err);
        return { marketId, objects: [], corridorPolicies: [], updatedAt: null };
      }),
    ])
      .then(([zoneData, corridorData, gateData, buildingData, objectConfig]) => {
        setZones(zoneData);
        setCorridors(corridorData);
        setGates(gateData);
        setBuildings(buildingData);

        // 2026-08-12 완성본: 시장 구조 등록의 "현행"을 개입 전/후 초기값으로 반영한다.
        // - 개입 전(Before): 현행 그대로, 수정 불가 → baseline* 에 담는다.
        // - 개입 후(After): 현행을 복사해 편집 가능한 state(objects/corridorPolicies/afterClosedGateIds)에 넣는다.
        const currentObjects = objectConfig.objects ?? [];
        const currentCorridors = objectConfig.corridorPolicies ?? [];
        // 닫힌 게이트 = isActive === false 인 GATE. (null/true는 열림으로 간주)
        const closedGateIds = gateData.filter((g) => g.isActive === false).map((g) => g.facilityId);

        setBaselineObjects(currentObjects);
        setBaselineCorridorPolicies(currentCorridors);
        setBeforeClosedGateIds(new Set(closedGateIds));

        setObjects(currentObjects.map((o) => ({ ...o })));
        setCorridorPolicies(currentCorridors.map((c) => ({ ...c })));
        setAfterClosedGateIds(new Set(closedGateIds));
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

    // 스텝 수는 비워둘 수 있게 됐지만(입력을 끝까지 지울 수 있도록) 0스텝짜리 실행은
    // 계산할 것이 없다. 요청을 보내 SIM이 400으로 거절하게 두는 대신 여기서 멈추고,
    // 어느 칸을 채워야 하는지 알려준다.
    const runSteps = readNumber(steps);
    if (runSteps < 1) {
      setRunError('예측 스텝 수를 1 이상으로 입력해주세요.');
      setOpenStep(3);
      return;
    }

    setSubmittedEvents(events);
    setPlacementType(null);
    setPredicting(true);
    setScenarioRunning(true);
    setRunError(null);
    clearReportError();

    const marketId = selectedMarketId;
    // 2026-08-14: agentCount는 '추가 유입 인원'으로 0을 허용한다 - 0이면 추가 유입 없이
    // 관측(CCTV 초기배치) 인원만으로 시뮬을 돌린다. SIM(ge=0)·BE(@Min(0))도 0을 받도록
    // 맞춰져 있다. 상태가 number | null이라(비어 있으면 null) readNumber로 0을 만들고,
    // 음수만 방어해 0 이상으로 보낸다.
    const safeAgentCount = Math.max(0, Math.floor(readNumber(agentCount)) || 0);
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
    // 2026-08-12(관측 초기배치): 개입 전/후가 "같은 프레임"의 CCTV 관측을 쓰도록,
    // 실행 시각 하나를 만들어 양쪽 요청에 동일하게 보낸다. BE가 이 값으로 프레임을
    // 골라 관측 초기배치를 조립하므로, 같은 값이면 개입 전/후 초기배치가 일치한다.
    const capturedAt = new Date().toISOString();
    const predictReq: PredictRequest = {
      marketId,
      capturedAt,
      steps: runSteps,
      totalInflow: safeAgentCount,
      events: simEvents,
      closedGateIds: Array.from(beforeClosedGateIds),
      // 2026-08-12 완성본: 개입 전(Before)도 현행 오브젝트/통로정책을 그대로 반영.
      objects: baselineObjects,
      corridorPolicies: baselineCorridorPolicies,
    };
    const scenarioReq: ScenarioRequest = {
      marketId,
      capturedAt,
      steps: runSteps,
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
    // 2026-08-12 완성본: 개입 후(After)를 현행(baseline)으로 되돌린다.
    // 개입 전(Before)/현행 baseline은 항상 현행이라 초기화 대상이 아니다.
    setObjects(baselineObjects.map((o) => ({ ...o })));
    setCorridorPolicies(baselineCorridorPolicies.map((c) => ({ ...c })));
    setAfterClosedGateIds(new Set(beforeClosedGateIds));
    setEvents([]);
    setSubmittedEvents([]);
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
      //
      // 2026-08-12(2차): 화재는 한 건만 등록한다. 예전에는 배치 모드가 켜져 있는 동안
      // 지도를 누를 때마다 계속 쌓여서, 실수로 여러 번 누르면 같은 자리에 여러 건이
      // 겹쳐 등록되고도 목록을 펼치기 전에는 알 수 없었다. 이미 있으면 새로 넣지 않고,
      // 하나를 놓는 즉시 배치 모드를 끈다.
      setEvents((prev) =>
        prev.length > 0
          ? prev
          : [
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
            ],
      );
      setPlacementType(null);
    }
  };

  /**
   * 2026-08-12(3차) 추가: 화재를 무작위 위치·무작위 값으로 한 건 등록한다.
   *
   * 손으로 찍는 방식(지도 클릭)은 그대로 두고, "어디든 한 번 터뜨려 보고 싶다"는
   * 경우를 위한 지름길이다. 위치를 고르는 것 자체가 실험 대상이 아닐 때
   * 지도를 확대해 건물을 찾는 수고를 없앤다.
   *
   * 위치: 건물 폴리곤 중 하나를 골라 그 중심으로 잡는다. 수동 배치도 결국 가장
   * 가까운 건물 중심으로 스냅되므로(handlePlaceObject) 결과 형태가 같다.
   * 구역: 건물 중심이 어느 시뮬레이션 구역 폴리곤 안에 있는지로 역산한다. 지도
   * 클릭 때는 HeatmapView가 zoneId를 넘겨주지만 여기서는 그 경로를 안 거친다.
   */
  const handleAutoPlaceFire = () => {
    if (events.length > 0) return; // 화재는 한 건만
    if (buildings.length === 0 || zones.length === 0) {
      setRunError('건물·구역 정보를 아직 불러오지 못해 자동 등록할 수 없습니다.');
      return;
    }

    // 건물 폴리곤 위에만 놓으면 된다(수동 배치와 같은 규칙). 그 건물이 시뮬레이션
    // 구역 안에 있어야 한다는 제약은 두지 않는다 - 건물 상당수가 구역 폴리곤 밖에
    // 걸쳐 있어 후보가 하나도 안 남았다.
    const centers = buildings
        .map((building) => buildingCentroid(building.polygonCoordinates))
        .filter((center): center is { lat: number; lon: number } => center !== null);

    if (centers.length === 0) {
      setRunError('건물 좌표를 읽지 못해 화재를 자동 등록할 수 없습니다.');
      return;
    }

    const center = centers[Math.floor(Math.random() * centers.length)];

    // zoneId는 반드시 실제 구역이어야 한다. SIM apply_event_triggers가
    // "zoneId not in layout.zones"면 그 화재를 통째로 건너뛰어, 등록은 됐는데
    // 아무 일도 안 일어나는 상태가 된다.
    // 건물이 어느 구역에도 안 들어가면 중심이 가장 가까운 구역에 붙인다
    // (수동 배치도 클릭한 구역을 zoneId로 쓰고 좌표만 건물로 스냅하므로 성격이 같다).
    const containing = zones.find((z) => buildingContains(z.polygonCoordinates, center.lon, center.lat));
    let zoneId = containing?.zoneId;
    if (zoneId === undefined) {
      let best = Infinity;
      for (const zone of zones) {
        const zoneCenter = buildingCentroid(zone.polygonCoordinates);
        if (!zoneCenter) continue;
        const distance = (zoneCenter.lat - center.lat) ** 2 + (zoneCenter.lon - center.lon) ** 2;
        if (distance < best) {
          best = distance;
          zoneId = zone.zoneId;
        }
      }
    }
    if (zoneId === undefined) {
      setRunError('구역 좌표를 읽지 못해 화재를 자동 등록할 수 없습니다.');
      return;
    }

    const picked = { center, zoneId };


    // 발생 스텝은 전체 구간의 앞쪽 60% 안에서 고른다. 끝에 붙으면 대피가 시작되기도
    // 전에 시뮬레이션이 끝나 개입 효과가 드러나지 않는다.
    const totalSteps = Math.max(2, readNumber(steps));
    const trigger = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(totalSteps * 0.6)));
    // 진압은 발생 이후 ~ 마지막 스텝 사이. 최소 1스텝은 타도록 보장한다.
    const extinguish = Math.min(totalSteps, trigger + 1 + Math.floor(Math.random() * 10));
    // 강도는 0.3~1.0. 너무 낮으면 위험도가 거의 안 올라 "터뜨린 보람"이 없다.
    const intensity = Math.round((0.3 + Math.random() * 0.7) * 10) / 10;

    setRunError(null);
    setPlacementType(null);
    setEvents([
      {
        eventType: 'fire',
        zoneId: picked.zoneId,
        intensity,
        latitude: picked.center.lat,
        longitude: picked.center.lon,
        triggerStep: trigger,
        extinguishStep: extinguish,
        recoverySteps: RECOVERY_STEPS,
      },
    ]);
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
  // 2026-08-12 완성본: 개입 전(Before) 게이트는 현행 그대로(읽기전용)라 토글 핸들러가 없다.
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

  // 2026-08-19: 지도에 구역별 위험도 색을 입힌다.
  //
  // riskTrend는 처음부터 스텝별 구역 위험도를 담고 있었는데 지도로 넘겨주는 곳이
  // 없어서, 개입 전/후 두 지도가 늘 같은 회색으로만 보였다. 정책 효과를 눈으로
  // 비교하는 화면인데 정작 위험도가 색으로 안 드러나고 있었다.
  //
  // 프레임과 같은 인덱스를 쓴다 - 사람 위치와 구역 색이 다른 시점을 가리키면
  // "사람이 몰렸는데 파란 구역" 같은 어긋난 그림이 나온다.
  const getZoneRisks = (trend: RiskTrendPoint[] | undefined) => {
    if (!trend || trend.length === 0) return undefined;
    return trend[Math.min(playIndex, trend.length - 1)]?.zones;
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

        {/* 2026-08-12 (UIUX 피드백 p02 "결과 다 보고 생성하도록 맨 밑으로 내리기"):
            보고서 생성 버튼이 화면 맨 위 오른쪽에 있었다. 보고서는 실행 결과를 다 보고
            나서 만드는 것인데, 결과보다 위에 있으니 결과를 보기도 전에 눈에 먼저 들어왔다.
            결과 블록(구역별 위험도 추이)까지 다 지나간 화면 맨 아래로 옮겼다. */}
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
        /* 2026-08-12 (UIUX 피드백 p02 ① "시뮬레이션 설정보다 시뮬 화면이 위로 가게"):
           화면이 좁아 세로로 쌓일 때 설정 패널이 먼저 오고 지도가 그 아래로 밀렸다.
           이 화면의 주인공은 Before/After 지도라 그게 먼저 보여야 한다. order로 좁은
           화면에서만 순서를 뒤집는다(넓은 화면은 좌: 설정, 우: 지도 그대로). */
        <div className="flex flex-col xl:flex-row gap-6">
          <div className="order-2 w-full shrink-0 space-y-4 xl:order-1 xl:w-[350px]">
            {runError && <ErrorBanner message={runError} />}

            {/* 2026-08-12 재구성 (UIUX 피드백 p01)
                "순서대로 Step 1, 2, 3으로 진행하는 건 어떤지? 스크롤 빼게"

                예전 구조는 설정 전체가 h-[650px] 안쪽 스크롤에 들어가 있었다. 화면에
                한 번에 보이는 건 유입 인원까지라, 그 아래 오브젝트 배치·통로 정책이
                있다는 것을 스크롤을 내려봐야 알 수 있었고 무엇을 먼저 정해야 하는지도
                드러나지 않았다.

                손글씨에 적힌 순서를 그대로 단계로 만든다:
                  Step 1 정책 LLM 자동세팅 VS 수동 세팅
                  Step 2 오브젝트 배치·통로 정책 (Policy 모드 시 잠금)
                  Step 3 유입 인원 / 스텝 수
                한 번에 한 단계만 펼치므로 각 단계가 짧고, 안쪽 스크롤(h-[650px] +
                custom-scrollbar)을 통째로 없앨 수 있었다. */}
            <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              {/* 2026-08-12: 항상 펼쳐져 있던 설명 문단을 제목 옆 ⓘ 안으로 접었다.
                  설정 칸보다 안내 문구가 길어 정작 무엇을 입력하는 화면인지 묻혔다. */}
              <div className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  시뮬레이션 설정
                  <InfoTooltip label="시뮬레이션 설정 설명">
                    현재 실측 상태(센서 관측값)를 출발점으로, 같은 스텝 수·유입 인원 조건에서
                    Before(정책 개입 없음)와 After(아래 정책 개입 반영)를 동시에 실행해서
                    비교합니다.
                  </InfoTooltip>
                </span>
                <span className="text-xs px-2 py-1 bg-white dark:bg-slate-950 rounded text-slate-500 dark:text-slate-400">
                  {predictResult && scenarioResult ? '완료' : '대기'}
                </span>
              </div>

              <div className="border-t border-slate-300 dark:border-slate-700">
                <StepSection
                  step={1}
                  title="정책 입력 방식"
                  summary={scenarioMode === 'llm' ? 'LLM 자동 세팅 적용됨' : '수동 설정'}
                  info={
                    <>
                      공문을 넣으면 LLM이 개입 내용을 읽어 Step 2를 자동으로 채웁니다.
                      직접 정하려면 이 단계를 건너뛰고 Step 2로 넘어가세요.
                    </>
                  }
                  isOpen={openStep === 1}
                  onToggle={() => toggleStep(1)}
                >
                  <PolicyAnalysisPanel
                    isLlmMode={scenarioMode === 'llm'}
                    objectRemovalResults={objectRemovalResults}
                    // 요약을 "Zone 1 ↔ Zone 3" / "2, 5번" 대신 구역·게이트 이름으로 쓰기 위해.
                    zones={zones}
                    gates={gates}
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
                      // 분석이 끝나면 자동으로 다음 단계를 펼친다. 결과가 어느 항목으로
                      // 들어갔는지 바로 보이지 않으면 "적용된 게 맞나" 확인할 방법이 없다.
                      setOpenStep(2);
                    }}
                  />
                </StepSection>

                <StepSection
                  step={2}
                  title="개입 설정"
                  summary={
                    [
                      objects.length > 0 && `오브젝트 ${objects.length}`,
                      events.length > 0 && `이벤트 ${events.length}`,
                      corridorPolicies.length > 0 && `통로 정책 ${corridorPolicies.length}`,
                      afterClosedGateIds.size > 0 && `폐쇄 게이트 ${afterClosedGateIds.size}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '설정된 개입 없음'
                  }
                  info={
                    <>
                      시장 구조 등록에 올라간 <b>현행 오브젝트·통로 정책</b>은 개입 전·후
                      양쪽에 똑같이 깔립니다. 그 위에서 <b>개입 후(After)에만</b> 추가하거나
                      지울 수 있고, 그 차이가 곧 개입의 효과입니다.
                      <br />
                      <br />
                      이벤트(화재)는 개입 전·후 양쪽 지도 어디에서 찍든 같은 위치에
                      동시 반영됩니다.
                      <br />
                      <br />
                      {/* p01 "게이트 폐쇄 부분 명시?" - 게이트는 이 패널이 아니라 지도에서
                          직접 눌러 여닫는데, 그 사실이 화면 어디에도 적혀 있지 않았다.
                          폼 안에 없는 조작이라 폼만 보면 존재 자체를 알 수 없다. */}
                      🚪 <b>게이트 폐쇄</b>는 지도 위의 출입구 아이콘을 직접 눌러서 여닫습니다.
                      왼쪽(Before) 지도와 오른쪽(After) 지도의 게이트를 따로 조절할 수 있어요.
                    </>
                  }
                  isOpen={openStep === 2}
                  onToggle={() => toggleStep(2)}
                >
                  <ScenarioForm
                    isRunning={isPredicting || isScenarioRunning}
                    isLlmMode={scenarioMode === 'llm'}
                    zones={zones}
                    objects={objects}
                    onRemoveObject={(idx) => setObjects((prev) => prev.filter((_, i) => i !== idx))}
                    placementType={placementType}
                    onSelectPlacementType={setPlacementType}
                    onSwitchToManual={() => setScenarioMode('manual')}
                    corridors={corridorPolicies}
                    onAddCorridor={handleAddCorridor}
                    onRemoveCorridor={handleRemoveCorridor}
                  />
                </StepSection>

                <StepSection
                  step={3}
                  title="실행 조건"
                  summary={`유입 ${displayNumber(agentCount) || '0'}명 · ${displayNumber(steps) || '0'}스텝`}
                  info={
                    <>
                      Before와 After가 같은 조건에서 돌아야 비교가 되므로, 이 두 값은 양쪽에
                      똑같이 적용됩니다.
                    </>
                  }
                  isOpen={openStep === 3}
                  onToggle={() => toggleStep(3)}
                >
                  <div>
                    <label
                      htmlFor="agent-count"
                      className="mb-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"
                    >
                      추가 유입 인원
                      <InfoTooltip label="추가 유입 인원 설명">
                        CCTV로 관측된 현재 인원에 더해, 스텝마다 무작위로 새 방문객이
                        유입됩니다. 이 값은 관측 인원 위에 추가되는 인원으로, 시뮬레이션은
                        (관측 인원 + 이 값)을 유지합니다. 0으로 두면 추가 유입 없이 관측된
                        현재 인원의 자연스러운 이동만 봅니다.
                      </InfoTooltip>
                    </label>
                    {/* 2026-08-14: 추가 유입 인원은 0 허용 - 0이면 관측(CCTV 초기배치)
                        인원만으로 시뮬을 돌린다. SIM(ge=0)·BE(@Min(0)) 검증도 0을 받는다. */}
                    <input
                      id="agent-count"
                      type="number"
                      min={0}
                      max={100000}
                      value={displayNumber(agentCount)}
                      onChange={(e) => setAgentCount(parseNumberInput(e.target.value))}
                      placeholder="0"
                      className="no-spinner w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200"
                      disabled={isPredicting || isScenarioRunning}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="steps"
                      className="mb-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"
                    >
                      예측 스텝 수
                      <InfoTooltip label="예측 스텝 수 설명">
                        1스텝은 약 {STEP_DURATION_SECONDS}초입니다. 30스텝이면 약{' '}
                        {30 * STEP_DURATION_SECONDS}초 뒤까지를 내다봅니다.
                      </InfoTooltip>
                    </label>
                    <input
                      id="steps"
                      type="number"
                      min={1}
                      max={1000}
                      value={displayNumber(steps)}
                      onChange={(e) => setSteps(parseNumberInput(e.target.value))}
                      placeholder="30"
                      className="no-spinner w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200"
                      disabled={isPredicting || isScenarioRunning}
                    />
                  </div>

                  {/* 2026-08-12(2차): 화재 이벤트를 개입 후 지도 오버레이에서 이 자리로
                      옮겼다. 지도 위에 띄우니 지도를 가리고 시뮬레이션 화면과 겉돌았다.
                      실행 조건 맨 아래에 두는 이유: 유입 인원·스텝 수와 마찬가지로
                      "이번 실행에서 무슨 일이 일어나는가"를 정하는 값이라 같은 단계에
                      있는 것이 맞고, 개입(Step 2)이 아니라 양쪽에 공통으로 걸리는
                      조건이라 Step 2에 두면 After 전용으로 오해된다. */}
                  <EventSettingsPanel
                    isRunning={isPredicting || isScenarioRunning}
                    steps={readNumber(steps)}
                    zones={zones}
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
                    onAutoPlace={handleAutoPlaceFire}
                    canAutoPlace={buildings.length > 0 && zones.length > 0}
                    nextIntensity={nextIntensity}
                    onNextIntensityChange={setNextIntensity}
                    nextTriggerStep={nextTriggerStep}
                    onNextTriggerStepChange={setNextTriggerStep}
                    nextExtinguishStep={nextExtinguishStep}
                    onNextExtinguishStepChange={setNextExtinguishStep}
                  />
                </StepSection>
              </div>

              {/* 실행/초기화는 어느 단계에 있든 눌러야 하므로 아코디언 밖에 둔다.
                  p03 "버튼 색상/디자인 개선 필요": 주황 단색이 위험/경고로 읽혀서
                  (이 화면에서 주황은 Before 계열 색이기도 하다) 실행 버튼을 앱의 기본
                  강조색인 파랑으로 바꾸고, 초기화는 테두리만 있는 보조 버튼으로 낮췄다. */}
              <div className="flex gap-2 border-t border-slate-300 p-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={isPredicting || isScenarioRunning}
                  className="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900"
                >
                  {isPredicting || isScenarioRunning ? '시뮬레이션 실행 중...' : '시뮬레이션 실행'}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPredicting || isScenarioRunning}
                  className="shrink-0 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="order-1 flex flex-1 flex-col gap-6 overflow-hidden xl:order-2">
            {/* 2026-08-12 (UIUX 피드백 p02 "반응형 확인하기"): h-[450px]를 모든 폭에
                걸었더니, 좁은 화면에서 두 지도가 세로로 쌓이면서 450px을 반씩 나눠
                각 지도가 220px도 안 됐다. 그 높이에서는 좌하단 확대/초기화 버튼과
                우하단 범례가 상단 정보 배지와 겹쳐 서로를 가렸다.
                쌓일 때는 지도마다 높이를 따로 주고, 가로로 놓일 때만 450px을 공유한다. */}
            <div className="flex flex-col gap-4 md:h-[450px] md:flex-row">
              <div className="flex h-[380px] min-w-0 flex-1 flex-col md:h-auto">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">개입 전 (Before)</div>
                <div className="flex-1 relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                  <Suspense fallback={<Spinner label="3D 지도를 불러오는 중..." />}>
                    <HeatmapView3D
                      zones={zones}
                      agents={getBeforeAgents()}
                      zoneRisks={getZoneRisks(predictResult?.riskTrend)}
                      width="100%"
                      height="100%"
                      transitionMs={intervalMs}
                      buildings={buildings}
                      currentStep={currentStepNumber}
                      corridors={corridors}
                      gates={gates}
                      closedGateIds={beforeClosedGateIds}
                      placedObjects={baselineObjects}
                      placementType={beforePlacementType}
                      onPlaceObject={handlePlaceObject}
                      events={visibleEvents}
                      focusEvent={focusEvent}
                      viewCenter={mapViewport ? { lon: mapViewport.lon, lat: mapViewport.lat } : undefined}
                      viewZoom={mapViewport?.zoom}
                      onViewportChange={setMapViewport}
                    />
                  </Suspense>
                </div>
              </div>

              <div className="flex h-[380px] min-w-0 flex-1 flex-col md:h-auto">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex justify-between items-center">
                  <span>개입 후 (After)</span>
                </div>
                <div className="flex-1 relative rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                  <Suspense fallback={<Spinner label="3D 지도를 불러오는 중..." />}>
                    <HeatmapView3D
                      zones={zones}
                      agents={getAfterAgents()}
                      zoneRisks={getZoneRisks(scenarioResult?.riskTrend)}
                      width="100%"
                      height="100%"
                      transitionMs={intervalMs}
                      buildings={buildings}
                      currentStep={currentStepNumber}
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
                  </Suspense>

                </div>
              </div>
            </div>

            {/* 2026-08-12 재배치: 재생 컨트롤(왼쪽)과 보고서 생성(오른쪽)을 한 줄에
                2분할로 둔다. 보고서 버튼이 화면 맨 아래에 있어서, 결과를 다 보고 나면
                다시 끝까지 스크롤해야 닿았다. 재생 바는 결과를 볼 때 계속 쓰는 줄이라
                여기 붙여두면 재생을 멈춘 그 자리에서 바로 누를 수 있다.
                2026-08-12(3차): 2분할 -> 3:1 -> 5:1. 보고서 쪽은 버튼 하나가 전부라
                자리를 더 줄이고, 그만큼 재생 슬라이더를 길게 뒀다(스텝을 정확히
                찍으려면 슬라이더가 길수록 좋다). 6칸 중 재생 5칸 / 보고서 1칸.
                좁은 화면(lg 미만)에서는 세로로 쌓여 각자 한 줄을 쓴다. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
            <div className="flex items-center gap-3 rounded bg-white dark:bg-slate-900 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-700 lg:col-span-5">
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

              {/* 실행한 시나리오로 정책 보고서(DOCX)를 만든다. 제목과 질문을 직접
                  지정하거나 다시 만들려면 시나리오 이력 화면을 쓴다. */}
              {/* 2026-08-12(4차): ⓘ 아이콘도 빼고 버튼 하나만 남겼다. 1/6 폭에서는
                  아이콘이 버튼 폭을 더 줄여서, 설명을 버튼 자체의 마우스 오버(title)로
                  옮겼다. title은 키보드 포커스에서도 뜨고 별도 레이아웃을 차지하지 않는다. */}
              <div className="flex flex-col items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-1">
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={!canGenerateReport}
                  title={[
                    '방금 실행한 개입 후(After) 시나리오로 정책 보고서(DOCX)를 만듭니다.',
                    '개입 전은 비교 기준이라, 서버가 같은 시장의 최신 현행안 결과를 찾아 함께 씁니다.',
                    '',
                    '자료 검색과 문서 작성까지 1~3분 걸리고, 끝나면 자동으로 내려받습니다.',
                    '제목이나 질문을 직접 정하거나 다시 만들려면 시나리오 이력 화면을 쓰세요.',
                    '',
                    `현재 상태: ${reportHint}`,
                  ].join('\n')}
                  className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingReport ? '생성 중...' : '보고서 생성'}
                </button>
                {/* 지금 화면에 보이는 실행의 보고서일 때만 알린다. 초기화하거나 시장을
                    바꾸면 다른 실행이 되므로 이 안내도 사라져야 한다. */}
                {lastReport && !isGeneratingReport && lastReport.scenarioId === reportScenarioId && (
                  <p className="w-full text-center text-[11px] leading-snug text-emerald-600 dark:text-emerald-400">
                    내려받았습니다
                  </p>
                )}
              </div>
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
                {/* submittedEvents(실행에 실제로 반영된 이벤트)를 넘긴다. 편집 중인
                    events를 넘기면 아직 돌리지 않은 화재의 세로선이 지난 결과 위에 뜬다. */}
                <RiskTrendChart
                  beforeTrend={predictResult?.riskTrend}
                  afterTrend={scenarioResult?.riskTrend}
                  events={submittedEvents}
                />
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
