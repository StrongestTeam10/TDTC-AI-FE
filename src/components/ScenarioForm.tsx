import { useEffect, useState } from 'react';
import type { ScenarioRequest, Zone, PlacedObject, EventTrigger, CorridorPolicy } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];

interface ScenarioFormProps {
  isRunning: boolean;
  onSubmit: (
      request: Pick<ScenarioRequest, 'agentCount' | 'steps'> & { corridorPolicies: CorridorPolicy[] }
  ) => void;
  zones: Zone[];

  objects: PlacedObject[];
  onRemoveObject: (index: number) => void;
  events: EventTrigger[];
  onRemoveEvent: (index: number) => void;
  // 2026-07-29 추가: 이미 배치된 이벤트의 발생 스텝을 리스트에서 바로 수정
  onUpdateEventTriggerStep: (index: number, value: number) => void;

  placementType: PlacementKind | null;
  onSelectPlacementType: (type: PlacementKind | null) => void;
  nextIntensity: number;
  onNextIntensityChange: (value: number) => void;

  nextTriggerStep: number;
  onNextTriggerStepChange: (value: number) => void;
}

const OBJECT_TYPE_OPTIONS: { value: PlacedObject['objectType']; label: string; hint: string }[] = [
  { value: 'food_truck', label: '푸드트럭', hint: '해당 지점 매력도 상승 (인구 쏠림)' },
  { value: 'event_zone', label: '행사존', hint: '매력도 강하게 상승 (가장 큰 쏠림)' },
  { value: 'rest_area', label: '휴게 공간', hint: '매력도 완만하게 상승' },
  { value: 'obstacle', label: '장애물/적재물', hint: '해당 지점 통행 차단 + 매력도 하락' },
];

const EVENT_TYPE_OPTIONS: { value: EventTrigger['eventType']; label: string; hint: string }[] = [
  { value: 'fire', label: '화재', hint: '해당 구역 위험도를 강제로 끌어올려 지속 대피 유발' },
  { value: 'acoustic_anomaly', label: '음향 이상', hint: '발생 지점 반경 안 사람들을 그 순간 즉시 대피시킴' },
];

const CORRIDOR_ACTION_OPTIONS: { value: CorridorPolicy['action']; label: string }[] = [
  { value: 'close', label: '폐쇄' },
  { value: 'open', label: '개방' },
  { value: 'one_way', label: '일방통행' },
];

function isEventType(kind: PlacementKind): kind is EventTrigger['eventType'] {
  return kind === 'fire' || kind === 'acoustic_anomaly';
}

export default function ScenarioForm({
                                        isRunning,
                                        onSubmit,
                                        zones,
                                        objects,
                                        onRemoveObject,
                                        events,
                                        onRemoveEvent,
                                        onUpdateEventTriggerStep,
                                        placementType,
                                        onSelectPlacementType,
                                        nextIntensity,
                                        onNextIntensityChange,
                                        nextTriggerStep,
                                        onNextTriggerStepChange,
                                      }: ScenarioFormProps) {
  const [agentCount, setAgentCount] = useState(100);
  const [steps, setSteps] = useState(50);

  const [corridors, setCorridors] = useState<CorridorPolicy[]>([]);
  const [nextFromZoneId, setNextFromZoneId] = useState<number>(0);
  const [nextToZoneId, setNextToZoneId] = useState<number>(0);
  const [nextAction, setNextAction] = useState<CorridorPolicy['action']>('close');
  const [nextAllowedDirection, setNextAllowedDirection] =
      useState<NonNullable<CorridorPolicy['allowedDirection']>>('from_to');

  useEffect(() => {
    if (zones.length > 0) {
      if (nextFromZoneId === 0) setNextFromZoneId(zones[0].zoneId);
      if (nextToZoneId === 0 && zones.length > 1) setNextToZoneId(zones[1].zoneId);
    }
    // eslint-disable-next-line
  }, [zones]);

  const objectTypeLabel = (t: PlacedObject['objectType']) =>
      OBJECT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
  const eventTypeLabel = (t: EventTrigger['eventType']) =>
      EVENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
  const placementLabel = (kind: PlacementKind) =>
      isEventType(kind) ? eventTypeLabel(kind) : objectTypeLabel(kind);
  const zoneName = (zoneId: number) => zones.find((z) => z.zoneId === zoneId)?.zoneName ?? `Zone ${zoneId}`;
  const actionLabel = (a: CorridorPolicy['action']) =>
      CORRIDOR_ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a;

  const handleTogglePlacement = (kind: PlacementKind) => {
    onSelectPlacementType(placementType === kind ? null : kind);
  };

  const handleAddCorridor = () => {
    if (!nextFromZoneId || !nextToZoneId || nextFromZoneId === nextToZoneId) return;
    setCorridors((prev) => [
      ...prev,
      {
        fromZoneId: nextFromZoneId,
        toZoneId: nextToZoneId,
        action: nextAction,
        allowedDirection: nextAction === 'one_way' ? nextAllowedDirection : undefined,
      },
    ]);
  };

  const handleRemoveCorridor = (index: number) => {
    setCorridors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ agentCount, steps, corridorPolicies: corridors });
  };

  return (
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
        <div>
          <label className="mb-1 block text-xs text-slate-300">투입 인구 수 (명)</label>
          <input
              type="number"
              min={1}
              max={1000}
              value={agentCount}
              onChange={(e) => setAgentCount(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
              disabled={isRunning}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-300">시뮬레이션 스텝 수</label>
          <input
              type="number"
              min={10}
              max={1000}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
              disabled={isRunning}
          />
        </div>

        {/* 오브젝트 배치 */}
        <div className="rounded-lg border border-sky-800 bg-sky-950/40 p-2.5 space-y-2">
          <h3 className="text-xs font-semibold text-sky-300">오브젝트 배치</h3>
          <p className="text-[11px] text-slate-400">
            {placementType
                ? `배치 모드: ${placementLabel(placementType)} — 지도를 클릭하세요`
                : '종류를 선택한 뒤 지도를 클릭하세요'}
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {OBJECT_TYPE_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleTogglePlacement(opt.value)}
                    className={`rounded border px-1.5 py-1 text-[11px] text-left ${
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
            <label className="mb-1 block text-[11px] text-slate-400">배치 강도 (0.0 ~ 1.0)</label>
            <input
                type="number"
                step="0.1"
                min={0.0}
                max={1.0}
                value={nextIntensity}
                onChange={(e) => onNextIntensityChange(Number(e.target.value))}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                disabled={isRunning}
            />
          </div>

          {objects.length > 0 && (
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {objects.map((obj, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300">
                      <span>{objectTypeLabel(obj.objectType)} · {obj.intensity}</span>
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

        {/* 이벤트 발생 (화재/음향 이상) */}
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-2.5 space-y-2">
          <h3 className="text-xs font-semibold text-red-300">이벤트 발생</h3>
          <p className="text-[11px] text-slate-400">
            {placementType && isEventType(placementType)
                ? `배치 모드: ${placementLabel(placementType)} — 지도를 클릭하세요`
                : '화재/음향 이상을 선택한 뒤 지도를 클릭하세요'}
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {EVENT_TYPE_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleTogglePlacement(opt.value)}
                    className={`rounded border px-1.5 py-1 text-[11px] text-left ${
                        placementType === opt.value
                            ? 'border-red-400 bg-red-900/60 text-red-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                    title={opt.hint}
                >
                  {opt.label}
                </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-slate-400">
              발생 스텝 (1 ~ {steps})
            </label>
            <input
                type="number"
                min={1}
                max={steps}
                value={nextTriggerStep}
                onChange={(e) => onNextTriggerStepChange(Number(e.target.value))}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                disabled={isRunning}
            />
          </div>

          {events.length > 0 && (
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {events.map((ev, i) => (
                    <li key={i} className="flex items-center justify-between gap-1 rounded bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300">
                      <span className="flex-1">
                        {eventTypeLabel(ev.eventType)} · 강도 {ev.intensity}
                      </span>
                      <input
                          type="number"
                          min={1}
                          max={steps}
                          value={ev.triggerStep ?? 1}
                          onChange={(e) => onUpdateEventTriggerStep(i, Number(e.target.value))}
                          disabled={isRunning}
                          className="w-14 rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                          title="발생 스텝 수정"
                      />
                      <span className="text-slate-500">스텝</span>
                      <button
                          type="button"
                          onClick={() => onRemoveEvent(i)}
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

        {/* 통로 정책 */}
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-2.5 space-y-2">
          <h3 className="text-xs font-semibold text-amber-300">통로 정책</h3>

          <div className="grid grid-cols-2 gap-1.5">
            <select
                value={nextFromZoneId}
                onChange={(e) => setNextFromZoneId(Number(e.target.value))}
                className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                disabled={isRunning || zones.length === 0}
            >
              {zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>{z.zoneName}</option>
              ))}
            </select>
            <select
                value={nextToZoneId}
                onChange={(e) => setNextToZoneId(Number(e.target.value))}
                className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                disabled={isRunning || zones.length === 0}
            >
              {zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>{z.zoneName}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value as CorridorPolicy['action'])}
                className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                disabled={isRunning}
            >
              {CORRIDOR_ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {nextAction === 'one_way' ? (
                <select
                    value={nextAllowedDirection}
                    onChange={(e) => setNextAllowedDirection(e.target.value as 'from_to' | 'to_from')}
                    className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                    disabled={isRunning}
                >
                  <option value="from_to">→ 방향만 허용</option>
                  <option value="to_from">← 방향만 허용</option>
                </select>
            ) : (
                <div />
            )}
          </div>

          <button
              type="button"
              onClick={handleAddCorridor}
              disabled={isRunning || zones.length < 2}
              className="w-full rounded border border-amber-700 py-1 text-[11px] text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
          >
            + 통로 정책 추가
          </button>

          {corridors.length > 0 && (
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {corridors.map((c, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300">
                      <span>
                        {zoneName(c.fromZoneId)} ↔ {zoneName(c.toZoneId)} · {actionLabel(c.action)}
                        {c.action === 'one_way' ? ` (${c.allowedDirection === 'to_from' ? '←' : '→'})` : ''}
                      </span>
                      <button
                          type="button"
                          onClick={() => handleRemoveCorridor(i)}
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