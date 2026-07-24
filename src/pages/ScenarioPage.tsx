import { useEffect, useState } from 'react';
import FramePlayer from '../components/FramePlayer';
import RiskScorePanel from '../components/RiskScorePanel';
import ScenarioForm from '../components/ScenarioForm';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { fetchMarkets, fetchZones, runScenarioSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { ScenarioRequest } from '../types';

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

  // 2026-07-24: 공간(시장/구역) 데이터 로딩 상태와 오류를 화면에 보여주기 위해 추가.
  // 기존엔 console.error만 찍고 화면엔 아무 표시가 없어서, 로드가 실패하면
  // 사용자는 "시장 목록이 왜 안 뜨지?"를 알 방법이 없었음.
  const [isLayoutLoading, setLayoutLoading] = useState(markets.length === 0);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const loadLayout = () => {
    setLayoutLoading(true);
    setLayoutError(null);
    fetchMarkets()
        .then((marketData) => {
          setMarkets(marketData);
          if (marketData.length > 0) {
            return fetchZones(marketData[0].marketId);
          }
          return [];
        })
        .then((zoneData) => {
          if (zoneData.length > 0) {
            setZones(zoneData);
          }
        })
        .catch((err) => {
          console.error('시장 및 구역 정보 로드 실패', err);
          setLayoutError(toDisplayErrorMessage(err, '시장/구역 정보를 불러오지 못했습니다.'));
        })
        .finally(() => setLayoutLoading(false));
  };

  useEffect(() => {
    // 공간(시장/구역) 데이터가 없으면 최초 로드
    if (markets.length === 0) {
      loadLayout();
    }
    // 최초 마운트 시 1회만 실행 (loadLayout은 재생성되는 함수라 deps에 넣지 않음)
    // eslint-disable-next-line
  }, []);

  const handleRunScenario = async (request: ScenarioRequest) => {
    setScenarioRunning(true);
    setRunError(null);
    try {
      const result = await runScenarioSimulation(request);
      setScenarioResult(result);
    } catch (err) {
      console.error('시나리오 실행 실패', err);
      // 2026-07-24: window.alert() 대신 화면 내 오류 배너로 교체 (가이드라인:
      // 오류 메시지는 명확하고 간결하게, 화면 흐름을 막지 않게 제공)
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
            <Spinner label="시장/구역 정보를 불러오는 중..." />
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4">
                {runError && <ErrorBanner message={runError} />}
                <ScenarioForm
                    marketId={markets[0]?.marketId ?? 0}
                    zones={zones}
                    isRunning={isScenarioRunning}
                    onSubmit={handleRunScenario}
                />
              </div>

              <div className="lg:col-span-2 space-y-6">
                <FramePlayer
                    zones={zones}
                    frames={scenarioResult?.frames ?? []}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RiskScorePanel
                      risks={scenarioResult?.finalRiskScore ? [
                        // 시나리오 결과의 단일 RiskScore를 현재 컴포넌트 규격(Risk[])에 맞춰 임시 파싱
                        {
                          riskId: 999,
                          marketId: markets[0]?.marketId ?? 0,
                          zoneId: 0, // 시나리오 결과의 finalRiskScore는 구역 단위가 아닌 시장 전체 종합값이므로 특정 zoneId 없음
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
