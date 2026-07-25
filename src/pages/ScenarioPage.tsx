import { useEffect, useState } from 'react';
import FramePlayer from '../components/FramePlayer';
import HeatmapView from '../components/HeatmapView';
import RiskScorePanel from '../components/RiskScorePanel';
import ScenarioForm from '../components/ScenarioForm';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { fetchMarkets, fetchZones, fetchCorridors, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { ScenarioRequest, PlacedObject, CorridorPolicy, Corridor } from '../types';

// 2026-07-25 추가: 지도에서 통로를 클릭할 때마다 순환하는 5단계 상태.
// none은 "정책 없음"(제출 시 목록에서 빠짐).
type CorridorCycleState = 'none' | 'close' | 'open' | 'one_way_from_to' | 'one_way_to_from';
const CORRIDOR_CYCLE: CorridorCycleState[] = ['none', 'close', 'open', 'one_way_from_to', 'one_way_to_from'];

function toCorridorPolicy(
    fromZoneId: number,
    toZoneId: number,
    state: CorridorCycleState
): CorridorPolicy | null {
  switch (state) {
    case 'close':
      return { fromZoneId, toZoneId, action: 'close' };
    case 'open':
      return { fromZoneId, toZoneId, action: 'open' };
    case 'one_way_from_to':
      return { fromZoneId, toZoneId, action: 'one_way', allowedDirection: 'from_to' };
    case 'one_way_to_from':
      return { fromZoneId, toZoneId, action: 'one_way', allowedDirection: 'to_from' };
    default:
      return null;
  }
}

// HeatmapView가 색상을 정하는 데 쓰는 축약 상태로 변환.
function toDisplayStatus(state: CorridorCycleState): 'close' | 'open' | 'one_way' | undefined {
  if (state === 'close') return 'close';
  if (state === 'open') return 'open';
  if (state === 'one_way_from_to' || state === 'one_way_to_from') return 'one_way';
  return undefined;
}

const CORRIDOR_STATE_LABEL: Record<CorridorCycleState, string> = {
  none: '정책 없음',
  close: '폐쇄',
  open: '개방',
  one_way_from_to: '일방통행 (→)',
  one_way_to_from: '일방통행 (←)',
};

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

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

  // 2026-07-25 추가: 통로(구역 연결) 원본 데이터
  const [corridors, setCorridors] = useState<Corridor[]>([]);

  // 2026-07-25 추가: 오브젝트 배치 상태 (지도 클릭으로 채워짐)
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [placementType, setPlacementType] = useState<PlacedObject['objectType'] | null>(null);
  const [nextObjectIntensity, setNextObjectIntensity] = useState(0.5);

  // 2026-07-25 추가: 통로 정책 상태 (지도 클릭으로 순환)
  const [corridorStates, setCorridorStates] = useState<Record<string, CorridorCycleState>>({});

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
            ]);
          }
          return [[], []] as [typeof zones, Corridor[]];
        })
        .then(([zoneData, corridorData]) => {
          if (zoneData.length > 0) {
            setZones(zoneData);
          }
          setCorridors(corridorData);
        })
        .catch((err) => {
          console.error('시장/구역/통로 정보 로드 실패', err);
          setLayoutError(toDisplayErrorMessage(err, '시장/구역/통로 정보를 불러오지 못했습니다.'));
        })
        .finally(() => setLayoutLoading(false));
  };

  useEffect(() => {
    if (markets.length === 0) {
      loadLayout();
    }
    // eslint-disable-next-line
  }, []);

  // 2026-07-25 추가: 지도 클릭 -> 현재 선택된 오브젝트 종류를 그 좌표에 배치
  const handlePlaceObject = (zoneId: number, latitude: number, longitude: number) => {
    if (!placementType) return;
    setObjects((prev) => [
      ...prev,
      { objectType: placementType, zoneId, intensity: nextObjectIntensity, latitude, longitude },
    ]);
  };

  const handleRemoveObject = (index: number) => {
    setObjects((prev) => prev.filter((_, i) => i !== index));
  };

  // 2026-07-25 추가: 통로 클릭 -> 5단계 순환(없음/폐쇄/개방/일방→/일방←)
  const handleCorridorClick = (fromZoneId: number, toZoneId: number) => {
    const key = `${fromZoneId}-${toZoneId}`;
    setCorridorStates((prev) => {
      const current = prev[key] ?? 'none';
      const nextIndex = (CORRIDOR_CYCLE.indexOf(current) + 1) % CORRIDOR_CYCLE.length;
      return { ...prev, [key]: CORRIDOR_CYCLE[nextIndex] };
    });
  };

  const handleRemoveCorridor = (key: string) => {
    setCorridorStates((prev) => ({ ...prev, [key]: 'none' }));
  };

  const zoneName = (zoneId: number) => zones.find((z) => z.zoneId === zoneId)?.zoneName ?? `Zone ${zoneId}`;

  const activeCorridorEntries = Object.entries(corridorStates).filter(([, s]) => s !== 'none');
  const corridorStatusForMap = Object.fromEntries(
      Object.entries(corridorStates)
          .map(([key, state]) => [key, toDisplayStatus(state)])
          .filter(([, status]) => status !== undefined)
  );

  const handleRunScenario = async (
      basicFields: Omit<ScenarioRequest, 'marketId' | 'objects' | 'corridorPolicies'>
  ) => {
    const corridorPolicies = activeCorridorEntries
        .map(([key, state]) => {
          const [fromZoneId, toZoneId] = key.split('-').map(Number);
          return toCorridorPolicy(fromZoneId, toZoneId, state);
        })
        .filter((p): p is CorridorPolicy => p !== null);

    const request: ScenarioRequest = {
      ...basicFields,
      marketId: markets[0]?.marketId ?? 0,
      objects,
      corridorPolicies,
    };

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

  return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-100">
          시나리오 기반 What-if 실험
        </h1>

        {layoutError && <ErrorBanner message={layoutError} onRetry={loadLayout} />}

        {isLayoutLoading ? (
            <Spinner label="시장/구역/통로 정보를 불러오는 중..." />
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {runError && <ErrorBanner message={runError} />}
                <ScenarioForm
                    isRunning={isScenarioRunning}
                    onSubmit={handleRunScenario}
                    objects={objects}
                    onRemoveObject={handleRemoveObject}
                    placementType={placementType}
                    onSelectPlacementType={setPlacementType}
                    nextObjectIntensity={nextObjectIntensity}
                    onNextObjectIntensityChange={setNextObjectIntensity}
                    corridorEntries={activeCorridorEntries.map(([key, state]) => ({
                      key,
                      label: `${zoneName(Number(key.split('-')[0]))} ↔ ${zoneName(Number(key.split('-')[1]))} · ${CORRIDOR_STATE_LABEL[state]}`,
                    }))}
                    onRemoveCorridor={handleRemoveCorridor}
                />
              </div>

              <div className="lg:col-span-3 space-y-6">
                {/* 2026-07-25 추가: 배치 전용 지도. 시뮬레이션 실행 전 오브젝트 배치와
                    통로 정책 지정에 쓰는, 항상 떠 있는 정적 지도. */}
                <HeatmapView
                    zones={zones}
                    agents={[]}
                    width={MAP_WIDTH}
                    height={MAP_HEIGHT}
                    corridors={corridors}
                    corridorStatus={corridorStatusForMap}
                    onCorridorClick={handleCorridorClick}
                    placementType={placementType}
                    onPlaceObject={handlePlaceObject}
                    placedObjects={objects}
                />

                {scenarioResult && (
                    <FramePlayer
                        zones={zones}
                        frames={scenarioResult.frames}
                        width={MAP_WIDTH}
                        height={MAP_HEIGHT}
                    />
                )}

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
                  <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                    <h3 className="text-sm text-slate-400 mb-2">실험 결과 요약</h3>
                    {scenarioResult ? (
                        <div className="space-y-2 text-slate-200 text-sm">
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