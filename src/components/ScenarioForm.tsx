import { useEffect, useState } from 'react';
import type { Zone, PlacedObject, EventTrigger, CorridorPolicy } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];

interface ScenarioFormProps {
  isRunning: boolean;
  steps: number;
  zones: Zone[];

  objects: PlacedObject[];
  onRemoveObject: (index: number) => void;
  events: EventTrigger[];
  onRemoveEvent: (index: number) => void;
  onUpdateEventTriggerStep: (index: number, value: number) => void;
  onUpdateEventExtinguishStep: (index: number, value: number) => void;

  placementType: PlacementKind | null;
  onSelectPlacementType: (type: PlacementKind | null) => void;
  nextIntensity: number;
  onNextIntensityChange: (value: number) => void;

  nextTriggerStep: number;
  onNextTriggerStepChange: (value: number) => void;

  // 2026-08-XX: 화재 진압 스텝(발생~진압 사이가 연소 기간).
  nextExtinguishStep: number;
  onNextExtinguishStepChange: (value: number) => void;

  corridors: CorridorPolicy[];
  onAddCorridor: (policy: CorridorPolicy) => void;
  onRemoveCorridor: (index: number) => void;
}

const OBJECT_TYPE_OPTIONS: { value: PlacedObject['objectType']; label: string; hint: string }[] = [
  { value: 'food_truck', label: '푸드트럭', hint: '해당 지점 매력도 상승 (인구 쏠림)' },
  { value: 'event_zone', label: '행사존', hint: '매력도 강하게 상승 (가장 큰 쏠림)' },
  { value: 'rest_area', label: '휴게 공간', hint: '매력도 완만하게 상승' },
  { value: 'obstacle', label: '장애물/적재물', hint: '해당 지점 통행 차단 + 매력도 하락' },
];

const EVENT_TYPE_OPTIONS: { value: EventTrigger['eventType']; label: string; hint: string }[] = [
  { value: 'fire', label: '화재', hint: '해당 구역 위험도를 강제로 끌어올려 지속 대피 유발' },
];

const CORRIDOR_ACTION_OPTIONS: { value: CorridorPolicy['action']; label: string }[] = [
  { value: 'close', label: '폐쇄' },
  { value: 'open', label: '개방' },
  { value: 'one_way', label: '일방통행' },
];

function isEventType(kind: PlacementKind): kind is EventTrigger['eventType'] {
  return kind === 'fire';
}

export default function ScenarioForm({
  isRunning,
  steps,
  zones,
  objects,
  onRemoveObject,
  events,
  onRemoveEvent,
  onUpdateEventTriggerStep,
  onUpdateEventExtinguishStep,
  placementType,
  onSelectPlacementType,
  nextIntensity,
  onNextIntensityChange,
  nextTriggerStep,
  onNextTriggerStepChange,
  nextExtinguishStep,
  onNextExtinguishStepChange,
  corridors,
  onAddCorridor,
  onRemoveCorridor,
}: ScenarioFormProps) {
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
    onAddCorridor({
      fromZoneId: nextFromZoneId,
      toZoneId: nextToZoneId,
      action: nextAction,
      allowedDirection: nextAction === 'one_way' ? nextAllowedDirection : undefined,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-3">
      {/* 오브젝트 배치 섹션 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-2 dark:border-sky-800 dark:bg-sky-950/40">
        <h3 className="text-xs font-semibold text-sky-700 dark:text-sky-300">오브젝트 배치</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
              className={`rounded border px-1.5 py-1 text-[11px] text-left transition-colors ${
                placementType === opt.value
                  ? 'border-sky-500 bg-sky-100 text-sky-900 dark:border-sky-400 dark:bg-sky-900/60 dark:text-sky-100'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-500'
              }`}
              title={opt.hint}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 배치된 오브젝트 목록 */}
        {objects.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-700/50 space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">배치된 오브젝트 ({objects.length})</div>
            {objects.map((obj, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/40 px-2 py-1 rounded">
                <span>{objectTypeLabel(obj.objectType)} ({zoneName(obj.zoneId)})</span>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => onRemoveObject(idx)}
                  className="text-red-600 hover:text-red-500 text-[10px] dark:text-red-400 dark:hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 이벤트 배치 섹션 */}
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 space-y-2 dark:border-rose-800 dark:bg-rose-950/40">
        <h3 className="text-xs font-semibold text-rose-700 dark:text-rose-300">이벤트 설정</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isRunning}
              onClick={() => handleTogglePlacement(opt.value)}
              className={`rounded border px-1.5 py-1 text-[11px] text-left transition-colors ${
                placementType === opt.value
                  ? 'border-rose-500 bg-rose-100 text-rose-900 dark:border-rose-400 dark:bg-rose-900/60 dark:text-rose-100'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-500'
              }`}
              title={opt.hint}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">발생 스텝</label>
            <input
              type="number"
              min={0}
              max={steps}
              value={nextTriggerStep}
              onChange={(e) => onNextTriggerStepChange(Number(e.target.value))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">진압 스텝</label>
            <input
              type="number"
              min={0}
              max={steps}
              value={nextExtinguishStep}
              onChange={(e) => onNextExtinguishStepChange(Number(e.target.value))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">강도 (0~1)</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={nextIntensity}
              onChange={(e) => onNextIntensityChange(Number(e.target.value))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isRunning}
            />
          </div>
        </div>

        {/* 이벤트 목록 */}
        {events.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-700/50 space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">설정된 이벤트 ({events.length})</div>
            {events.map((ev, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/40 px-2 py-1 rounded">
                <span>{eventTypeLabel(ev.eventType)} ({zoneName(ev.zoneId)})</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">발생</span>
                  <input
                    type="number"
                    min={0}
                    value={ev.triggerStep}
                    onChange={(e) => onUpdateEventTriggerStep(idx, Number(e.target.value))}
                    className="w-10 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-[10px] text-slate-800 dark:text-slate-200"
                    disabled={isRunning}
                  />
                  <span className="text-[10px] text-slate-500">진압</span>
                  <input
                    type="number"
                    min={0}
                    value={ev.extinguishStep ?? ''}
                    onChange={(e) => onUpdateEventExtinguishStep(idx, Number(e.target.value))}
                    className="w-10 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-[10px] text-slate-800 dark:text-slate-200"
                    disabled={isRunning}
                  />
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => onRemoveEvent(idx)}
                    className="text-red-600 hover:text-red-500 text-[10px] dark:text-red-400 dark:hover:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 통로 제어 섹션 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/40">
        <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">통로 제어 정책</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">출발 구역</label>
            <select
              value={nextFromZoneId}
              onChange={(e) => setNextFromZoneId(Number(e.target.value))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isRunning}
            >
              {zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>{z.zoneName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">도착 구역</label>
            <select
              value={nextToZoneId}
              onChange={(e) => setNextToZoneId(Number(e.target.value))}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isRunning}
            >
              {zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>{z.zoneName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">제어 제안</label>
            <select
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value as CorridorPolicy['action'])}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isRunning}
            >
              {CORRIDOR_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {nextAction === 'one_way' && (
            <div>
              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">통행 방향</label>
              <select
                value={nextAllowedDirection}
                onChange={(e) => setNextAllowedDirection(e.target.value as 'from_to' | 'to_from')}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
                disabled={isRunning}
              >
                <option value="from_to">출발 ➔ 도착</option>
                <option value="to_from">도착 ➔ 출발</option>
              </select>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={isRunning || nextFromZoneId === nextToZoneId}
          onClick={handleAddCorridor}
          className="w-full rounded bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white text-xs py-1 transition-colors"
        >
          통로 정책 추가
        </button>

        {/* 설정된 통로 정책 목록 */}
        {corridors.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-700/50 space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">설정된 정책 ({corridors.length})</div>
            {corridors.map((c, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/40 px-2 py-1 rounded">
                <span>
                  {zoneName(c.fromZoneId)} ↔ {zoneName(c.toZoneId)} : {actionLabel(c.action)}
                </span>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => onRemoveCorridor(idx)}
                  className="text-red-600 hover:text-red-500 text-[10px] dark:text-red-400 dark:hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}