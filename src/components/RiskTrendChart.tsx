import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { useChartTheme } from '../hooks/useChartTheme';
import type { EventTrigger, RiskTrendPoint } from '../types';

interface RiskTrendChartProps {
  riskTrend?: RiskTrendPoint[];
  beforeTrend?: RiskTrendPoint[];
  afterTrend?: RiskTrendPoint[];
  /**
   * 2026-08-12 추가: 실행에 반영된 이벤트(화재). 발생 스텝에 세로 실선을 그어
   * "여기서 불이 났다"를 곡선 위에 직접 표시한다.
   *
   * 없으면 선을 그리지 않는다 - 이벤트 없이 돌린 실행에도 세로선이 생기면
   * 그게 무슨 기준선인지 알 수 없다.
   */
  events?: EventTrigger[];
}

export default function RiskTrendChart({ riskTrend, beforeTrend, afterTrend, events = [] }: RiskTrendChartProps) {
  const chartTheme = useChartTheme();
  const hasData = (riskTrend && riskTrend.length > 0) || 
                  (beforeTrend && beforeTrend.length > 0) || 
                  (afterTrend && afterTrend.length > 0);

  if (!hasData) {
    return (
        <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 text-sm">
          시뮬레이션을 실행하면 위험도 추이가 표시됩니다.
        </div>
    );
  }

  const maxLen = Math.max(
    riskTrend?.length ?? 0,
    beforeTrend?.length ?? 0,
    afterTrend?.length ?? 0
  );

  // 개입 전/후 종합 위험도가 스텝마다 거의 같은지(겹쳐서 한 선만 보이는 상태).
  // 화재처럼 최악 구역이 개입으로 안 변하면 이렇게 되는데, 이때 "동일" 배지를
  // 달아 "그래프가 고장난 게 아니라 위험도가 실제로 같다"를 명확히 한다.
  const overlap = (() => {
    if (!beforeTrend?.length || !afterTrend?.length) return false;
    const n = Math.min(beforeTrend.length, afterTrend.length);
    for (let i = 0; i < n; i++) {
      if (Math.abs(beforeTrend[i].overallRiskScore - afterTrend[i].overallRiskScore) >= 0.5) return false;
    }
    return true;
  })();

  const data = Array.from({ length: maxLen }).map((_, i) => {
    const d: any = { step: i + 1 };
    if (riskTrend && i < riskTrend.length) {
      d.risk = Number(riskTrend[i].overallRiskScore.toFixed(2));
    }
    if (beforeTrend && i < beforeTrend.length) {
      d.before = Number(beforeTrend[i].overallRiskScore.toFixed(2));
    }
    if (afterTrend && i < afterTrend.length) {
      d.after = Number(afterTrend[i].overallRiskScore.toFixed(2));
    }
    return d;
  });

  // 같은 스텝에 이벤트가 여러 개면 선이 겹쳐 진하게만 보이므로 한 번만 긋는다.
  // 스텝 범위를 벗어난 값은 차트 밖이라 제외한다(SIM도 그런 이벤트는 발동시키지 않는다).
  const fireSteps = [
    ...new Set(
      events
        .filter((e) => e.eventType === 'fire')
        .map((e) => e.triggerStep ?? 1)
        .filter((step) => step >= 1 && step <= maxLen),
    ),
  ].sort((a, b) => a - b);

  return (
      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm text-slate-500 dark:text-slate-400">스텝별 위험도 추이</h3>
          {overlap && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
              개입 전후 동일(겹침) — 효과는 밀집도·대피에
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
                dataKey="step"
                stroke={chartTheme.axis}
                fontSize={11}
                label={{ value: '스텝', position: 'insideBottom', offset: -2, fill: chartTheme.axis, fontSize: 11 }}
            />
            <YAxis stroke={chartTheme.axis} fontSize={11} />
            <Tooltip
                contentStyle={chartTheme.tooltipContentStyle}
                labelStyle={chartTheme.tooltipLabelStyle}
                labelFormatter={(step) => `스텝 ${step}`}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
            {/* 2026-08-12 (UIUX 피드백 3페이지 "화재발생에 대한 위험도 추이는 세로
                실선으로 구분"): 곡선이 갑자기 치솟는 지점이 화재 때문인지, 유입이
                몰려서인지 그래프만 봐서는 구분되지 않았다. 발생 스텝에 세로 실선을
                긋고 라벨을 붙여 원인을 그림 안에서 바로 읽히게 한다.
                점선이 아니라 실선인 이유: 이 차트의 두 곡선이 이미 실선/점선으로
                Before·After를 구분하고 있어서, 점선을 하나 더 쓰면 계열이 셋으로
                보인다. 세로선은 계열이 아니라 시점 표시라 실선으로 갈라둔다. */}
            {fireSteps.map((step) => (
              <ReferenceLine
                  key={`fire-${step}`}
                  x={step}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                  label={{
                    value: '🔥 화재',
                    position: 'top',
                    fill: '#ef4444',
                    fontSize: 10,
                  }}
              />
            ))}
            {riskTrend && riskTrend.length > 0 && (
              <Line
                  name="종합 위험도"
                  type="monotone"
                  dataKey="risk"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
              />
            )}
            {/* 2026-08-12 (UIUX 피드백 p05 "점선 실선도 통일하고?")
                바로 아래 "구역별 위험도 추이"는 개입 전을 주황 점선, 개입 후를 파랑
                실선으로 그리는데 여기서는 둘 다 실선이었다. 같은 두 계열을 나란히 놓인
                두 차트가 다르게 그리면 어느 쪽 규칙이 맞는지 매번 범례를 다시 봐야 한다.
                점선 쪽으로 맞춘다 - 색만으로 구분하면 색각 이상이 있는 사용자에게는
                두 선이 같아 보이고, 흑백 인쇄(보고서 첨부)에서도 구분이 사라진다.
                구역별 추이와 같은 대시 패턴(5 3)을 쓴다. */}
            {beforeTrend && beforeTrend.length > 0 && (
              <Line
                  name="개입 전 (예측)"
                  type="monotone"
                  dataKey="before"
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  isAnimationActive={false}
              />
            )}
            {afterTrend && afterTrend.length > 0 && (
              <Line
                  name="개입 후 (정책)"
                  type="monotone"
                  dataKey="after"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
  );
}
