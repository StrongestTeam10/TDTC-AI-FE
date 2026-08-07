import { useCallback, useEffect, useMemo, useState } from 'react';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
import { useReportGeneration } from '../hooks/useReportGeneration';
import { useAuthStore } from '../store/authStore';
import { isAdmin as isAdminUser } from '../auth/permissions';
import {
  fetchAllScenarios,
  fetchMyScenarios,
  fetchMarkets,
  type ScenarioHistoryItem,
} from '../api/client';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { Market } from '../types';

// 2026-08-06 추가 (시나리오 이력)
//
// 이전에 실행한 시뮬레이션을 모아 보고, 각 실행으로 정책 보고서를 만들거나 이미 만든
// 보고서를 내려받는 화면.
//
// 권한별로 목록의 범위가 다르다:
//  - 관리자(ROL01): 실행자와 무관한 전체 이력(GET /api/simulation/scenarios).
//    시장 전환 탭과 실행자 열이 함께 나온다.
//  - 관제요원(ROL02): 본인이 실행한 이력만(GET /api/simulation/scenarios/my).
//  - 조회자(ROL03): 헤더 메뉴가 숨겨지고 RequireControlAccess가 라우트를 막는다.
//    BE도 /api/simulation/** 자체를 ROL01·ROL02로 제한하므로 목록이 새지 않는다.
//
// 목록에는 보고서가 없는 실행도 함께 나온다. 사용자가 찾는 것은 "내가 돌린 실험"이고
// 보고서는 그중 일부에 붙은 결과물이다(BE ReportQueryRepository 주석과 같은 판단).

const ALL_MARKETS = -1; // "전체 시장"을 의미하는 내부 값(marketId 미전송)

// comcode01m POL 도메인. BE가 코드만 내려주므로 화면 문구는 여기서 붙인다.
// 코드가 추가되면 여기도 갱신할 것 - 없는 코드는 코드값 그대로 보여준다.
const POLICY_TYPE_LABELS: Record<string, string> = {
  POLNO: '없음',
  POLFR: '화재',
  POLAC: '음향이상',
  POLCB: '통로폐쇄',
};

function formatExecutedAt(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR');
}

export default function ScenarioHistoryPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const [scenarios, setScenarios] = useState<ScenarioHistoryItem[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 관리자 전용 시장 필터. 비관리자는 목록 자체가 담당 시장 것뿐이라 쓰지 않는다.
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketFilter, setMarketFilter] = useState<number>(ALL_MARKETS);

  // 보고서가 만들어진 실행만 보기. 기본은 끔 - 보고서를 새로 만들려면 아직 없는 실행을
  // 찾아야 하므로 전체가 기본 화면이어야 한다.
  //
  // 시장 필터와 달리 서버에 다시 묻지 않고 받아온 목록에서 걸러낸다. hasReport가 이미
  // 응답에 들어 있어 왕복할 이유가 없고, 켜고 끄는 반응이 즉시 나온다.
  //
  // 컨트롤을 탭이 아니라 체크박스로 둔 이유: 이 화면 상단에는 이미 시장 탭 줄이 있어서
  // 탭을 한 줄 더 얹으면 어느 줄이 무슨 기준인지 헷갈린다. 그리고 이것은 화면 전환이
  // 아니라 목록을 좁히는 필터라 체크박스가 의미에 맞다.
  const [onlyWithReport, setOnlyWithReport] = useState(false);

  // 보고서 생성 대상. 제목/질문은 선택 입력이라 한 벌만 두고 대상만 바꿔 쓴다.
  const [target, setTarget] = useState<ScenarioHistoryItem | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [decisionQuestion, setDecisionQuestion] = useState('');

  const {
    generate,
    download,
    generatingScenarioId,
    downloadingScenarioId,
    isGenerating,
    error: reportError,
    clearError: clearReportError,
  } = useReportGeneration();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = isAdmin
          ? await fetchAllScenarios(marketFilter === ALL_MARKETS ? undefined : marketFilter)
          : await fetchMyScenarios();
      setScenarios(data);
    } catch (err) {
      console.error('시나리오 이력 로드 실패', err);
      setLoadError(toDisplayErrorMessage(err, '시나리오 이력을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, marketFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 관리자만 시장 탭을 쓴다. 실패해도 목록 조회와는 무관하니 배너를 띄우지 않는다
  // (탭이 안 나오면 전체 시장 기준으로 그대로 볼 수 있다).
  useEffect(() => {
    if (!isAdmin) return;
    fetchMarkets()
        .then(setMarkets)
        .catch((err) => console.error('시장 목록 로드 실패', err));
  }, [isAdmin]);

  const openReportForm = (scenario: ScenarioHistoryItem) => {
    clearReportError();
    setTarget(scenario);
    setReportTitle('');
    setDecisionQuestion('');
  };

  const closeReportForm = () => setTarget(null);

  const handleGenerate = async () => {
    if (!target) return;
    const response = await generate({
      scenarioId: target.scenarioId,
      reportTitle: reportTitle.trim() || undefined,
      decisionQuestion: decisionQuestion.trim() || undefined,
    });
    if (!response) return; // 실패 - 오류 문구는 폼에 그대로 남겨 다시 시도할 수 있게 한다
    closeReportForm();
    // 방금 만든 보고서가 목록에 "보고서 있음"으로 반영되도록 다시 읽는다.
    load();
  };

  const columnCount = isAdmin ? 7 : 6;

  const withReportCount = useMemo(
      () => scenarios.filter((s) => s.hasReport).length,
      [scenarios],
  );

  // 표에 실제로 그릴 목록. 개수 안내는 걸러내기 전 전체 기준을 유지해서, 필터를 켠
  // 상태에서도 "전체 몇 건 중 몇 건이 보고서인지"를 계속 알 수 있게 한다.
  const visibleScenarios = useMemo(
      () => (onlyWithReport ? scenarios.filter((s) => s.hasReport) : scenarios),
      [scenarios, onlyWithReport],
  );

  const reportCountLabel = `${scenarios.length}건 중 보고서 ${withReportCount}건`;

  return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">시나리오 이력</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin
                  ? '전체 사용자가 실행한 시뮬레이션입니다. 각 실행으로 정책 보고서를 만들거나 이미 만든 보고서를 내려받을 수 있습니다.'
                  : '내가 실행한 시뮬레이션입니다. 각 실행으로 정책 보고서를 만들거나 이미 만든 보고서를 내려받을 수 있습니다.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <input
                  type="checkbox"
                  checked={onlyWithReport}
                  onChange={(e) => setOnlyWithReport(e.target.checked)}
                  className="accent-blue-600"
              />
              보고서 생성된 것만 보기
            </label>
            <span className="text-xs text-slate-500">{reportCountLabel}</span>
            <button
                type="button"
                onClick={load}
                disabled={isLoading}
                className="rounded bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {isLoading ? '갱신 중...' : '새로고침'}
            </button>
          </div>
        </div>

        {/* 관리자 전용 시장 필터. 대시보드/게시판의 시장 전환 탭과 같은 UI를 쓴다. */}
        {isAdmin && markets.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <TabButton
                  active={marketFilter === ALL_MARKETS}
                  onClick={() => setMarketFilter(ALL_MARKETS)}
                  small
              >
                전체
              </TabButton>
              {markets.map((m) => (
                  <TabButton
                      key={m.marketId}
                      active={marketFilter === m.marketId}
                      onClick={() => setMarketFilter(m.marketId)}
                      small
                  >
                    {m.marketName}
                  </TabButton>
              ))}
            </div>
        )}

        {loadError && <ErrorBanner message={loadError} onRetry={load} />}
        {reportError && !target && <ErrorBanner message={reportError} />}

        {/* 보고서 생성 폼. 제목과 질문은 비워도 되고, 비우면 SIM이 기본값을 넣는다. */}
        {target && (
            <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {target.hasReport ? '보고서 재생성' : '보고서 생성'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {target.scenarioName}
                    {target.hasReport && ' · 새 보고서가 기존 보고서를 대체합니다'}
                  </p>
                </div>
                <button
                    type="button"
                    onClick={closeReportForm}
                    disabled={isGenerating}
                    className="shrink-0 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
                >
                  닫기
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label
                      htmlFor="report-title"
                      className="mb-1 block text-xs text-slate-600 dark:text-slate-400"
                  >
                    보고서 제목 <span className="text-slate-500">(선택)</span>
                  </label>
                  <input
                      id="report-title"
                      type="text"
                      maxLength={200}
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      disabled={isGenerating}
                      placeholder="비우면 시장명 기준으로 자동 생성됩니다"
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label
                      htmlFor="decision-question"
                      className="mb-1 block text-xs text-slate-600 dark:text-slate-400"
                  >
                    보고서가 답할 질문 <span className="text-slate-500">(선택)</span>
                  </label>
                  <input
                      id="decision-question"
                      type="text"
                      value={decisionQuestion}
                      onChange={(e) => setDecisionQuestion(e.target.value)}
                      disabled={isGenerating}
                      placeholder="예: 남측 통로를 폐쇄해도 안전한가?"
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 disabled:opacity-50"
                  />
                </div>
              </div>

              {reportError && <ErrorBanner message={reportError} />}

              <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {isGenerating ? '보고서 생성 중...' : '보고서 생성'}
                </button>
                <span className="text-xs text-slate-500">
                  자료 검색과 문서 작성까지 1~3분 걸립니다. 완료되면 자동으로 내려받습니다.
                </span>
              </div>
            </div>
        )}

        {isLoading ? (
            <Spinner label="시나리오 이력을 불러오는 중..." />
        ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">시나리오</th>
                  <th className="px-4 py-2 font-medium">시장</th>
                  {isAdmin && <th className="px-4 py-2 font-medium">실행자</th>}
                  <th className="px-4 py-2 font-medium">유입 인원</th>
                  <th className="px-4 py-2 font-medium">정책 유형</th>
                  <th className="px-4 py-2 font-medium">실행 시각</th>
                  <th className="px-4 py-2 font-medium">보고서</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleScenarios.length === 0 && (
                    <tr>
                      <td colSpan={columnCount} className="px-4 py-8 text-center text-slate-500">
                        {/* 필터 때문에 비었는지, 이력 자체가 없는지를 구분해 알려준다.
                            구분하지 않으면 필터를 켜둔 것을 잊고 "이력이 사라졌다"고 본다. */}
                        {onlyWithReport && scenarios.length > 0
                            ? '보고서가 생성된 시뮬레이션이 없습니다. 체크를 해제하면 전체 이력을 볼 수 있습니다.'
                            : isAdmin
                            ? '표시할 시뮬레이션 이력이 없습니다.'
                            : '아직 실행한 시뮬레이션이 없습니다. 시뮬레이션 비교 화면에서 실행하면 여기에 쌓입니다.'}
                      </td>
                    </tr>
                )}
                {visibleScenarios.map((s) => (
                    <tr key={s.scenarioId} className="text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-2">
                        <div>{s.scenarioName}</div>
                        {s.hasReport && s.reportTitle && (
                            <div className="text-xs text-slate-500">{s.reportTitle}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                        {s.marketName ?? '-'}
                      </td>
                      {isAdmin && (
                          <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                            {/* user_id를 채우기 전에 만들어진 이력은 실행자를 알 수 없다. */}
                            {s.ownerName ?? '실행자 미기록'}
                          </td>
                      )}
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                        {s.agentCount ?? '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                        {s.policyTypeCode
                            ? POLICY_TYPE_LABELS[s.policyTypeCode] ?? s.policyTypeCode
                            : '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                        {formatExecutedAt(s.executedAt)}
                      </td>
                      <td className="px-4 py-2">
                        {generatingScenarioId === s.scenarioId ? (
                            <span className="text-xs text-blue-600 dark:text-blue-400">
                              생성 중...
                            </span>
                        ) : s.hasReport ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                  type="button"
                                  onClick={() => download(s.scenarioId)}
                                  disabled={downloadingScenarioId === s.scenarioId}
                                  className="rounded border border-blue-500/50 px-2 py-1 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
                              >
                                {downloadingScenarioId === s.scenarioId ? '준비 중...' : '다운로드'}
                              </button>
                              <button
                                  type="button"
                                  onClick={() => openReportForm(s)}
                                  disabled={isGenerating}
                                  className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                              >
                                재생성
                              </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => openReportForm(s)}
                                disabled={isGenerating}
                                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                            >
                              보고서 생성
                            </button>
                        )}
                      </td>
                    </tr>
                ))}
                </tbody>
              </table>
            </div>
        )}
      </div>
  );
}
