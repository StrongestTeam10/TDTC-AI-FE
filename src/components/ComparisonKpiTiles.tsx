// 개입 전/후 비교 요약: 효과 요약(다이버징 바 + 대피 경고) + 혼합 KPI 타일 3종.
//
// 화재 시나리오에서 위험도는 화재 강제값이 지배해 오브젝트/게이트 개입으로는 안 변한다.
// 그런 개입의 효과는 "밀집도"(쏠림)와 "대피"(이동 변화)에 나타난다. 그래서 위험도
// 그래프가 평평해도, 실제로 바뀐 축을 한눈에 보여주는 "효과 요약"을 맨 위에 둔다.
import type { PredictResult, ScenarioResult } from '../types';
import { exposure, peakOverall } from '../utils/comparison';

interface Props {
  before?: PredictResult | null;
  after?: ScenarioResult | null;
  // 화재 이벤트가 실제로 있었는지(문구 정확도용).
  hasFire?: boolean;
}

function pctChange(before: number, after: number): number {
  return before !== 0 ? Math.round(((after - before) / before) * 100) : 0;
}

// 다이버징 바 한 줄. pct>0=악화(빨강, 오른쪽), pct<0=개선(초록, 왼쪽),
// neutral=회색(오른쪽), 0=중앙 점.
function EffectBar({ label, pct, neutral = false }: { label: string; pct: number; neutral?: boolean }) {
  const CAP = 100;
  const flat = Math.abs(pct) < 1;
  const color = flat ? '#475569' : neutral ? '#94a3b8' : pct > 0 ? '#f87171' : '#34d399';
  const mag = (Math.min(Math.abs(pct), CAP) / CAP) * 48; // 반폭 48%
  return (
    <div className="grid items-center gap-2 text-[11px]" style={{ gridTemplateColumns: '92px 1fr 48px' }}>
      <span className="text-right text-slate-600 dark:text-slate-300">{label}</span>
      <div className="relative h-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <span className="absolute inset-y-0 left-1/2 w-px bg-slate-200 dark:bg-slate-700" />
        {flat ? (
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: '#475569' }} />
        ) : (
          <span
            className="absolute top-0.5 h-3 rounded"
            style={{ background: color, width: `${mag}%`, [pct > 0 ? 'left' : 'right']: '50%' } as React.CSSProperties}
          />
        )}
      </div>
      <span className="text-left tabular-nums" style={{ color: flat ? '#64748b' : color, fontWeight: flat ? 400 : 600 }}>
        {flat ? '±0' : `${pct > 0 ? '+' : ''}${pct}%`}
      </span>
    </div>
  );
}

// 대피 완료 여부 변화. 완료→미완료가 가장 중요한 악화 신호.
function EvacFlag({ before, after }: { before: number | null | undefined; after: number | null | undefined }) {
  const bDone = before != null;
  const aDone = after != null;
  if (bDone && !aDone) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs">
        <span className="font-semibold text-red-600 dark:text-red-300">⚠ 대피 완료 → 미완료</span>
        <span className="text-slate-500 dark:text-slate-400"> (개입 전 {before}초에 완료됐으나, 개입 후 기간 내 미완료 — 출구·경로 차단 가능성)</span>
      </div>
    );
  }
  if (!bDone && aDone) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
        <span className="font-semibold text-emerald-700 dark:text-emerald-300">✓ 대피 미완료 → 완료({after}초)</span>
        <span className="text-slate-500 dark:text-slate-400"> (개입으로 대피가 기간 내 끝나게 됨)</span>
      </div>
    );
  }
  if (bDone && aDone && before !== after) {
    const worse = (after as number) > (before as number);
    return (
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        대피 소요 <b className={worse ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>{before}초 → {after}초</b> ({worse ? '지연' : '단축'})
      </div>
    );
  }
  return null;
}

function Tile({
  label, sub, valueAfter, valueBefore, chip, foot,
}: {
  label: string; sub: string; valueAfter: string; valueBefore: string;
  chip: React.ReactNode; foot: string;
}) {
  return (
    <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
        {label} <span className="text-slate-500">{sub}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{valueAfter}</span>
        <span className="text-sm text-slate-500 tabular-nums">← {valueBefore}</span>
      </div>
      <div className="mt-2 text-xs">{chip}</div>
      <div className="mt-1.5 text-[11px] leading-snug text-slate-500">{foot}</div>
    </div>
  );
}

function Chip({ diff, digits = 0, suffix = '', neutral = false }: { diff: number; digits?: number; suffix?: string; neutral?: boolean }) {
  if (Math.abs(diff) < Math.pow(10, -digits) / 2) return <span className="text-slate-500">±0</span>;
  const up = diff > 0;
  const body = `${up ? '▲' : '▼'} ${up ? '+' : ''}${diff.toFixed(digits)}${suffix}`;
  if (neutral) return <span className="font-medium text-slate-500 dark:text-slate-400">{body}</span>;
  const cls = !up ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-red-600 dark:text-red-400 bg-red-500/10';
  return <span className={`font-semibold px-2 py-0.5 rounded-full ${cls}`}>{body}</span>;
}

export default function ComparisonKpiTiles({ before, after, hasFire = false }: Props) {
  if (!before || !after) return null;

  const expB = exposure(before.riskTrend);
  const expA = exposure(after.riskTrend);
  const expPct = pctChange(expB, expA);

  const densB = before.maxDensity ?? 0;
  const densA = after.maxDensity ?? 0;
  const densPct = pctChange(densB, densA);

  const avgB = before.averageDensity ?? 0;
  const avgA = after.averageDensity ?? 0;
  const avgPct = pctChange(avgB, avgA);

  const evacB = before.evacuatedCount ?? 0;
  const evacA = after.evacuatedCount ?? 0;
  const evacPct = pctChange(evacB, evacA);

  const peakB = peakOverall(before.riskTrend);
  const peakA = peakOverall(after.riskTrend);
  const peakSame = Math.abs(peakA - peakB) < 0.5;
  const peak = Math.max(peakA, peakB);

  // 헤드라인: 위험/밀집 중 가장 크게 바뀐 것.
  const primary = [
    { k: '위험 노출', pct: expPct },
    { k: '최대 밀집도', pct: densPct },
    { k: '평균 밀집도', pct: avgPct },
  ].reduce((m, c) => (Math.abs(c.pct) > Math.abs(m.pct) ? c : m));
  const meaningful = Math.abs(primary.pct) >= 5;
  const headTone = meaningful ? (primary.pct > 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300') : 'text-slate-600 dark:text-slate-300';

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
        <div className="text-sm">
          <span className="text-slate-500 dark:text-slate-400">개입 효과 한눈에</span>{' '}
          {meaningful ? (
            <span className={headTone}>— 핵심: <b className="font-semibold">{primary.k} {primary.pct > 0 ? '+' : ''}{primary.pct}% {primary.pct > 0 ? '↑' : '↓'}</b></span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">— 위험도·밀집도는 개입 전과 거의 같습니다</span>
          )}
        </div>

        <EvacFlag before={before.evacuationTimeSeconds} after={after.evacuationTimeSeconds} />

        <div className="space-y-1.5 pt-0.5">
          <EffectBar label="누적 위험 노출" pct={expPct} />
          <EffectBar label="최대 밀집도" pct={densPct} />
          <EffectBar label="평균 밀집도" pct={avgPct} />
          <EffectBar label="대피 인원" pct={evacPct} neutral />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5" style={{ paddingLeft: 100 }}>
          <span>◀ 개선</span><span>변화 없음</span><span>악화 ▶</span>
        </div>

        {peakSame && peak >= 50 && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-2">
            {hasFire
              ? `최고 위험도(${peak.toFixed(0)}점)는 화재 진원이라 개입으로 낮출 수 없습니다 — 효과는 위 밀집도·대피에 나타납니다.`
              : `최고 위험도(${peak.toFixed(0)}점) 구역은 이 개입으로 바뀌지 않았습니다.`}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Tile
          label="누적 위험 노출" sub="(전 구역·전 스텝 합)"
          valueAfter={Math.round(expA).toLocaleString()} valueBefore={Math.round(expB).toLocaleString()}
          chip={<Chip diff={expPct} digits={0} suffix="%" />}
          foot="화재·통로정책 등 위험도 자체를 바꾸는 개입에 반응."
        />
        <Tile
          label="최대 밀집도" sub="(명/㎡ · 최종 스텝)"
          valueAfter={densA.toFixed(2)} valueBefore={densB.toFixed(2)}
          chip={<Chip diff={densA - densB} digits={2} />}
          foot={`게이트 폐쇄 등 인파 쏠림에 반응${after.maxDensityZoneName ? ` · ${after.maxDensityZoneName}` : ''}.`}
        />
        <Tile
          label="대피 규모" sub="(누적 인원)"
          valueAfter={String(evacA)} valueBefore={String(evacB)}
          chip={<Chip diff={evacA - evacB} digits={0} suffix="명" neutral />}
          foot="오브젝트 등 이동 변화에 반응."
        />
      </div>
    </div>
  );
}
