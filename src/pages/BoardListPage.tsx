import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { fetchCommonCodes, fetchPosts } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { CATEGORY_CODE_OPTIONS } from '../constants/categoryCode';
import { MARKET_CODE_OPTIONS } from '../constants/marketCode';
import type { PostListResponse, PostSummary } from '../types/board';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-07-24 추가 (게시판 기능)
// 2026-07-25 UI 설계서 반영: 상단 카테고리 탭(전체/공지사항/자유게시판) +
// 관리자 전용 시장 전환 탭 추가. "전체"는 실제 코드가 아니라 필터 없음을 뜻하는
// UI 상태라 쿼리 파라미터를 아예 안 보내는 방식으로 표현함.
//
// 공지(is_notice=true)는 시장/카테고리 무관 항상 상단 고정 노출, 일반 글은 필터+페이징 적용.
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

function categoryLabel(options: { code: string; name: string }[], code: string) {
  return options.find((o) => o.code === code)?.name ?? code;
}

function marketLabel(options: { code: string; name: string }[], code: string | null) {
  if (!code) return '전체'; // 공지 등 marketCode가 없는 글은 시장 무관이라는 의미로 "전체" 표시
  return options.find((o) => o.code === code)?.name ?? code;
}

export default function BoardListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  const page = Number(searchParams.get('page') ?? '0');
  const keywordParam = searchParams.get('keyword') ?? '';
  const categoryParam = searchParams.get('category') ?? ALL_VALUE;
  const marketParam = searchParams.get('market') ?? ALL_VALUE;

  const [keywordInput, setKeywordInput] = useState(keywordParam);
  const [categoryOptions, setCategoryOptions] = useState(CATEGORY_CODE_OPTIONS);
  const [marketOptions, setMarketOptions] = useState(MARKET_CODE_OPTIONS);
  const [data, setData] = useState<PostListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 2026-07-26 버그 수정: React 18/19 StrictMode(main.tsx)가 개발 모드에서 마운트 시
  // useEffect를 두 번 실행하면서, 공통코드(BCT/MKT) 조회와 목록 조회(load) 쿼리 세트가
  // 통째로 2번씩 나가던 문제. BoardDetailPage(조회수 중복 증가 수정 시)에 적용했던 것과
  // 동일한 ref 가드 패턴을 여기에도 적용해서 중복 호출을 막음.
  const commonCodesLoadedRef = useRef(false);
  useEffect(() => {
    if (commonCodesLoadedRef.current) return;
    commonCodesLoadedRef.current = true;

    fetchCommonCodes('BCT')
      .then((codes) => {
        if (codes.length > 0) setCategoryOptions(codes.map((c) => ({ code: c.code, name: c.codeName })));
      })
      .catch((err) => console.error('공통코드(카테고리) 조회 실패, 로컬 기본값 사용', err));

    // 2026-07-25 변경: 시장 탭(관리자 전용) 노출 여부와 무관하게, 목록 테이블의
    // "시장" 컬럼 라벨 표시를 위해 모든 사용자에게 시장 옵션을 로드함
    fetchCommonCodes('MKT')
      .then((codes) => {
        if (codes.length > 0) setMarketOptions(codes.map((c) => ({ code: c.code, name: c.codeName })));
      })
      .catch((err) => console.error('공통코드(시장) 조회 실패, 로컬 기본값 사용', err));
  }, []);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">게시판</h1>
        <button
          type="button"
          onClick={() => navigate('/board/write')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
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
        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
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
          className="w-full max-w-sm rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          검색
        </button>
      </div>

      {isLoading && <Spinner label="게시판을 불러오는 중..." />}
      {!isLoading && loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {!isLoading && !loadError && data && (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          {/* 2026-07-25 변경: table-fixed + 고정폭 컬럼 조합이 한글 컬럼값(예: "망원시장")마다
              계속 잘리는 문제를 반복해서 일으켜서, 폭을 내용에 맞게 자동으로 늘어나는
              기본 테이블 레이아웃으로 교체함. 대신 각 셀에 whitespace-nowrap을 줘서
              줄바꿈으로 잘리는 일이 없게 하고, 화면보다 테이블이 넓어지면(작은 화면 등)
              컬럼을 줄이는 대신 가로 스크롤(overflow-x-auto, 위 래퍼)로 대응함. */}
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
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
            <tbody className="divide-y divide-slate-800">
              {data.pinned.map((post) => (
                <BoardRow key={post.postId} post={post} categoryOptions={categoryOptions} marketOptions={marketOptions} />
              ))}
              {data.page.content.length === 0 && data.pinned.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    등록된 게시글이 없습니다.
                  </td>
                </tr>
              )}
              {data.page.content.map((post) => (
                <BoardRow key={post.postId} post={post} categoryOptions={categoryOptions} marketOptions={marketOptions} />
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
                  : 'text-slate-400 hover:bg-slate-800'
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

function TabButton({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 ${small ? 'py-1 text-xs' : 'py-1.5 text-sm'} ${
        active
          ? 'border-blue-600 bg-blue-600/20 text-blue-300'
          : 'border-slate-700 text-slate-400 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function BoardRow({
  post,
  categoryOptions,
  marketOptions,
}: {
  post: PostSummary;
  categoryOptions: { code: string; name: string }[];
  marketOptions: { code: string; name: string }[];
}) {
  return (
    <tr className="text-slate-200 hover:bg-slate-900/60">
      <td className="whitespace-nowrap px-3 py-3">
        {post.notice && (
          <span className="inline-block whitespace-nowrap rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-300">
            공지
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
        {marketLabel(marketOptions, post.marketCode)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
        {categoryLabel(categoryOptions, post.categoryCode)}
      </td>
      <td className="px-4 py-3">
        <Link to={`/board/${post.postId}`} className="hover:text-blue-400 hover:underline">
          {post.title}
        </Link>
        {post.attachmentCount > 0 && (
          <span className="ml-1 text-xs text-slate-500">📎{post.attachmentCount}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-400">{post.writerName}</td>
      <td className="whitespace-nowrap px-2 py-3 text-slate-400">{post.viewCount}</td>
      <td className="whitespace-nowrap px-2 py-3 text-slate-400">{post.likeCount}</td>
      <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(post.createdAt)}</td>
    </tr>
  );
}
