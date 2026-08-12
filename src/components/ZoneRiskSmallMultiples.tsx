// 구역별 위험도 추이 스몰멀티플(개입 전=주황 점선 / 개입 후=파랑 실선).
// 구역마다 세로 스케일을 자동 조정해, 화재 스파이크(0~100)든 미세한 밀집 차이(5~11)든
// 둘 다 차이가 보이게 한다. 종합(최대 구역) 선 하나로는 최악 구역이 안 변하면 두 선이
// 겹쳐 개입 효과가 안 보이는데, 이 그래프가 그걸 보완한다.
import type { PredictResult, ScenarioResult, Zone } from '../types';
import { zoneSeries } from '../utils/comparison';

interface Props {
  before?: PredictResult | null;
  after?: ScenarioResult | null;
  zones: Zone[];
}

const BEFORE_COLOR = '#f97316';
const AFTER_COLOR = '#3b82f6';
const W = 200;
const H = 62;
const PAD = 5;

function levelColor(v: number): string {
  if (v >= 75) return '#ef4444';
  if (v >= 50) return '#f97316';
  if (v >= 25) return '#f59e0b';
  return '#64748b';
}

function xy(v: number, i: number, n: number, scaleMax: number): [number, number] {
  const x = PAD + ((W - 2 * PAD) * i) / Math.max(1, n - 1);
  const y = H - PAD - ((H - 2 * PAD) * Math.min(v, scaleMax)) / scaleMax;
  return [x, y];
}

function pointsOf(series: number[], scaleMax: number): string {
  const n = series.length;
  if (n === 0) return '';
  return series.map((v, i) => xy(v, i, n, scaleMax).map((t) => t.toFixed(1)).join(',')).join(' ');
}

const IMPROVED = '#34d399'; // 개입 후가 더 낮음(위험 감소) = 개선
const WORSE = '#f87171'; // 개입 후가 더 높음(위험 증가) = 악화

// 개입 전/후 곡선 사이를 스텝 구간별로 채운다. 각 구간을 그 구간의 부호(후>전이면
// 악화/빨강, 후<전이면 개선/초록)로 칠하고, 한 구간 안에서 두 선이 교차하면
// 교차점에서 두 삼각형으로 나눠 부호를 정확히 반영한다(전 구간 단일색·자기교차
// 폴리곤 아티팩트 제거).
function bandSegments(before: number[], after: number[], scaleMax: number): { d: string; color: string }[] {
  const n = Math.min(before.length, after.length);
  const segs: { d: string; color: string }[] = [];
  if (n < 2) return segs;
  const px = (frac: number) => PAD + ((W - 2 * PAD) * frac) / (n - 1);
  const py = (v: number) => H - PAD - ((H - 2 * PAD) * Math.min(v, scaleMax)) / scaleMax;
  const colorOf = (d: number) => (d > 0 ? WORSE : IMPROVED);
  for (let i = 0; i < n - 1; i++) {
    const b0 = before[i], b1 = before[i + 1], a0 = after[i], a1 = after[i + 1];
    const d0 = a0 - b0, d1 = a1 - b1; // >0 = 개입 후가 더 높음(악화)
    if (Math.abs(d0) < 1e-9 && Math.abs(d1) < 1e-9) continue;
    const x0 = px(i), x1 = px(i + 1);
    if (d0 === 0 || d1 === 0 || (d0 > 0) === (d1 > 0)) {
      // 같은 부호(또는 한쪽이 0): 사다리꼴 하나(전→전→후→후).
      const color = colorOf(d0 !== 0 ? d0 : d1);
      const d = `M ${x0.toFixed(1)},${py(b0).toFixed(1)} L ${x1.toFixed(1)},${py(b1).toFixed(1)} L ${x1.toFixed(1)},${py(a1).toFixed(1)} L ${x0.toFixed(1)},${py(a0).toFixed(1)} Z`;
      segs.push({ d, color });
    } else {
      // 부호가 바뀜(구간 내 교차) → 교차점에서 두 삼각형으로 분할.
      const t = d0 / (d0 - d1); // 전==후가 되는 지점(0~1)
      const xc = px(i + t);
      const yc = py(b0 + (b1 - b0) * t);
      segs.push({ d: `M ${x0.toFixed(1)},${py(b0).toFixed(1)} L ${x0.toFixed(1)},${py(a0).toFixed(1)} L ${xc.toFixed(1)},${yc.toFixed(1)} Z`, color: colorOf(d0) });
      segs.push({ d: `M ${xc.toFixed(1)},${yc.toFixed(1)} L ${x1.toFixed(1)},${py(b1).toFixed(1)} L ${x1.toFixed(1)},${py(a1).toFixed(1)} Z`, color: colorOf(d1) });
    }
  }
  return segs;
}

export default function ZoneRiskSmallMultiples({ before, after, zones }: Props) {
  if ((!before && !after) || zones.length === 0) return null;

  return (
    <div>
      {/* 2026-08-12 (UIUX 피드백 p05 "좀 위로 둘까요?"): 범례가 차트 아래에 있어서,
          구역이 세 개 이상이라 두 줄로 접히면 화면 밖으로 밀려 무슨 선인지 모른 채
          차트를 먼저 보게 됐다. 범례는 그림을 읽는 열쇠라 그림보다 먼저 와야 한다.
          제목 줄 오른쪽 끝에 붙여 줄 하나를 더 쓰지 않는다. */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
          구역별 위험도 추이{' '}
          <span className="text-xs font-normal text-slate-500">
            — 구역마다 스케일 자동조정(값이 작아도 차이가 보이게). 개입 전후가 같으면 “동일”로 표시, 다르면 사이를 음영으로.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={BEFORE_COLOR} strokeWidth="2" strokeDasharray="5 3" /></svg>
            개입 전
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={AFTER_COLOR} strokeWidth="2" /></svg>
            개입 후
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: IMPROVED, opacity: 0.5 }} />
            개선
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: WORSE, opacity: 0.5 }} />
            악화
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {zones.map((z) => {
          const b = zoneSeries(before?.riskTrend, z.zoneId);
          const a = zoneSeries(after?.riskTrend, z.zoneId);
          const pB = b.length ? Math.max(...b) : 0;
          const pA = a.length ? Math.max(...a) : 0;
          // 개입 전/후 중 한쪽만 실행됐을 수 있다(한쪽 시뮬 실패 시). 그때는
          // 없는 쪽을 0으로 오해하게 하는 변화(→0.0) 대신 있는 쪽 값만 보여준다.
          const bothPresent = b.length > 0 && a.length > 0;
          const scaleMax = Math.max(pB, pA, 10) * 1.14;
          const diff = pA - pB;
          const dColor = diff < -0.5 ? '#34d399' : diff > 0.5 ? '#f87171' : '#94a3b8';
          const dArrow = diff < -0.5 ? '▼' : diff > 0.5 ? '▲' : '=';

          const thresholds = [50, 75].filter((t) => scaleMax >= t);

          // 두 곡선이 스텝마다 거의 같은지(개입이 이 구역 위험도를 안 바꿈).
          const n = Math.min(b.length, a.length);
          let maxGap = 0;
          for (let i = 0; i < n; i++) maxGap = Math.max(maxGap, Math.abs(b[i] - a[i]));
          const identical = n > 0 && maxGap < 0.5;
          const segments = identical ? [] : bandSegments(b, a, scaleMax);

          return (
            <div key={z.zoneId} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900 dark:text-slate-100">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: levelColor(pA) }} />
                  {z.zoneName}
                </span>
                {!bothPresent ? (
                  <span className="text-[11px] tabular-nums text-slate-500">최고 {(a.length ? pA : pB).toFixed(1)}</span>
                ) : identical ? (
                  <span className="text-[11px] text-slate-500">개입 전후 동일 · 최고 {pA.toFixed(1)}</span>
                ) : (
                  <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    최고 {pB.toFixed(1)}→
                    <span className="font-semibold" style={{ color: dColor }}>{pA.toFixed(1)}</span>{' '}
                    <span style={{ color: dColor }}>{dArrow}{Math.abs(diff).toFixed(1)}</span>
                  </span>
                )}
              </div>
              {/* 2026-08-12 (UIUX 피드백 "선 볼딩 빼고 스텝별 위험도 추이와 같은 사이즈로")
                  선이 옆 차트보다 훨씬 굵어 보이던 원인은 굵기 값이 아니라 좌표계였다.
                  viewBox가 200x62인데 카드 폭은 400px이 넘고 preserveAspectRatio="none"이라,
                  strokeWidth={2}가 가로로 2배 넘게 늘어나면서 점선 간격까지 함께 부풀었다
                  (가로·세로 배율이 달라 선이 두껍고 뭉툭해 보였다).
                  vectorEffect="non-scaling-stroke"를 주면 선 굵기와 점선 패턴이 viewBox가
                  아니라 화면 픽셀 기준이 되어, recharts로 그린 스텝별 위험도 추이의
                  strokeWidth={2} / strokeDasharray="5 3"과 정확히 같은 두께가 된다. */}
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
                {thresholds.map((t) => {
                  const y = (H - PAD - ((H - 2 * PAD) * t) / scaleMax).toFixed(1);
                  return (
                    <line
                      key={t} x1={PAD} y1={y} x2={W - PAD} y2={y}
                      stroke={t >= 75 ? '#ef4444' : '#f97316'} strokeWidth={1} strokeDasharray="2 3" opacity={0.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                {segments.map((seg, si) => (
                  <path key={si} d={seg.d} fill={seg.color} opacity={0.18} stroke="none" />
                ))}
                {!identical && b.length > 0 && (
                  <polyline
                    fill="none" stroke={BEFORE_COLOR} strokeWidth={2} strokeDasharray="5 3"
                    strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    points={pointsOf(b, scaleMax)}
                  />
                )}
                {a.length > 0 && (
                  <polyline
                    fill="none" stroke={AFTER_COLOR} strokeWidth={2}
                    strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    points={pointsOf(a, scaleMax)}
                  />
                )}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
