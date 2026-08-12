import { useEffect, useState } from 'react';
import InfoTooltip from './ui/InfoTooltip';
import type { Zone, PlacedObject, EventTrigger, CorridorPolicy } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];

// 2026-08-12: 이벤트(화재) 관련 props는 EventSettingsPanel(Step 3 실행 조건)로 옮겨갔다.
interface ScenarioFormProps {
  isRunning: boolean;
  zones: Zone[];

  objects: PlacedObject[];
  onRemoveObject: (index: number) => void;

  placementType: PlacementKind | null;
  onSelectPlacementType: (type: PlacementKind | null) => void;

  /**
   * 2026-08-12(3차): 잠금 배너에서 바로 잠금을 풀 수 있게 부모의 해제 동작을 받는다.
   * 같은 동작이 Step 1의 PolicyAnalysisPanel에도 있지만, 그쪽은 다른 단계라
   * 접혀 있으면 보이지 않는다(아래 배너 주석 참고).
   */
  onSwitchToManual?: () => void;

  corridors: CorridorPolicy[];
  onAddCorridor: (policy: CorridorPolicy) => void;
  onRemoveCorridor: (index: number) => void;

  /**
   * LLM 정책 모드 활성화 여부. true이면 모든 입력이 비활성화되고 잠금 안내 배너가 표시된다.
   * 사용자가 "수동으로 편집"을 누르면 부모가 이 값을 false로 바꾼다.
   */
  isLlmMode?: boolean;
}

const OBJECT_TYPE_OPTIONS: { value: PlacedObject['objectType']; label: string; hint: string }[] = [
  { value: 'food_truck', label: '푸드트럭', hint: '해당 지점 매력도 상승 (인구 쏠림)' },
  { value: 'event_zone', label: '행사존', hint: '매력도 강하게 상승 (가장 큰 쏠림)' },
  { value: 'rest_area', label: '휴게 공간', hint: '매력도 완만하게 상승' },
  { value: 'obstacle', label: '장애물/적재물', hint: '해당 지점 통행 차단 + 매력도 하락' },
];

const CORRIDOR_ACTION_OPTIONS: { value: CorridorPolicy['action']; label: string }[] = [
  { value: 'close', label: '폐쇄' },
  { value: 'open', label: '개방' },
  { value: 'one_way', label: '일방통행' },
];

export default function ScenarioForm({
  isRunning,
  zones,
  objects,
  onRemoveObject,
  placementType,
  onSelectPlacementType,
  onSwitchToManual,
  corridors,
  onAddCorridor,
  onRemoveCorridor,
  isLlmMode = false,
}: ScenarioFormProps) {
  /** isRunning과 isLlmMode 중 하나라도 true이면 모든 입력을 잠근다 */
  const isLocked = isRunning || isLlmMode;
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
  // 이 폼에서 고를 수 있는 배치는 오브젝트뿐이다(화재는 Step 3의 EventSettingsPanel).
  const placementLabel = (kind: PlacementKind) => objectTypeLabel(kind as PlacedObject['objectType']);
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
      {/* LLM 정책 모드: 오브젝트·통로는 잠김, 이벤트는 개방 안내
          2026-08-12 (UIUX 피드백 p01 "멘트 수정 필요"): "오브젝트·통로는 잠김,
          이벤트 설정은 열려 있습니다"가 무엇이 왜 잠겼는지는 말하지 않고 상태만
          나열해서, 잠금을 풀 방법이 있는지조차 알 수 없었다. 잠긴 이유(공문에서 읽어온
          값이라)와 푸는 방법(위의 "수동으로 편집")을 함께 적는다.
          다크 전용 색(amber-950/40, amber-300)이던 것도 라이트 모드에서 배경이 거의
          검게 나와 함께 고쳤다. */}
      {/* 2026-08-12(3차): 안내가 "위의 '수동으로 편집'을 누르세요"였는데, 그 버튼은
          Step 1(정책 입력 방식)의 PolicyAnalysisPanel 안에 있다. 단계 아코디언으로
          바뀐 뒤로는 Step 2를 보고 있을 때 Step 1이 접혀 있어, 가리키는 버튼이 화면에
          아예 없었다(잠금을 풀 방법이 사라진 것처럼 보였다).
          잠금을 알리는 자리에서 바로 풀 수 있도록 버튼을 여기에 둔다. */}
      {isLlmMode && (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700/60 dark:bg-amber-950/40">
          <span className="mt-px shrink-0 text-sm">🔒</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              공문에서 읽어온 설정이라 <b>오브젝트·통로 정책은 잠겨 있습니다.</b>
              <br />
              <span className="text-rose-700 dark:text-rose-300">
                화재 등 이벤트는 공문과 무관하므로 지금도 설정할 수 있습니다.
              </span>
            </p>
            {onSwitchToManual && (
              <button
                type="button"
                onClick={onSwitchToManual}
                className="mt-1.5 w-full rounded border border-amber-500 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-slate-900/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                🔓 수동으로 편집
              </button>
            )}
          </div>
        </div>
      )}
      {/* 오브젝트 배치 섹션 — LLM 모드 시 frosted glass 잠금 */}
      <div className="relative rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-2 dark:border-sky-800 dark:bg-sky-950/40">
        {/* Frosted glass overlay */}
        {isLlmMode && (
          <div className="absolute inset-0 z-10 rounded-lg bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center">
            <span className="text-[11px] text-slate-400 select-none">🔒 LLM 정책 모드</span>
          </div>
        )}
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
          오브젝트 배치
          <InfoTooltip label="오브젝트 배치 설명">
            종류를 고른 뒤 <b>개입 후(After) 지도</b>를 클릭하면 그 자리에 배치됩니다.
            푸드트럭·행사존·휴게 공간은 사람을 끌어모으고, 장애물/적재물은 통행을 막습니다.
          </InfoTooltip>
        </h3>
        {/* 배치 모드일 때만 남긴다 - 이건 설명이 아니라 "지금 클릭하면 무엇이 찍히는지"를
            알려주는 상태 표시라, 접어두면 클릭 전에 확인할 방법이 없다. */}
        {placementType && (
          <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">
            배치 모드: {placementLabel(placementType)} — 지도를 클릭하세요
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {OBJECT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isLocked}
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
                  disabled={isLocked}
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

      {/* 통로 제어 섹션 — LLM 모드 시 frosted glass 잠금 */}
      <div className="relative rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/40">
        {/* Frosted glass overlay */}
        {isLlmMode && (
          <div className="absolute inset-0 z-10 rounded-lg bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center">
            <span className="text-[11px] text-slate-400 select-none">🔒 LLM 정책 모드</span>
          </div>
        )}
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          통로 제어 정책
          <InfoTooltip label="통로 제어 정책 설명">
            구역과 구역 사이 통로를 막거나(폐쇄), 한 방향으로만 다니게(일방통행) 만듭니다.
            <b> 개입 후(After)에만</b> 적용되어, 개입 전과의 차이로 효과를 봅니다.
          </InfoTooltip>
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">출발 구역</label>
            <select
              value={nextFromZoneId}
              onChange={(e) => setNextFromZoneId(Number(e.target.value))}
              className="no-spinner w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isLocked}
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
              className="no-spinner w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isLocked}
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
              className="no-spinner w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
              disabled={isLocked}
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
                className="no-spinner w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
                disabled={isLocked}
              >
                <option value="from_to">출발 ➔ 도착</option>
                <option value="to_from">도착 ➔ 출발</option>
              </select>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={isLocked || nextFromZoneId === nextToZoneId}
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
                  disabled={isLocked}
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