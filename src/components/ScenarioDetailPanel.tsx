import { useEffect, useState } from 'react';
import Spinner from './ui/Spinner';
import { fetchScenarioDetail, type ScenarioDetail } from '../api/client';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-08-08 추가 (시나리오 상세)
//
// 시나리오 이력에서 행을 펼쳤을 때 그 실행의 설정을 보여준다.
//
// 필요한 이유: 목록의 이름은 "{날짜} {시장} {정책유형} 시나리오" 형태라 같은 시장에서
// 같은 유형을 여러 번 돌리면 서로 구분되지 않는다. 보고서를 만들 대상을 고르는 화면인데
// 대상을 식별할 수 없으면 기능이 반쯤만 동작한다.
//
// 지도는 넣지 않았다. 어느 구역에 무엇을 뒀는지는 글로도 충분히 전달되고, 지도를 그리려면
// HeatmapView와 구역 폴리곤까지 끌어와야 해서 목록 화면에 얹기에는 무겁다.
//
// 2026-08-12 변경 (UIUX 피드백 반영): 내용은 좋은데 글자가 너무 작다는 지적이 있어
// 본문·절 제목을 text-xs -> text-sm으로 올리고 줄 간격을 함께 넓혔다. 이 패널은
// 보고서를 만들 대상을 고르기 전에 "어느 실행인지" 확인하려고 여는 곳이라, 표의
// 보조 정보보다 읽기 쉬워야 한다.

const OBJECT_TYPE_LABELS: Record<string, string> = {
  food_truck: '푸드트럭',
  event_zone: '행사존',
  rest_area: '휴게 공간',
  obstacle: '장애물/적재물',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  fire: '화재',
  acoustic_anomaly: '음향 이상',
};

const CORRIDOR_ACTION_LABELS: Record<string, string> = {
  close: '폐쇄',
  open: '개방',
  one_way: '일방통행',
};

/** 구역 이름이 있으면 이름, 없으면 번호. 지워진 구역을 가리키는 옛 데이터 대비. */
function zoneLabel(zoneName: string | null, zoneId: number | null): string {
  if (zoneName) return zoneName;
  return zoneId === null ? '구역 미지정' : `구역 ${zoneId}`;
}

/**
 * 배치 화면(SimulationComparePage)의 강도 기본값. 사용자가 손대지 않으면 이 값이 들어간다.
 * 기본값 그대로인 항목까지 "강도 50%"를 적으면 모든 줄에 같은 글자가 붙어, 정작
 * 값을 바꾼 항목이 묻힌다. 다른 값일 때만 표시한다.
 */
const DEFAULT_INTENSITY = 0.5;

/** 0~1 강도를 백분율로. 기본값이거나 값이 없으면 빈 문자열(앞의 구분점까지 함께 사라진다). */
function intensityLabel(intensity: number | null): string {
  if (intensity === null || intensity === undefined) return '';
  if (Math.abs(intensity - DEFAULT_INTENSITY) < 1e-9) return '';
  return ` · 강도 ${Math.round(intensity * 100)}%`;
}

/**
 * 같은 항목이 여러 개면 한 줄로 묶고 개수를 붙인다.
 *
 * 오브젝트는 같은 구역에 같은 종류를 여러 개 찍는 일이 흔해서, 그대로 나열하면
 * 글자 하나 다르지 않은 줄이 이어진다(휴게 공간 · 중앙 구역 ×4 같은 경우).
 * 묶는 기준에 강도까지 넣어, 강도가 다른 항목은 따로 남는다.
 */
function groupByLabel<T>(items: T[], labelOf: (item: T) => string): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = labelOf(item);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
      <div>
        <div className="mb-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</div>
        {children}
      </div>
  );
}

const emptyText = <span className="text-sm text-slate-400 dark:text-slate-600">없음</span>;

/**
 * 한 번 받아온 실행 설정을 담아둔다. 접었다 다시 펴도 요청하지 않는다.
 *
 * 모듈 수준에 두는 이유: 패널은 접을 때 언마운트되므로 컴포넌트 안에 두면 캐시가
 * 함께 사라진다. 화면을 벗어나면 비워도 되지만, 이 목록을 오가는 동안 유지되는 편이
 * 낫고 항목 하나가 작아 그냥 둔다.
 *
 * 만료 시간을 두지 않는 이유: 실행 설정은 시뮬레이션을 돌린 시점에 확정되어 이후
 * 바뀌지 않는다(simscnr01m.virtual_config는 실행 요청을 그대로 적어둔 기록이다).
 * 목록 쪽 캐시에 TTL이 있는 것과는 사정이 다르다 - 거기는 새 실행이 계속 쌓인다.
 */
const detailCache = new Map<number, ScenarioDetail>();

/**
 * 셀 하나 안에서 절을 나눠 그린다.
 *
 * 한때 절마다 실제 <td>를 써서 위쪽 표의 열 경계(시장·정책 유형)에 맞춰봤는데,
 * 창을 좁히면 각 절이 그 열 폭에 갇혀 글자가 잘게 접혔다. 표의 열 폭은 한 줄짜리
 * 값에 맞춰 잡은 것이라 여러 줄 목록을 담기에 맞지 않는다.
 * 지금은 셀 하나를 쓰고 그 안에서 화면 폭에 따라 접히는 격자로 나눈다.
 */
export default function ScenarioDetailPanel({ scenarioId }: { scenarioId: number }) {
  const cached = detailCache.get(scenarioId);
  const [detail, setDetail] = useState<ScenarioDetail | null>(cached ?? null);
  // 캐시에 있으면 첫 렌더부터 내용이 있으므로 로딩 상태를 거치지 않는다.
  const [isLoading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hit = detailCache.get(scenarioId);
    if (hit) {
      setDetail(hit);
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    fetchScenarioDetail(scenarioId)
        .then((data) => {
          detailCache.set(scenarioId, data);
          if (alive) setDetail(data);
        })
        .catch((err) => {
          console.error('시나리오 상세 로드 실패', err);
          if (alive) setError(toDisplayErrorMessage(err, '실행 설정을 불러오지 못했습니다.'));
        })
        .finally(() => { if (alive) setLoading(false); });
    // 펼쳤다 접었다를 빠르게 반복하면 늦게 온 응답이 이미 닫힌 패널에 setState를 시도한다.
    return () => { alive = false; };
  }, [scenarioId]);

  if (isLoading) return <Spinner label="실행 설정을 불러오는 중..." className="py-4" />;
  if (error) {
    return <div role="alert" className="py-3 text-sm text-red-600 dark:text-red-400">{error}</div>;
  }
  if (!detail) return null;

  return (
      <div className="space-y-3 py-3">
        {/* 실행 조건은 값 두 개뿐이라 절 하나를 통째로 쓰면 자리가 아깝다. */}
        <div className="text-sm text-slate-500 dark:text-slate-400">
          유입 인원{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {detail.agentCount ?? '-'}명
          </span>
          {' · '}예측 스텝{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {detail.steps ?? '-'}
          </span>
        </div>

        {/* 화면이 좁아지면 3칸 -> 2칸 -> 1칸으로 접힌다. 표의 열 폭에 묶지 않는 이유는
            그 폭이 한 줄짜리 값에 맞춘 것이라, 여러 줄 목록을 담으면 글자가 잘게
            접히기 때문이다. */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <Section title={`이벤트 ${detail.events.length}건`}>
            {detail.events.length === 0 ? emptyText : (
                <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {detail.events.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}
                        </span>
                        {' · '}{zoneLabel(e.zoneName, e.zoneId)}
                        {intensityLabel(e.intensity)}
                        {/* 사용자가 실제로 입력한 값은 "발생 스텝"과 "진압 스텝"이다.
                            저장은 burnSteps(= 진압 - 발생)로 되므로 되돌려 보여준다. */}
                        {e.triggerStep !== null && (
                            <span className="text-slate-500 dark:text-slate-400">
                              {' · '}발생 {e.triggerStep}스텝
                              {e.burnSteps !== null
                                  && ` → 진압 ${e.triggerStep + e.burnSteps}스텝`}
                            </span>
                        )}
                      </li>
                  ))}
                </ul>
            )}
          </Section>

          <Section title={`배치 오브젝트 ${detail.objects.length}개`}>
            {detail.objects.length === 0 ? emptyText : (
                <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {groupByLabel(detail.objects, (o) =>
                      `${OBJECT_TYPE_LABELS[o.objectType] ?? o.objectType} · `
                      + `${zoneLabel(o.zoneName, o.zoneId)}${intensityLabel(o.intensity)}`,
                  ).map((g) => (
                      <li key={g.label}>
                        {g.label}
                        {g.count > 1 && (
                            <span className="ml-1 font-medium text-slate-800 dark:text-slate-100">
                              ×{g.count}
                            </span>
                        )}
                      </li>
                  ))}
                </ul>
            )}
          </Section>

          <Section title={`통로 정책 ${detail.corridorPolicies.length}건 · 닫은 게이트 ${detail.closedGates.length}곳`}>
            {detail.corridorPolicies.length === 0 && detail.closedGates.length === 0 ? emptyText : (
                <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {groupByLabel(detail.corridorPolicies, (c) =>
                      `${zoneLabel(c.fromZoneName, c.fromZoneId)} → ${zoneLabel(c.toZoneName, c.toZoneId)}`
                      + ` · ${CORRIDOR_ACTION_LABELS[c.action] ?? c.action}`,
                  ).map((g) => (
                      <li key={g.label}>
                        {g.label}
                        {g.count > 1 && <span className="ml-1 font-medium">×{g.count}</span>}
                      </li>
                  ))}
                  {/* 게이트는 이름이 제각각이라 묶이지 않는다. "게이트 폐쇄"를 줄마다
                      되풀이하는 대신 절 제목에 맡기고 이름만 쉼표로 잇는다. */}
                  {detail.closedGates.length > 0 && (
                      <li>
                        게이트 폐쇄 ·{' '}
                        {detail.closedGates.map((g) => g.name ?? `#${g.facilityId}`).join(', ')}
                      </li>
                  )}
                </ul>
            )}
          </Section>
        </div>
      </div>
  );
}
