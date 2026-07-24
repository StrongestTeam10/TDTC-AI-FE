import { useEffect } from 'react';
import FramePlayer from '../components/FramePlayer';
import PredictForm from '../components/PredictForm';
import RiskTrendChart from '../components/RiskTrendChart';
import { fetchMarkets, fetchZones, runPredictSimulation } from '../api/client';
import { useSimulationStore } from '../store/simulationStore';
import type { PredictRequest } from '../types';

export default function PredictionPage() {
  const {
    markets,
    setMarkets,
    zones,
    setZones,
    predictResult,
    setPredictResult,
    isPredicting,
    setPredicting,
  } = useSimulationStore();

  useEffect(() => {
    if (markets.length === 0) {
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
          .catch((err) => console.error('시장 및 구역 정보 로드 실패', err));
    }
  }, [markets.length, setMarkets, setZones]);

  const handleRunPredict = async (request: PredictRequest) => {
    setPredicting(true);
    try {
      const result = await runPredictSimulation(request);
      setPredictResult(result);
    } catch (err) {
      console.error('예측 시뮬레이션 실행 실패', err);
      alert('예측 시뮬레이션 실행 중 오류가 발생했습니다.');
    } finally {
      setPredicting(false);
    }
  };

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            인구 유입 예측 시뮬레이션
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            현재 실측 관제 상태에서 출발해, 인구 유입이 몰렸을 때 위험도가 어떻게 전개될지
            예측합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <PredictForm
                marketId={markets[0]?.marketId ?? 0}
                isRunning={isPredicting}
                onSubmit={handleRunPredict}
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <FramePlayer
                zones={zones}
                frames={predictResult?.frames ?? []}
            />

            <RiskTrendChart riskTrend={predictResult?.riskTrend ?? []} />

            {predictResult && (
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <h3 className="mb-2 text-sm text-slate-400">예측 결과 요약</h3>
                  <div className="flex justify-between text-sm text-slate-200">
                    <span className="opacity-80">최종 종합 위험도</span>
                    <span className="font-semibold">
                  {predictResult.finalOverallRiskScore.toFixed(2)}
                </span>
                  </div>
                </div>
            )}
          </div>
        </div>
      </div>
  );
}
