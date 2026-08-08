// 개입 전/후 비교용 파생 지표 계산.
// 모든 개입(화재·오브젝트·게이트·통로정책)은 결국 구역별 스텝 위험도(riskTrend.zones)로
// 귀결되므로, 그 위에서 계산하는 이 지표들이면 어떤 조건이든 차이가 드러난다.
import type { RiskTrendPoint } from '../types';

// 누적 위험 노출: 전 구역 × 전 스텝의 위험도 합.
// "최대 구역/마지막 스텝" 요약이 놓치는 개입 효과(어느 구역에서 나든)를 항상 잡아낸다.
export function exposure(trend?: RiskTrendPoint[]): number {
  if (!trend) return 0;
  let total = 0;
  for (const pt of trend) {
    for (const z of pt.zones) total += z.riskScore;
  }
  return total;
}

// 전 구간 최고 종합 위험도(그 스텝의 최대 구역 점수 중 최댓값).
export function peakOverall(trend?: RiskTrendPoint[]): number {
  if (!trend) return 0;
  let mx = 0;
  for (const pt of trend) if (pt.overallRiskScore > mx) mx = pt.overallRiskScore;
  return mx;
}

// 한 구역의 스텝별 위험도 시계열.
export function zoneSeries(trend: RiskTrendPoint[] | undefined, zoneId: number): number[] {
  if (!trend) return [];
  const out: number[] = [];
  for (const pt of trend) {
    const z = pt.zones.find((zz) => zz.zoneId === zoneId);
    out.push(z ? z.riskScore : 0);
  }
  return out;
}
