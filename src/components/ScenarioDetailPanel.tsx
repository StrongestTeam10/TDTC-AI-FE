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

/** 0~1 강도를 백분율로. 값이 없으면 빈 문자열(뒤에 붙는 구분점까지 함께 사라진다). */
function intensityLabel(intensity: number | null): string {
  if (intensity === null || intensity === undefined) return '';
  return ` · 강도 ${Math.round(intensity * 100)}%`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
      <div>
        <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</div>
        {children}
      </div>
  );
}

const emptyText = <span className="text-xs text-slate-400 dark:text-slate-600">없음</span>;

export default function ScenarioDetailPanel({ scenarioId }: { scenarioId: number }) {
  const [detail, setDetail] = useState<ScenarioDetail | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchScenarioDetail(scenarioId)
        .then((data) => { if (alive) setDetail(data); })
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
    return <div role="alert" className="py-2 text-xs text-red-600 dark:text-red-400">{error}</div>;
  }
  if (!detail) return null;

  return (
      <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2 xl:grid-cols-4">
        <Section title="실행 조건">
          <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
            <li>유입 인원 {detail.agentCount ?? '-'}명</li>
            <li>예측 스텝 {detail.steps ?? '-'}</li>
          </ul>
        </Section>

        <Section title={`이벤트 ${detail.events.length}건`}>
          {detail.events.length === 0 ? emptyText : (
              <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                {detail.events.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}
                      </span>
                      {' · '}{zoneLabel(e.zoneName, e.zoneId)}
                      {intensityLabel(e.intensity)}
                      {e.triggerStep !== null && ` · ${e.triggerStep}스텝 발생`}
                      {e.burnSteps !== null && ` · ${e.burnSteps}스텝 연소`}
                    </li>
                ))}
              </ul>
          )}
        </Section>

        <Section title={`배치 오브젝트 ${detail.objects.length}개`}>
          {detail.objects.length === 0 ? emptyText : (
              <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                {detail.objects.map((o, i) => (
                    <li key={i}>
                      {OBJECT_TYPE_LABELS[o.objectType] ?? o.objectType}
                      {' · '}{zoneLabel(o.zoneName, o.zoneId)}
                      {intensityLabel(o.intensity)}
                    </li>
                ))}
              </ul>
          )}
        </Section>

        <Section title={`통로 정책 ${detail.corridorPolicies.length}건 · 닫은 게이트 ${detail.closedGates.length}곳`}>
          {detail.corridorPolicies.length === 0 && detail.closedGates.length === 0 ? emptyText : (
              <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                {detail.corridorPolicies.map((c, i) => (
                    <li key={`c${i}`}>
                      {zoneLabel(c.fromZoneName, c.fromZoneId)} → {zoneLabel(c.toZoneName, c.toZoneId)}
                      {' · '}{CORRIDOR_ACTION_LABELS[c.action] ?? c.action}
                    </li>
                ))}
                {detail.closedGates.map((g) => (
                    <li key={`g${g.facilityId}`}>
                      게이트 폐쇄 · {g.name ?? `#${g.facilityId}`}
                    </li>
                ))}
              </ul>
          )}
        </Section>
      </div>
  );
}
