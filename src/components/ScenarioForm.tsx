import { useState, useEffect } from 'react';
import type { ScenarioRequest, Zone } from '../types';

interface ScenarioFormProps {
  marketId: number;
  zones: Zone[];
  isRunning: boolean;
  onSubmit: (request: ScenarioRequest) => void;
}

const SCENARIO_OPTIONS: { value: ScenarioRequest['scenarioType']; label: string }[] = [
  { value: 'none', label: '없음 (기본 이동만)' },
  { value: 'fire', label: '화재' },
  { value: 'acoustic_anomaly', label: '음향 이상 (비명/충돌음)' },
  { value: 'corridor_block', label: '통로 폐쇄' },
];

export default function ScenarioForm({ marketId, zones, isRunning, onSubmit }: ScenarioFormProps) {
  const [agentCount, setAgentCount] = useState(100);
  const [scenarioType, setScenarioType] = useState<ScenarioRequest['scenarioType']>('none');
  const [eventZoneId, setEventZoneId] = useState<number>(0);
  const [eventIntensity, setEventIntensity] = useState(0.5);
  const [steps, setSteps] = useState(50);

  // zones 데이터가 로드되면 초기 선택값을 첫 번째 구역으로 설정
  useEffect(() => {
    if (zones.length > 0 && eventZoneId === 0) {
      setEventZoneId(zones[0].zoneId);
    }
  }, [zones, eventZoneId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      marketId,
      agentCount,
      scenarioType,
      eventZoneId,
      eventIntensity,
      steps,
    });
  };

  return (
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div>
          <label className="mb-1 block text-sm text-slate-300">투입 인구 수 (명)</label>
          <input
              type="number"
              min={1}
              max={1000}
              value={agentCount}
              onChange={(e) => setAgentCount(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">시나리오 유형</label>
          <select
              value={scenarioType}
              onChange={(e) => setScenarioType(e.target.value as ScenarioRequest['scenarioType'])}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning}
          >
            {SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">이벤트 발생 구역 (Zone)</label>
          <select
              value={eventZoneId}
              onChange={(e) => setEventZoneId(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning || zones.length === 0}
          >
            {zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>
                  Zone {z.zoneId} ({z.zoneName})
                </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">이벤트 강도 (0.0 ~ 1.0)</label>
          <input
              type="number"
              step="0.1"
              min={0.0}
              max={1.0}
              value={eventIntensity}
              onChange={(e) => setEventIntensity(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">시뮬레이션 스텝 수</label>
          <input
              type="number"
              min={10}
              max={1000}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning}
          />
        </div>

        <button
            type="submit"
            disabled={isRunning}
            className="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {isRunning ? '시뮬레이션 실행 중...' : '시뮬레이션 시작'}
        </button>
      </form>
  );
}