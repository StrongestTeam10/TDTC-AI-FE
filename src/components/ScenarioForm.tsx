import { useState, useEffect } from 'react';
import type { ScenarioRequest, Zone, PlacedObject } from '../types';

interface CorridorListEntry {
  key: string;
  label: string;
}

interface ScenarioFormProps {
  isRunning: boolean;
  onSubmit: (request: Omit<ScenarioRequest, 'marketId' | 'objects' | 'corridorPolicies'>) => void;

  // 2026-07-25 추가: 오브젝트 배치는 이제 지도 클릭으로 이뤄지므로, 목록/배치모드
  // 선택/강도 값을 부모(ScenarioPage)가 들고 있고 이 폼은 컨트롤만 그린다.
  objects: PlacedObject[];
  onRemoveObject: (index: number) => void;
  placementType: PlacedObject['objectType'] | null;
  onSelectPlacementType: (type: PlacedObject['objectType'] | null) => void;
  nextObjectIntensity: number;
  onNextObjectIntensityChange: (value: number) => void;

  // 2026-07-25 추가: 통로 정책도 지도 클릭으로 순환되므로, 현재 적용된 목록만 표시.
  corridorEntries: CorridorListEntry[];
  onRemoveCorridor: (key: string) => void;
}

const SCENARIO_OPTIONS: { value: ScenarioRequest['scenarioType']; label: string }[] = [
  { value: 'none', label: '없음 (기본 이동만)' },
  { value: 'fire', label: '화재' },
  { value: 'acoustic_anomaly', label: '음향 이상 (비명/충돌음)' },
  { value: 'corridor_block', label: '통로 폐쇄' },
];

const OBJECT_TYPE_OPTIONS: { value: PlacedObject['objectType']; label: string; hint: string }[] = [
  { value: 'food_truck', label: '푸드트럭', hint: '해당 지점 매력도 상승 (인구 쏠림)' },
  { value: 'event_zone', label: '행사존', hint: '매력도 강하게 상승 (가장 큰 쏠림)' },
  { value: 'rest_area', label: '휴게 공간', hint: '매력도 완만하게 상승' },
  { value: 'obstacle', label: '장애물/적재물', hint: '해당 지점 통행 차단 + 매력도 하락' },
];

export default function ScenarioForm({
                                        isRunning,
                                        onSubmit,
                                        objects,
                                        onRemoveObject,
                                        placementType,
                                        onSelectPlacementType,
                                        nextObjectIntensity,
                                        onNextObjectIntensityChange,
                                        corridorEntries,
                                        onRemoveCorridor,
                                      }: ScenarioFormProps) {
  const [agentCount, setAgentCount] = useState(100);
  const [scenarioType, setScenarioType] = useState<ScenarioRequest['scenarioType']>('none');
  const [eventZoneId, setEventZoneId] = useState<number>(0);
  const [eventIntensity, setEventIntensity] = useState(0.5);
  const [steps, setSteps] = useState(50);

  const objectTypeLabel = (t: PlacedObject['objectType']) =>
      OBJECT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

  const handleTogglePlacement = (type: PlacedObject['objectType']) => {
    onSelectPlacementType(placementType === type ? null : type);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
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
          <label className="mb-1 block text-sm text-slate-300">이벤트 발생 구역 ID</label>
          <input
              type="number"
              min={0}
              value={eventZoneId}
              onChange={(e) => setEventZoneId(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-200"
              disabled={isRunning}
          />
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

        {/* 2026-07-25 추가: 오브젝트 배치. 팔레트에서 종류를 고르면 배치 모드가 켜지고,
            오른쪽 지도를 클릭해서 정확한 위치에 놓는다. */}
        <div className="rounded-lg border border-sky-800 bg-sky-950/40 p-3 space-y-3">
          <h3 className="text-sm font-semibold text-sky-300">오브젝트 배치</h3>
          <p className="text-xs text-slate-400">
            {placementType
                ? `배치 모드: ${objectTypeLabel(placementType)} — 지도를 클릭하세요`
                : '아래에서 종류를 선택한 뒤 지도를 클릭하세요'}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {OBJECT_TYPE_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleTogglePlacement(opt.value)}
                    className={`rounded border px-2 py-1.5 text-xs text-left ${
                        placementType === opt.value
                            ? 'border-sky-400 bg-sky-900/60 text-sky-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                    title={opt.hint}
                >
                  {opt.label}
                </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">배치할 오브젝트 강도 (0.0 ~ 1.0)</label>
            <input
                type="number"
                step="0.1"
                min={0.0}
                max={1.0}
                value={nextObjectIntensity}
                onChange={(e) => onNextObjectIntensityChange(Number(e.target.value))}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                disabled={isRunning}
            />
          </div>

          {objects.length > 0 && (
              <ul className="space-y-1">
                {objects.map((obj, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                      <span>
                        {objectTypeLabel(obj.objectType)} · 강도 {obj.intensity}
                        {obj.latitude !== undefined ? ` · (${obj.latitude.toFixed(5)}, ${obj.longitude?.toFixed(5)})` : ''}
                      </span>
                      <button
                          type="button"
                          onClick={() => onRemoveObject(i)}
                          disabled={isRunning}
                          className="text-slate-500 hover:text-red-400"
                      >
                        삭제
                      </button>
                    </li>
                ))}
              </ul>
          )}
        </div>

        {/* 2026-07-25 추가: 통로 정책. 지도에서 통로 선을 클릭하면 순환되고,
            여기엔 현재 적용된 목록만 표시한다. */}
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 space-y-3">
          <h3 className="text-sm font-semibold text-amber-300">통로 정책</h3>
          <p className="text-xs text-slate-400">지도에서 통로 선을 클릭하면 폐쇄→개방→일방통행 순으로 바뀝니다</p>

          {corridorEntries.length > 0 ? (
              <ul className="space-y-1">
                {corridorEntries.map((entry) => (
                    <li key={entry.key} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                      <span>{entry.label}</span>
                      <button
                          type="button"
                          onClick={() => onRemoveCorridor(entry.key)}
                          disabled={isRunning}
                          className="text-slate-500 hover:text-red-400"
                      >
                        삭제
                      </button>
                    </li>
                ))}
              </ul>
          ) : (
              <div className="text-xs text-slate-500">적용된 통로 정책이 없습니다.</div>
          )}
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