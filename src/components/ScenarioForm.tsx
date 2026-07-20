import { useState } from 'react';
import type { ScenarioRequest, SpatialNode } from '../types';

interface ScenarioFormProps {
  layout: SpatialNode[];
  isRunning: boolean;
  onSubmit: (request: ScenarioRequest) => void;
}

const SCENARIO_OPTIONS: { value: ScenarioRequest['scenarioType']; label: string }[] = [
  { value: 'none', label: '없음 (기본 이동만)' },
  { value: 'fire', label: '화재' },
  { value: 'acoustic_anomaly', label: '음향 이상 (비명/충돌음)' },
  { value: 'corridor_block', label: '통로 폐쇄' },
];

export default function ScenarioForm({ layout, isRunning, onSubmit }: ScenarioFormProps) {
  const [agentCount, setAgentCount] = useState(100);
  const [scenarioType, setScenarioType] =
    useState<ScenarioRequest['scenarioType']>('none');
  const [eventNodeId, setEventNodeId] = useState<number>(layout[0]?.nodeId ?? 0);
  const [eventIntensity, setEventIntensity] = useState(0.5);
  const [steps, setSteps] = useState(50);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ agentCount, scenarioType, eventNodeId, eventIntensity, steps });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-4"
    >
      <h3 className="text-sm font-semibold text-slate-200">시나리오 설정</h3>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          초기 인구 수: {agentCount}
        </label>
        <input
          type="range"
          min={10}
          max={500}
          value={agentCount}
          onChange={(e) => setAgentCount(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">위험 시나리오</label>
        <select
          value={scenarioType}
          onChange={(e) =>
            setScenarioType(e.target.value as ScenarioRequest['scenarioType'])
          }
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
        >
          {SCENARIO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">이벤트 발생 위치</label>
        <select
          value={eventNodeId}
          onChange={(e) => setEventNodeId(Number(e.target.value))}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
        >
          {layout.map((node) => (
            <option key={node.nodeId} value={node.nodeId}>
              {node.nodeType} #{node.nodeId}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          이벤트 강도: {eventIntensity.toFixed(2)}
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={eventIntensity}
          onChange={(e) => setEventIntensity(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          시뮬레이션 스텝 수: {steps}
        </label>
        <input
          type="range"
          min={10}
          max={200}
          value={steps}
          onChange={(e) => setSteps(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <button
        type="submit"
        disabled={isRunning}
        className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning ? '시뮬레이션 실행 중...' : '시뮬레이션 실행'}
      </button>
    </form>
  );
}
