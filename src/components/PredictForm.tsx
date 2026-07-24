import { useState } from 'react';
import type { PredictRequest } from '../types';

interface PredictFormProps {
  marketId: number;
  isRunning: boolean;
  onSubmit: (request: PredictRequest) => void;
}

export default function PredictForm({ marketId, isRunning, onSubmit }: PredictFormProps) {
  const [steps, setSteps] = useState(30);
  const [totalInflow, setTotalInflow] = useState(100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ marketId, steps, totalInflow });
  };

  return (
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="text-xs text-slate-500">
          현재 실측 상태(센서 관측값)를 출발점으로, 매대 매력도 기반 이동과 게이트를 통한
          신규 유입만으로 위험도가 어떻게 전개되는지 예측합니다. 화재 등 이벤트는 다루지
          않습니다 (시나리오 시뮬레이션에서 확인해주세요).
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
              disabled={isRunning}
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
              value={totalInflow}
              onChange={(e) => setTotalInflow(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning}
          />
          <p className="mt-1 text-xs text-slate-500">
            스텝마다 인원수가 들쭉날쭉하게 무작위로 유입되고, 전체 합계가 이 값에
            맞춰집니다. 0으로 두면 신규 유입 없이 현재 인원의 자연스러운 이동만 봅니다.
          </p>
        </div>

        <button
            type="submit"
            disabled={isRunning}
            className="w-full rounded bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {isRunning ? '예측 실행 중...' : '예측 실행'}
        </button>
      </form>
  );
}
