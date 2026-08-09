import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
import ScenarioDetailPanel from '../components/ScenarioDetailPanel';
import { useReportGeneration } from '../hooks/useReportGeneration';
import { useAuthStore } from '../store/authStore';
import { isAdmin as isAdminUser } from '../auth/permissions';
import {
  fetchAllScenarios,
  fetchMyScenarios,
  fetchMarkets,
  type ScenarioHistoryItem,
  type ScenarioSearchField,
} from '../api/client';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { Market } from '../types';
import type { PageResponse } from '../types/board';

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
// 게시판 목록(BoardListPage)과 같은 값. 한 서비스 안에서 목록 크기가 달라질 이유가 없다.
const PAGE_SIZE = 10;

// 위험도 버킷. 경계값은 SIM score_to_level(app/simulation/risk.py)과 동일하게 맞췄다.
// 어긋나면 관제 대시보드에서 "위험"으로 보이던 실행이 여기서는 "주의"로 걸러진다.
//
// 이 표가 등급의 유일한 출처다. BE는 점수(0~100)만 내려주고 min/max 범위만 받으므로,
// 경계를 바꿀 때 여기만 고치면 필터와 표시가 함께 따라간다.
type RiskBucket = {
  id: string;
  label: string;
  // 드롭다운에 보이는 문구. 점수 구간을 함께 적어 "몇 점부터 심각인지"를 따로
  // 안내하지 않아도 알 수 있게 한다.
  optionLabel: string;
  min?: number;
  max?: number;
  // 표에서 점수에 입히는 색. 대시보드의 위험도 색 관례를 따른다.
  className: string;
};

const RISK_BUCKETS: RiskBucket[] = [
  { id: 'all', label: '전체', optionLabel: '위험도 전체', className: '' },
  {
    id: 'critical', label: '심각', optionLabel: '심각 (75점 이상)',
    min: 75, className: 'text-red-600 dark:text-red-400',
  },
  {
    id: 'high', label: '위험', optionLabel: '위험 (50~74점)',
    min: 50, max: 74, className: 'text-orange-600 dark:text-orange-400',
  },
  {
    id: 'medium', label: '주의', optionLabel: '주의 (25~49점)',
    min: 25, max: 49, className: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'low', label: '안전', optionLabel: '안전 (24점 이하)',
    max: 24, className: 'text-emerald-600 dark:text-emerald-400',
  },
];

/** 점수를 등급 버킷으로 되돌린다. 점수가 없으면 null(화면에 "-"). */
function bucketOfScore(score: number | null): RiskBucket | null {
  if (score === null || score === undefined) return null;
  return (
      RISK_BUCKETS.find(
          (b) => b.id !== 'all'
              && (b.min === undefined || score >= b.min)
              && (b.max === undefined || score <= b.max),
      ) ?? null
  );
}

// 검색 대상. BE ReportService.normalizeSearchField가 받는 값과 같아야 한다.
// adminOnly인 항목은 본인 목록에서 의미가 없어(전부 자기 실행) 숨긴다.
//
// 시나리오명은 목록에 없다: 검색은 DB 원본(예: "시나리오 2026-08-07T05:06:00Z")을 보는데
// 화면에 보이는 이름은 BE가 조립한 값(예: "2026-08-07 14:06 망원시장 화재 시나리오")이라
// 보이는 대로 입력하면 걸리지 않는다. 되지 않는 선택지를 두는 것보다 빼는 편이 낫다.
const SEARCH_FIELDS: { value: ScenarioSearchField; label: string; adminOnly?: boolean }[] = [
  { value: 'all', label: '전체' },
  { value: 'market', label: '시장' },
  { value: 'policy', label: '정책 유형' },
  { value: 'reportTitle', label: '보고서 제목' },
  { value: 'owner', label: '실행자', adminOnly: true },
];

// comcode01m POL 도메인. BE가 코드만 내려주므로 화면 문구는 여기서 붙인다.
// 코드가 추가되면 여기도 갱신할 것 - 없는 코드는 코드값 그대로 보여준다.
const POLICY_TYPE_LABELS: Record<string, string> = {
  POLNO: '없음',
  POLFR: '화재',
  POLAC: '음향이상',
  POLCB: '통로폐쇄',
};

export default function ScenarioHistoryPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const [historyPage, setHistoryPage] = useState<PageResponse<ScenarioHistoryItem> | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  // 검색 대상은 초안(searchField)과 적용값(appliedSearchField)을 나눠 둔다.
  //
  // 드롭다운을 고르는 것만으로 목록이 다시 불리면, 검색어를 입력하는 중에 조건을 먼저
  // 골랐을 때 화면이 예고 없이 바뀐다. 검색어 입력과 마찬가지로 "검색"을 눌러야
  // 반영되게 해서 조회 시점을 사용자가 정하도록 했다(게시판 검색과 같은 관례).
  const [searchField, setSearchField] = useState<ScenarioSearchField>('all');
  const [appliedSearchField, setAppliedSearchField] = useState<ScenarioSearchField>('all');
  const [page, setPage] = useState(0);

  // 관리자 전용 시장 필터. 비관리자는 목록 자체가 담당 시장 것뿐이라 쓰지 않는다.
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketFilter, setMarketFilter] = useState<number>(ALL_MARKETS);

  // 보고서가 만들어진 실행만 보기. 기본은 끔 - 보고서를 새로 만들려면 아직 없는 실행을
  // 찾아야 하므로 전체가 기본 화면이어야 한다.
  //
  // 컨트롤을 탭이 아니라 체크박스로 둔 이유: 이 화면 상단에는 이미 시장 탭 줄이 있어서
  // 탭을 한 줄 더 얹으면 어느 줄이 무슨 기준인지 헷갈린다. 그리고 이것은 화면 전환이
  // 아니라 목록을 좁히는 필터라 체크박스가 의미에 맞다.
  const [onlyWithReport, setOnlyWithReport] = useState(false);

  // 위험도 버킷 필터. 'all'이면 서버에 범위를 아예 보내지 않아 점수가 없는 옛 이력도
  // 함께 나온다. 드롭다운으로 두고 검색창과 한 줄에 배치해 이 화면의 헤더가 세 줄로
  // 늘어나지 않게 했다.
  const [riskBucketId, setRiskBucketId] = useState('all');

  // 펼쳐 놓은 시나리오. 한 번에 하나만 연다 - 여러 개를 열어두면 표가 길어져
  // 페이저가 화면 밖으로 밀려나고, 비교하려면 어차피 위아래로 스크롤해야 한다.
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  /**
   * 조회 결과 캐시. 같은 조건·같은 페이지를 다시 보면 요청 없이 즉시 그린다.
   *
   * 페이지를 넘길 때마다 원격 Supabase까지 왕복하던 것을 없애기 위한 것이다. 되돌아간
   * 페이지는 캐시에서 나오고, 다음 페이지는 미리 받아둬(prefetchNext) 눌렀을 때 이미
   * 캐시에 있다. 결과적으로 대부분의 이동에서 로딩 상태 자체가 생기지 않는다.
   *
   * TTL을 둔 이유: 이 목록은 시뮬레이션을 돌릴 때마다 맨 앞에 쌓인다. 캐시를 무기한
   * 두면 새로 실행한 시나리오가 첫 페이지에 나타나지 않는다. 30초면 페이지를 넘나드는
   * 동작은 전부 캐시에 걸리고 오래된 값은 알아서 버려진다.
   */
  const cacheRef = useRef(new Map<string, { at: number; data: PageResponse<ScenarioHistoryItem> }>());
  const CACHE_TTL_MS = 30_000;

  const cacheKeyOf = useCallback(
      (targetPage: number) => JSON.stringify([
        isAdmin, marketFilter, keyword, appliedSearchField, onlyWithReport, riskBucketId, targetPage,
      ]),
      [appliedSearchField, isAdmin, keyword, marketFilter, onlyWithReport, riskBucketId],
  );

  const fetchPage = useCallback(
      (targetPage: number) => {
        const bucket = RISK_BUCKETS.find((b) => b.id === riskBucketId);
        const query = {
          keyword: keyword || undefined,
          // 검색어가 없으면 대상도 보내지 않는다(BE가 어차피 무시한다).
          searchField: keyword ? appliedSearchField : undefined,
          withReportOnly: onlyWithReport,
          // 'all'이면 min/max 모두 undefined라 요청에서 빠진다(위험도로 거르지 않음).
          minRiskScore: bucket?.min,
          maxRiskScore: bucket?.max,
          page: targetPage,
          size: PAGE_SIZE,
        };
        return isAdmin
            ? fetchAllScenarios(marketFilter === ALL_MARKETS ? undefined : marketFilter, query)
            : fetchMyScenarios(query);
      },
      [appliedSearchField, isAdmin, keyword, marketFilter, onlyWithReport, riskBucketId],
  );

  /**
   * 캐시에서 아직 쓸 수 있는 값만 꺼낸다. 만료된 항목은 없는 것으로 다룬다.
   *
   * 유효성 판단을 이 함수 하나로 모은 이유: 처음에는 조회하는 쪽만 TTL을 보고
   * 미리 가져오는 쪽은 `has(key)`만 확인했다. 그러면 만료된 항목이 남아 있을 때
   * 미리 가져오기가 "이미 있다"며 건너뛰고, 정작 조회는 만료로 판단해 새로 요청한다.
   * 결과적으로 미리 가져오기가 한 번도 듣지 않았다.
   */
  const readCache = useCallback((targetPage: number) => {
    const hit = cacheRef.current.get(cacheKeyOf(targetPage));
    if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) return undefined;
    return hit.data;
  }, [cacheKeyOf]);

  /** 다음 페이지를 background로 받아 캐시에만 넣는다. 화면 상태는 건드리지 않는다. */
  const prefetchNext = useCallback(
      (current: PageResponse<ScenarioHistoryItem>) => {
        const next = current.page + 1;
        if (next >= current.totalPages) return;
        if (readCache(next)) return;
        const key = cacheKeyOf(next);
        fetchPage(next)
            .then((data) => cacheRef.current.set(key, { at: Date.now(), data }))
            // 미리 받아두는 것뿐이라 실패해도 화면에 알리지 않는다. 사용자가 실제로
            // 그 페이지를 누르면 그때 다시 요청하고 오류도 그때 보여준다.
            .catch(() => {});
      },
      [cacheKeyOf, fetchPage, readCache],
  );

  const load = useCallback(async () => {
    const key = cacheKeyOf(page);
    const cached = readCache(page);
    if (cached) {
      // 캐시 적중: setLoading(true)를 거치지 않아 흐려짐도 스피너도 나타나지 않는다.
      setHistoryPage(cached);
      setLoadError(null);
      setLoading(false);
      prefetchNext(cached);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchPage(page);
      cacheRef.current.set(key, { at: Date.now(), data });
      setHistoryPage(data);
      prefetchNext(data);
    } catch (err) {
      console.error('시나리오 이력 로드 실패', err);
      setLoadError(toDisplayErrorMessage(err, '시나리오 이력을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [cacheKeyOf, fetchPage, page, prefetchNext, readCache]);

  useEffect(() => {
    load();
  }, [load]);

  /** 캐시를 버리고 다시 읽는다. 새로고침 버튼과 보고서 생성 직후에 쓴다. */
  const reload = useCallback(() => {
    cacheRef.current.clear();
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
    // 방금 만든 보고서가 목록에 "보고서 있음"으로 반영되도록 캐시를 버리고 다시 읽는다.
    // load()만 부르면 캐시에 남은 옛 응답이 그대로 나와 버튼이 "보고서 생성"으로 보인다.
    reload();
  };

  // 펼치기 · # · 시나리오 · 시장 · [실행자] · 유입 인원 · 정책 유형 · 위험도 · 보고서
  const columnCount = isAdmin ? 9 : 8;

  // 첫 진입에만 스피너를 띄운다. 이후 재조회는 표를 유지한 채 흐리게만 처리해
  // 페이지를 넘길 때 화면이 통째로 사라지지 않게 한다.
  const isInitialLoading = isLoading && historyPage === null;
  const scenarios = historyPage?.content ?? [];
  const totalPages = historyPage?.totalPages ?? 0;
  const pageNumbers = useMemo(() => {
    if (totalPages === 0) return [];
    const start = Math.max(0, Math.min(page - 2, totalPages - 5));
    const end = Math.min(totalPages, start + 5);
    return Array.from({ length: end - start }, (_, index) => start + index);
  }, [page, totalPages]);

  // 실행자 검색은 본인 목록에서 의미가 없다(전부 자기 실행).
  const searchFieldOptions = useMemo(
      () => SEARCH_FIELDS.filter((f) => !f.adminOnly || isAdmin),
      [isAdmin],
  );

  // 안내 문구를 고른 대상에 맞춘다. 전부 나열하면 실제로 어디를 찾는지 알 수 없다.
  const searchPlaceholder = useMemo(() => {
    if (searchField !== 'all') {
      const label = SEARCH_FIELDS.find((f) => f.value === searchField)?.label ?? '';
      return `${label} 검색`;
    }
    return searchFieldOptions
        .filter((f) => f.value !== 'all')
        .map((f) => f.label)
        .join(', ') + ' 검색';
  }, [searchField, searchFieldOptions]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setKeyword(searchInput.trim());
    // 검색어와 대상을 같은 시점에 확정한다. 대상만 먼저 반영되면 이전 검색어가
    // 새 대상으로 다시 조회되어, 누르지 않은 검색이 일어난 것처럼 보인다.
    setAppliedSearchField(searchField);
  };

  // 검색어가 비어 있으면 누를 것이 없다. 빈 검색을 허용하면 목록이 전체로 돌아가는데,
  // 그건 "필터 초기화"가 하는 일이라 버튼 두 개가 같은 일을 하게 된다.
  const canSearch = searchInput.trim().length > 0;

  const selectMarket = (marketId: number) => {
    setMarketFilter(marketId);
    setPage(0);
  };

  const selectRiskBucket = (bucketId: string) => {
    setRiskBucketId(bucketId);
    setPage(0);
  };

  // 목록이 바뀌면 펼쳐둔 상세를 닫는다. 안 닫으면 다른 페이지로 넘어갔을 때 그 번호가
  // 목록에 없는데도 열린 상태가 남아, 표 높이만 늘어나고 보이는 건 없다.
  useEffect(() => {
    setExpandedId(null);
  }, [page, keyword, appliedSearchField, onlyWithReport, riskBucketId, marketFilter]);

  // 필터가 네 개라 0건이 나왔을 때 어느 것 때문인지 알기 어렵다. 켜져 있는 조건을
  // 모아 두고, 빈 목록 안내와 초기화 버튼에서 함께 쓴다.
  const activeFilters: string[] = [];
  if (keyword) {
    // 초안(searchField)이 아니라 실제로 조회에 쓰인 값을 보여준다.
    const fieldLabel =
        SEARCH_FIELDS.find((f) => f.value === appliedSearchField)?.label ?? '전체';
    activeFilters.push(`${fieldLabel} 검색 "${keyword}"`);
  }
  if (riskBucketId !== 'all') {
    activeFilters.push(
        `위험도 ${RISK_BUCKETS.find((b) => b.id === riskBucketId)?.label ?? riskBucketId}`);
  }
  if (onlyWithReport) activeFilters.push('보고서 있음');
  if (isAdmin && marketFilter !== ALL_MARKETS) {
    activeFilters.push(
        `시장 ${markets.find((m) => m.marketId === marketFilter)?.marketName ?? marketFilter}`);
  }
  const hasActiveFilter = activeFilters.length > 0;

  const resetFilters = () => {
    setSearchInput('');
    setKeyword('');
    setSearchField('all');
    setAppliedSearchField('all');
    setRiskBucketId('all');
    setOnlyWithReport(false);
    setMarketFilter(ALL_MARKETS);
    setPage(0);
  };

  // 체크박스가 켜져 있으면 총 개수가 곧 보고서 개수다. 라벨만 바꿔 그 정보를 살린다
  // (서버 필터로 옮긴 뒤에는 전체 개수와 보고서 개수를 한 쿼리로 함께 얻을 수 없다).
  const totalCount = historyPage?.totalElements ?? 0;
  const reportCountLabel = onlyWithReport
      ? `보고서 ${totalCount}건`
      : `${hasActiveFilter ? '검색 결과' : '전체'} ${totalCount}건`;

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
                  onChange={(e) => {
                    setOnlyWithReport(e.target.checked);
                    setPage(0);
                  }}
                  className="accent-blue-600"
              />
              보고서 생성된 것만 보기
            </label>
            {/* 재조회 중이라는 표시. 표를 스피너로 갈아치우지 않고 여기서만 알린다.
                조건부로 넣고 빼면 이 줄의 폭이 변해 아래 내용이 밀렸다 돌아온다.
                자리는 항상 차지하게 두고 보이기만 전환한다. */}
            <Spinner
                label="조회 중..."
                className={`py-0 text-xs ${
                  isLoading && !isInitialLoading ? 'visible' : 'invisible'
                }`}
            />
            <span className="text-xs text-slate-500">{reportCountLabel}</span>
            {/* 필터 초기화를 검색 줄 끝에서 여기로 옮겼다. 거기서는 줄바꿈에 따라 왼쪽
                아래로 내려가 눈에 띄지 않았다. 조건부로 넣고 빼는 대신 항상 두고
                지울 필터가 없을 때 잠근다 - 나타났다 사라지면 그때마다 줄이 흔들린다. */}
            <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilter}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              필터 초기화
            </button>
            <button
                type="button"
                onClick={reload}
                disabled={isLoading}
                className="rounded bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {isLoading ? '갱신 중...' : '새로고침'}
            </button>
          </div>
        </div>

        {/* 관리자 전용 시장 필터. 대시보드/게시판의 시장 전환 탭과 같은 UI를 쓴다. */}
        {isAdmin && markets.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <TabButton
                  active={marketFilter === ALL_MARKETS}
                  onClick={() => selectMarket(ALL_MARKETS)}
                  small
              >
                전체
              </TabButton>
              {markets.map((m) => (
                  <TabButton
                      key={m.marketId}
                      active={marketFilter === m.marketId}
                      onClick={() => selectMarket(m.marketId)}
                      small
                  >
                    {m.marketName}
                  </TabButton>
              ))}
            </div>
        )}

        {/* 위험도 드롭다운과 검색창을 한 줄에 둔다. 시장 탭이 이미 한 줄을 쓰고 있어서
            위험도를 따로 한 줄 더 두면 헤더가 표보다 커진다.
            칩(세그먼티드) 대신 드롭다운을 쓴 이유: 선택지가 다섯 개라 한 줄에 펼치면
            검색창 자리를 많이 빼앗고, 이 레포가 이미 시점 선택·권한 변경·재생 속도에
            네이티브 select를 쓰고 있어 패턴이 맞다. 네이티브라 키보드·스크린리더
            대응과 모바일 기본 선택기가 그대로 따라온다.
            눈에 보이는 라벨을 따로 두지 않은 대신(닫힌 상태가 "위험도 전체"로 스스로를
            설명한다) aria-label로 보조기기에는 기준을 알린다. */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <select
              aria-label="위험도 필터"
              value={riskBucketId}
              onChange={(event) => selectRiskBucket(event.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {RISK_BUCKETS.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.optionLabel}
                </option>
            ))}
          </select>
          {/* 검색 대상. 게시판의 검색 조건 선택과 같은 관례로 입력창 바로 앞에 둔다. */}
          <select
              aria-label="검색 대상"
              value={searchField}
              onChange={(event) => setSearchField(event.target.value as ScenarioSearchField)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {searchFieldOptions.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
            ))}
          </select>
          <input
              type="search"
              value={searchInput}
              onChange={(event) => {
                const next = event.target.value;
                setSearchInput(next);
                // type="search"의 브라우저 기본 X를 누르면 submit이 일어나지 않는다.
                // 그대로 두면 입력창은 비었는데 목록은 계속 필터된 상태로 남는다.
                if (next === '' && keyword) {
                  setKeyword('');
                  setPage(0);
                }
              }}
              placeholder={searchPlaceholder}
              className="min-w-[200px] flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
              type="submit"
              disabled={isLoading || !canSearch}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            검색
          </button>
        </form>

        {loadError && <ErrorBanner message={loadError} onRetry={reload} />}
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

        {isInitialLoading ? (
            <Spinner label="시나리오 이력을 불러오는 중..." />
        ) : (
            /* 재조회 중에는 표를 언마운트하지 않고 흐리게만 둔다. 예전에는 isLoading일 때
               표와 페이저를 통째로 스피너로 바꿨는데, 페이지를 넘길 때마다 방금 누른
               버튼이 사라졌다 다시 생겨 깜빡임이 심했다(관제 대시보드가 쓰는
               "첫 로딩에만 스피너" 패턴과 같은 방식으로 맞췄다). */
            <div
                aria-busy={isLoading}
                className={`overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 transition-opacity ${
                  isLoading ? 'opacity-50' : 'opacity-100'
                }`}
            >
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="w-8 pl-4 pr-1" aria-label="실행 설정 펼치기" />
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">시나리오</th>
                  <th className="px-4 py-2 font-medium">시장</th>
                  {isAdmin && <th className="px-4 py-2 font-medium">실행자</th>}
                  <th className="px-4 py-2 font-medium">유입 인원</th>
                  <th className="px-4 py-2 font-medium">정책 유형</th>
                  <th className="px-4 py-2 font-medium">위험도</th>
                  <th className="px-4 py-2 font-medium">보고서</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {scenarios.length === 0 && (
                    <tr>
                      <td colSpan={columnCount} className="px-4 py-8 text-center text-slate-500">
                        {/* 필터가 네 개라 어느 것 때문에 0건인지 알기 어렵다. 켜져 있는
                            조건을 그대로 나열한다. 구분하지 않으면 필터를 켜둔 것을 잊고
                            "이력이 사라졌다"고 본다. */}
                        {hasActiveFilter ? (
                            <>
                              적용된 조건({activeFilters.join(' · ')})에 맞는 이력이 없습니다.
                              <button
                                  type="button"
                                  onClick={resetFilters}
                                  className="ml-1 underline hover:text-slate-700 dark:hover:text-slate-300"
                              >
                                필터 초기화
                              </button>
                            </>
                        ) : isAdmin ? (
                            '표시할 시뮬레이션 이력이 없습니다.'
                        ) : (
                            '아직 실행한 시뮬레이션이 없습니다. 시뮬레이션 비교 화면에서 실행하면 여기에 쌓입니다.'
                        )}
                      </td>
                    </tr>
                )}
                {scenarios.map((s) => (
                    <Fragment key={s.scenarioId}>
                    <tr className="h-[52px] text-slate-700 dark:text-slate-200">
                      {/* 실행 설정 펼치기. 목록의 이름만으로는 같은 시장·같은 유형의
                          실행이 구분되지 않아, 어느 것인지 확인할 수단이 필요하다. */}
                      <td className="pl-4 pr-1">
                        <button
                            type="button"
                            onClick={() => setExpandedId(
                                (current) => (current === s.scenarioId ? null : s.scenarioId))}
                            aria-expanded={expandedId === s.scenarioId}
                            aria-label={`시나리오 ${s.scenarioId} 실행 설정 ${
                              expandedId === s.scenarioId ? '접기' : '펼치기'}`}
                            className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <span
                              aria-hidden
                              className={`text-xs transition-transform ${
                                expandedId === s.scenarioId ? 'rotate-180' : ''
                              }`}
                          >
                            ▾
                          </span>
                        </button>
                      </td>
                      {/* 시나리오 번호(simscnr01m.scenario_id). 이름이 서로 비슷해
                          같은 실행을 지목할 때 쓰는 확실한 식별자다. 보고서 파일명과
                          BE 오류 메시지에도 이 번호가 쓰인다. */}
                      <td className="px-4 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {s.scenarioId}
                      </td>
                      <td className="px-4 py-2">
                        {/* 보고서 제목이 없는 행에 빈 줄을 넣지 않는다. 예전에는 높이를
                            맞추려고 빈 줄을 뒀는데, 그러면 제목 없는 행에서 시나리오명이
                            위로 떠 보였다. 대신 tr에 높이를 주고 표 셀 기본값인 수직 중앙
                            정렬에 맡긴다 - 한 줄이면 가운데, 두 줄이면 꽉 찬다. */}
                        <div>{s.scenarioName}</div>
                        {s.hasReport && s.reportTitle && (
                            <div className="truncate text-xs text-slate-500">{s.reportTitle}</div>
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
                      <td className="px-4 py-2">
                        {/* 점수와 등급을 함께 보여준다. 점수만 있으면 75가 심각인지
                            사용자가 기억해야 하고, 등급만 있으면 같은 등급 안에서
                            어느 쪽이 더 위험한지 알 수 없다. */}
                        {(() => {
                          const bucket = bucketOfScore(s.predictedRiskScore);
                          if (!bucket) {
                            return <span className="text-slate-400 dark:text-slate-600">-</span>;
                          }
                          return (
                              <span className={`font-medium ${bucket.className}`}>
                                {s.predictedRiskScore}
                                <span className="ml-1 text-xs font-normal">{bucket.label}</span>
                              </span>
                          );
                        })()}
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
                    {expandedId === s.scenarioId && (
                        <tr className="bg-slate-50 dark:bg-slate-900/60">
                          <td colSpan={columnCount} className="border-t border-slate-200 px-4 dark:border-slate-800">
                            <ScenarioDetailPanel scenarioId={s.scenarioId} />
                          </td>
                        </tr>
                    )}
                    </Fragment>
                ))}
                {/* 마지막 페이지는 행이 10개보다 적어 표가 짧아진다. 빈 행으로 자리를
                    채워 페이지를 넘겨도 표 높이와 페이저 위치가 그대로 있게 한다.
                    높이를 픽셀로 지정하지 않고 데이터 행과 같은 구조(두 줄 + 같은 여백)로
                    그려서, 나중에 행 여백을 바꿔도 저절로 맞는다.
                    페이지가 하나뿐이면 채우지 않는다 - 두 건짜리 결과에 빈 칸 여덟 줄이
                    붙으면 오히려 이상하다. */}
                {totalPages > 1 && Array.from(
                    { length: Math.max(0, PAGE_SIZE - scenarios.length) },
                    (_, index) => (
                        <tr key={`filler-${index}`} aria-hidden className="h-[52px] select-none">
                          {Array.from({ length: columnCount }, (_, cell) => (
                              <td key={cell} className="px-4 py-2" />
                          ))}
                        </tr>
                    ),
                )}
                </tbody>
              </table>
            </div>
        )}

        {!isInitialLoading && totalPages > 1 && (
            <nav className="flex items-center justify-center gap-1" aria-label="시나리오 이력 페이지">
              <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={isLoading || page === 0}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                이전
              </button>
              {pageNumbers.map((pageNumber) => (
                  <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      disabled={isLoading}
                      aria-current={pageNumber === page ? 'page' : undefined}
                      className={`min-w-9 rounded px-3 py-1.5 text-sm ${
                        pageNumber === page
                            ? 'bg-blue-600 font-semibold text-white'
                            : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                  >
                    {pageNumber + 1}
                  </button>
              ))}
              <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={isLoading || page >= totalPages - 1}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                다음
              </button>
            </nav>
        )}
      </div>
  );
}
