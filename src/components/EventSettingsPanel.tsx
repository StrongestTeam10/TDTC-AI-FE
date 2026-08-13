import InfoTooltip from './ui/InfoTooltip';
import type { EventTrigger, PlacedObject, Zone } from '../types';

type PlacementKind = PlacedObject['objectType'] | EventTrigger['eventType'];

// 2026-08-12 신규, 같은 날 2차 개편.
//
// 1차에서는 개입 후(After) 지도 오른쪽 위에 띄웠는데, 지도 위 오버레이가 지도를
// 가리고 시뮬레이션 화면과 겉돌아 좌측 설정 패널로 되돌렸다. 자리는 Step 3(실행 조건)
// 맨 아래다 - 유입 인원·스텝 수처럼 "이번 실행에서 무슨 일이 일어나는가"를 정하는
// 값이라 같은 단계에 있는 것이 맞다.
//
// 2차에서 바뀐 규칙: 화재는 한 번에 하나만 등록한다.
//   - 예전에는 지도를 누를 때마다 화재가 계속 쌓여서, 실수로 여러 번 누르면 같은
//     자리에 여러 건이 겹쳐 등록되고도 목록을 펼치기 전에는 알 수 없었다.
//   - 이제 등록/삭제를 한 버튼으로 다루고, 등록되면 어느 구역에 잡혔는지 바로 보여준다.

interface EventSettingsPanelProps {
  isRunning: boolean;
  steps: number;
  zones: Zone[];

  /** 화재는 한 건만 유지한다. 비어 있으면 미등록. */
  events: EventTrigger[];
  onRemoveEvent: (index: number) => void;
  onUpdateEventTriggerStep: (index: number, value: number) => void;
  onUpdateEventExtinguishStep: (index: number, value: number) => void;

  placementType: PlacementKind | null;
  onSelectPlacementType: (type: PlacementKind | null) => void;

  /**
   * 2026-08-12(3차): 무작위 위치·무작위 값으로 화재를 한 건 등록한다.
   * 위치를 고르는 것 자체가 실험 대상이 아닐 때 쓰는 지름길이라, 손으로 찍는
   * 방식과 나란히 둔다.
   */
  onAutoPlace: () => void;
  /** 건물·구역 정보를 아직 못 받았으면 자동 등록이 불가능하다. */
  canAutoPlace: boolean;

  nextIntensity: number;
  onNextIntensityChange: (value: number) => void;
  nextTriggerStep: number;
  onNextTriggerStepChange: (value: number) => void;
  nextExtinguishStep: number;
  onNextExtinguishStepChange: (value: number) => void;
}

const NUMBER_INPUT_CLASS =
  'no-spinner w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-800 ' +
  'dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 disabled:opacity-50';

export default function EventSettingsPanel({
  isRunning,
  steps,
  zones,
  events,
  onRemoveEvent,
  onUpdateEventTriggerStep,
  onUpdateEventExtinguishStep,
  placementType,
  onSelectPlacementType,
  onAutoPlace,
  canAutoPlace,
  nextIntensity,
  onNextIntensityChange,
  nextTriggerStep,
  onNextTriggerStepChange,
  nextExtinguishStep,
  onNextExtinguishStepChange,
}: EventSettingsPanelProps) {
  // 화재는 한 건만 다룬다. 목록이 아니라 "있다/없다"로 보여주기 위해 첫 건만 본다.
  const fire = events[0] ?? null;
  const isPlacing = placementType === 'fire';
  const zoneName = (zoneId: number) =>
    zones.find((z) => z.zoneId === zoneId)?.zoneName ?? `구역 ${zoneId}`;

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 dark:border-rose-800 dark:bg-rose-950/40">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
        🔥 화재 이벤트
        <InfoTooltip label="화재 이벤트 설명">
          화재는 개입 전·후 <b>양쪽에 함께</b> 일어납니다. 어느 쪽 지도에서 찍든 반대쪽
          같은 자리에 똑같이 놓이므로, 두 지도의 차이는 오직 개입 때문에 생긴 것입니다.
          <br />
          <br />
          🏢 화재는 <b>상가 건물 위에만</b> 발생합니다. 길이나 빈 곳을 클릭하면 가장 가까운
          건물로 자동 이동합니다.
          <br />
          <br />
          한 번에 <b>한 곳만</b> 등록할 수 있습니다. 위치를 바꾸려면 삭제한 뒤 다시
          등록하세요.
        </InfoTooltip>
      </h3>

      {fire ? (
        <>
          {/* 등록됐다는 사실과 어디에 잡혔는지를 먼저 보여준다. 예전에는 목록을
              펼쳐야만 알 수 있어서, 등록이 됐는지 자체가 불확실했다. */}
          <div className="mb-2 flex items-center justify-between gap-2 rounded border border-rose-300 bg-white px-2 py-1.5 dark:border-rose-700 dark:bg-slate-900/60">
            <span className="min-w-0 truncate text-[11px] text-slate-700 dark:text-slate-200">
              <span className="font-semibold text-rose-700 dark:text-rose-300">등록됨</span>
              {' · '}
              {zoneName(fire.zoneId)}
            </span>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onRemoveEvent(0)}
              className="shrink-0 rounded border border-rose-400 px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-600 dark:text-rose-300 dark:hover:bg-rose-900/40"
            >
              삭제
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <div>
              <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">발생 스텝</label>
              <input
                type="number"
                min={0}
                max={steps}
                value={fire.triggerStep ?? ''}
                onChange={(e) => onUpdateEventTriggerStep(0, Number(e.target.value))}
                className={NUMBER_INPUT_CLASS}
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">진압 스텝</label>
              <input
                type="number"
                min={0}
                max={steps}
                value={fire.extinguishStep ?? ''}
                onChange={(e) => onUpdateEventExtinguishStep(0, Number(e.target.value))}
                className={NUMBER_INPUT_CLASS}
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">강도</label>
              {/* 강도는 등록 시점 값으로 굳는다(SIM 요청에 그때 값이 실린다).
                  등록 후 바꾸려면 삭제하고 다시 등록해야 해서 잠가둔다. */}
              <input
                type="number"
                value={fire.intensity}
                readOnly
                disabled
                className={NUMBER_INPUT_CLASS}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            {isPlacing
              ? '지도에서 건물을 클릭하세요. 클릭한 곳에 화재가 등록됩니다.'
              : '아직 등록된 화재가 없습니다. 등록을 누른 뒤 지도에서 건물을 클릭하세요.'}
          </p>

          <div className="mb-2 grid grid-cols-3 gap-1.5 text-[11px]">
            <div>
              <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">발생 스텝</label>
              <input
                type="number"
                min={0}
                max={steps}
                value={nextTriggerStep}
                onChange={(e) => onNextTriggerStepChange(Number(e.target.value))}
                className={NUMBER_INPUT_CLASS}
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">진압 스텝</label>
              <input
                type="number"
                min={0}
                max={steps}
                value={nextExtinguishStep}
                onChange={(e) => onNextExtinguishStepChange(Number(e.target.value))}
                className={NUMBER_INPUT_CLASS}
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">강도</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={nextIntensity}
                onChange={(e) => onNextIntensityChange(Number(e.target.value))}
                className={NUMBER_INPUT_CLASS}
                disabled={isRunning}
              />
            </div>
          </div>

          {/* 등록과 삭제를 같은 자리에서 다룬다. 등록 전에는 배치 모드를 켜고 끄는
              토글이고, 등록되면 위쪽 "삭제" 버튼으로 바뀐다.
              오른쪽 자동 등록은 위치와 값을 무작위로 정해 한 번에 넣는다 - 위치를
              고르는 것 자체가 실험 대상이 아닐 때 지도를 확대해 건물을 찾는 수고를 던다. */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onSelectPlacementType(isPlacing ? null : 'fire')}
              className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                isPlacing
                  ? 'border-rose-500 bg-rose-100 text-rose-900 dark:border-rose-400 dark:bg-rose-900/60 dark:text-rose-100'
                  : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900/40 dark:text-rose-300 dark:hover:bg-rose-900/40'
              }`}
            >
              {isPlacing ? '취소' : '🔥 화재 등록'}
            </button>
            <button
              type="button"
              disabled={isRunning || !canAutoPlace}
              onClick={onAutoPlace}
              title={
                canAutoPlace
                  ? '건물 하나를 무작위로 골라 화재를 등록합니다. 발생·진압 스텝과 강도도 무작위로 정해집니다.'
                  : '건물·구역 정보를 불러온 뒤에 쓸 수 있습니다.'
              }
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-rose-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:text-rose-300"
            >
              🎲 자동 등록
            </button>
          </div>
        </>
      )}
    </div>
  );
}
