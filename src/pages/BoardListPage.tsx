import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
import { fetchPosts } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useCommonCodes } from '../hooks/useCommonCodes';
import type { PostListResponse, PostSummary } from '../types/board';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// 2026-07-24 추가 (게시판 기능)
// 2026-07-25 UI 설계서 반영: 상단 카테고리 탭(전체/공지사항/자유게시판) +
// 관리자 전용 시장 전환 탭 추가. "전체"는 실제 코드가 아니라 필터 없음을 뜻하는
// UI 상태라 쿼리 파라미터를 아예 안 보내는 방식으로 표현함.
//
// 공지(is_notice=true)는 시장/카테고리 무관 항상 상단 고정 노출, 일반 글은 필터+페이징 적용.
//
// 2026-08-12 변경 (UIUX 피드백 반영)
// 고정 공지가 필터와 무관하게 항상 나오는 것이 "필터가 안 먹는다"로 읽혔다. 자유게시판
// 탭에 공지가 있고, 해운대시장 탭인데 망원시장 공지가 뜨고, 공지사항 탭인데 자유게시판
// 카테고리 글이 보이는 식이다. 동작은 의도한 대로 두기로 했으므로(항상 고정), 고정 글
// 줄에 배경색을 깔아 "이 줄들은 필터 밖에 있다"를 눈으로 구분되게 하고, 화면 상단에
// 그 규칙을 한 줄로 적어둔다.
// 시장 필터는 관리자에게만 노출 - 일반 사용자는 목록 API가 이미 본인 담당 시장으로
// 걸러서 내려주므로 탭 자체가 필요 없음(설계서의 "관리자 시장 탭 결정" 반영).
const PAGE_SIZE = 10;
const ALL_VALUE = ''; // "전체" 탭/옵션을 의미하는 내부 값(쿼리 파라미터 미전송)

function formatDate(iso: string) {
  // 2026-07-25 버그 수정: 기존 toLocaleString('ko-KR') 포맷("2026. 07. 25. 오전 12:36")이
  // 고정폭 작성일 컬럼보다 길어서 잘려 보이는 문제가 있었음. "오전/오후" 없는 24시간제
  // 짧은 포맷으로 교체해서 컬럼 폭 안에 항상 들어가도록 함.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BoardListPage() {
  useDocumentTitle('게시판');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  const page = Number(searchParams.get('page') ?? '0');
  const keywordParam = searchParams.get('keyword') ?? '';
  const categoryParam = searchParams.get('category') ?? ALL_VALUE;
  const marketParam = searchParams.get('market') ?? ALL_VALUE;

  const [keywordInput, setKeywordInput] = useState(keywordParam);
  // 2026-08-12: 화면마다 복사돼 있던 공통코드 조회(+StrictMode 이중 호출 가드)를
  // useCommonCodes로 모았다. 도메인별 캐시가 훅 안에 있어 요청은 앱 전체에서 한 번이다.
  const { options: categoryOptions, labelOf: categoryLabel } = useCommonCodes('BCT');
  const { options: marketOptions, labelOf: marketLabelOf } = useCommonCodes('MKT');
  // 공지 등 marketCode가 없는 글은 시장 무관이라는 의미로 "전체"로 표시한다.
  const marketLabel = (code: string | null) => (code ? marketLabelOf(code) : '전체');
  const [data, setData] = useState<PostListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(() => {
    setIsLoading(true);
    setLoadError('');
    fetchPosts({
      keyword: keywordParam || undefined,
      categoryCode: categoryParam || undefined,
      marketCode: isAdmin ? marketParam || undefined : undefined,
      page,
      size: PAGE_SIZE,
    })
        .then(setData)
        .catch((err) => setLoadError(toDisplayErrorMessage(err, '게시판 목록을 불러오지 못했습니다.')))
        .finally(() => setIsLoading(false));
  }, [keywordParam, categoryParam, marketParam, isAdmin, page]);

  // 파라미터 조합(검색어/카테고리/시장/페이지)이 실제로 바뀔 때만 load()를 호출하고,
  // StrictMode가 동일 조합으로 effect를 재실행하는 경우는 건너뜀
  const lastLoadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${keywordParam}|${categoryParam}|${marketParam}|${isAdmin}|${page}`;
    if (lastLoadedKeyRef.current === key) return;
    lastLoadedKeyRef.current = key;
    load();
  }, [load, keywordParam, categoryParam, marketParam, isAdmin, page]);

  const updateParams = (next: Record<string, string>) => {
    setSearchParams({
      keyword: keywordParam,
      category: categoryParam,
      market: marketParam,
      page: '0',
      ...next,
    });
  };

  const handleSearch = () => updateParams({ keyword: keywordInput, page: '0' });
  const goToPage = (nextPage: number) =>
      setSearchParams({ keyword: keywordParam, category: categoryParam, market: marketParam, page: String(nextPage) });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">게시판</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? '전체 시장의 공지와 게시글입니다. 상단에 색이 깔린 고정 공지는 카테고리·시장 필터와 관계없이 항상 노출됩니다.'
              : '담당 시장의 공지와 게시글입니다. 상단에 색이 깔린 고정 공지는 카테고리 필터와 관계없이 항상 노출됩니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/board/write')}
          className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          글쓰기
        </button>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-2">
        <TabButton active={categoryParam === ALL_VALUE} onClick={() => updateParams({ category: ALL_VALUE })}>
          전체
        </TabButton>
        {categoryOptions.map((c) => (
          <TabButton key={c.code} active={categoryParam === c.code} onClick={() => updateParams({ category: c.code })}>
            {c.name}
          </TabButton>
        ))}
      </div>

      {/* 관리자 전용 시장 전환 탭 */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <TabButton active={marketParam === ALL_VALUE} onClick={() => updateParams({ market: ALL_VALUE })} small>
            전체 시장
          </TabButton>
          {marketOptions.map((m) => (
            <TabButton key={m.code} active={marketParam === m.code} onClick={() => updateParams({ market: m.code })} small>
              {m.name}
            </TabButton>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="제목·내용·작성자 검색"
          className="w-full max-w-sm rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          검색
        </button>
      </div>

      {isLoading && <Spinner label="게시판을 불러오는 중..." />}
      {!isLoading && loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {!isLoading && !loadError && data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          {/* 2026-07-25 변경: table-fixed + 고정폭 컬럼 조합이 한글 컬럼값(예: "망원시장")마다
              계속 잘리는 문제를 반복해서 일으켜서, 폭을 내용에 맞게 자동으로 늘어나는
              기본 테이블 레이아웃으로 교체함. 대신 각 셀에 whitespace-nowrap을 줘서
              줄바꿈으로 잘리는 일이 없게 하고, 화면보다 테이블이 넓어지면(작은 화면 등)
              컬럼을 줄이는 대신 가로 스크롤(overflow-x-auto, 위 래퍼)로 대응함. */}
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="whitespace-nowrap px-3 py-3">구분</th>
                <th className="whitespace-nowrap px-3 py-3">시장</th>
                <th className="whitespace-nowrap px-3 py-3">카테고리</th>
                <th className="min-w-[240px] px-4 py-3">제목</th>
                <th className="whitespace-nowrap px-4 py-3">작성자</th>
                <th className="whitespace-nowrap px-2 py-3">조회</th>
                <th className="whitespace-nowrap px-2 py-3">좋아요</th>
                <th className="whitespace-nowrap px-3 py-3">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.pinned.map((post) => (
                <BoardRow key={post.postId} post={post} pinned categoryLabel={categoryLabel} marketLabel={marketLabel} />
              ))}
              {data.page.content.length === 0 && data.pinned.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    등록된 게시글이 없습니다.
                  </td>
                </tr>
              )}
              {data.page.content.map((post) => (
                <BoardRow key={post.postId} post={post} categoryLabel={categoryLabel} marketLabel={marketLabel} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !loadError && data && data.page.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: data.page.totalPages }, (_, i) => i).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => goToPage(p)}
              className={`h-8 w-8 rounded text-sm ${
                p === data.page.page
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {p + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardRow({
  post,
  pinned = false,
  categoryLabel,
  marketLabel,
}: {
  post: PostSummary;
  /** 필터 밖에서 항상 맨 위에 붙는 고정 공지인지. 줄 배경색으로 구분한다. */
  pinned?: boolean;
  // 공통코드 조회는 부모(useCommonCodes)가 한 번만 하고, 여기서는 변환 함수만 받는다.
  categoryLabel: (code: string) => string;
  marketLabel: (code: string | null) => string;
}) {
  return (
    <tr
      className={
        pinned
          ? 'bg-amber-50 text-slate-800 hover:bg-amber-100 dark:bg-amber-500/5 dark:text-slate-200 dark:hover:bg-amber-500/10'
          : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900/60'
      }
    >
      <td className="whitespace-nowrap px-3 py-3">
        {post.notice && (
          <span className="inline-block whitespace-nowrap rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            공지
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
        {marketLabel(post.marketCode)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
        {categoryLabel(post.categoryCode)}
      </td>
      <td className="px-4 py-3">
        <Link to={`/board/${post.postId}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
          {post.title}
        </Link>
        {post.attachmentCount > 0 && (
          <span className="ml-1 text-xs text-slate-500">📎{post.attachmentCount}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{post.writerName}</td>
      <td className="whitespace-nowrap px-2 py-3 text-slate-500 dark:text-slate-400">{post.viewCount}</td>
      <td className="whitespace-nowrap px-2 py-3 text-slate-500 dark:text-slate-400">{post.likeCount}</td>
      <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(post.createdAt)}</td>
    </tr>
  );
}
