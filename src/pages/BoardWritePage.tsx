import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
// 2026-08-20 (성능): 정적 import → React.lazy. tiptap+prosemirror 는 이 화면(글쓰기/수정)
// 에서만 쓰이는데 정적으로 두면 메인 번들에 통째로 들어가, 게시판만 읽는 사용자도
// 에디터 엔진을 내려받는다. HeatmapView3D 와 같은 패턴 - /board/write 진입 시에만
// 별도 청크로 로드되고, 폴백은 에디터 높이(min-h-[240px])를 그대로 잡아 레이아웃이 안 튄다.
const RichTextEditor = lazy(() => import('../components/RichTextEditor'));
import FileDropzone from '../components/FileDropzone';
import { useAuthStore } from '../store/authStore';
import { createPost, fetchPostDetail, updatePost } from '../api/client';
import { ADMIN_ONLY_CATEGORY_CODE } from '../constants/categoryCode';
import { useCommonCodes } from '../hooks/useCommonCodes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Attachment } from '../types/board';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-07-24 추가 (게시판 기능)
// 2026-07-25 UI 설계서 반영: 본문을 plain textarea -> RichTextEditor(Tiptap)로,
// 첨부파일을 단순 file input -> FileDropzone(드래그앤드롭 + 업로드 진행률)으로 교체.
// 카테고리 select 추가(공지사항 카테고리는 관리자만 선택 가능 - BE PostService와 동일 규칙).
//
// 임시저장(이탈 시 저장 확인 팝업)은 이번 범위에서 제외함(사용자 확인 사항).
//
// /board/write(작성)와 /board/:postId/edit(수정)을 같은 컴포넌트로 처리.
//
// 2026-08-12 변경 (UIUX 피드백 반영)
//  1. 이 글이 어느 시장에 올라가는지 화면에 전혀 나오지 않아, 작성자가 시장을 고를
//     수 있다고 오해할 여지가 있었다. 실제로는 BE PostService가 작성자의 담당 시장을
//     그대로 쓰고(marketCode = notice ? user.marketCode : requireMarketCode(user))
//     요청 본문으로 받지 않는다. 그래서 고르는 입력이 아니라 "어디로 올라가는지"를
//     알려주는 읽기 전용 표시로 넣는다. 다른 시장에 글을 쓰게 하려면 BE가 요청에서
//     marketCode를 받도록 바꿔야 해서, 그건 별도 논의 대상이다.
//  2. "공지사항으로 상단 고정" -> "상단 고정". 카테고리 select에 이미 "공지사항"이
//     있어서, 체크박스가 카테고리를 바꾸는 것으로 읽혔다. 이 체크박스가 하는 일은
//     목록 맨 위 고정 하나뿐이다(카테고리와 무관하게 걸 수 있다).
export default function BoardWritePage() {
  const { postId } = useParams<{ postId: string }>();
  const isEditMode = Boolean(postId);
  // 이 컴포넌트가 /board/write 와 /board/:postId/edit 두 라우트를 겸한다.
  // 제목도 갈라줘야 스크린리더가 두 화면을 구분할 수 있다.
  useDocumentTitle(isEditMode ? '글 수정' : '글쓰기');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState(false);
  // 2026-08-12: 화면마다 복사돼 있던 공통코드 조회를 useCommonCodes로 모았다.
  const { options: categoryOptions } = useCommonCodes('BCT');
  const { options: marketOptions, labelOf: marketLabelOf } = useCommonCodes('MKT');
  const [categoryCode, setCategoryCode] = useState('');
  // 수정 모드에서는 글에 이미 박혀 있는 시장을 그대로 보여준다. 작성자의 현재 담당
  // 시장이 그 사이에 바뀌었을 수 있는데, 수정으로 시장이 옮겨가지는 않기 때문이다.
  const [postMarketCode, setPostMarketCode] = useState<string | null>(null);
  // 관리자가 고른 게시 시장. '' 은 "전체 (선택 안 함)" = marketCode null.
  // null이면 아직 초기값을 못 정한 상태(수정 모드에서 글을 불러오기 전).
  const [adminMarketCode, setAdminMarketCode] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [deleteAttachmentIds, setDeleteAttachmentIds] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const detailLoadedRef = useRef(false);
  useEffect(() => {
    if (!isEditMode || !postId || detailLoadedRef.current) return;
    detailLoadedRef.current = true;
    setIsLoading(true);
    // 2026-07-26 버그 수정: 이 호출이 상세 화면과 같은 GET API를 재사용하는데, 편집 화면을
    // 여는 것은 "조회"가 아니므로 조회수를 올리면 안 됨(게다가 StrictMode 이중 실행 시 2씩
    // 올라가던 부작용도 있었음). countView=false로 넘겨서 조회수 증가를 막음.
    fetchPostDetail(Number(postId), false)
        .then((detail) => {
          setTitle(detail.title);
          setContent(detail.content);
          setNotice(detail.notice);
          setCategoryCode(detail.categoryCode);
          setPostMarketCode(detail.marketCode);
          setExistingAttachments(detail.attachments);
        })
        .catch((err) => setLoadError(toDisplayErrorMessage(err, '게시글을 불러오지 못했습니다.')))
        .finally(() => setIsLoading(false));
  }, [isEditMode, postId]);

  // 관리자 시장 셀렉트의 초기값을 한 번만 정한다. 이후 사용자가 고른 값을 덮어쓰지
  // 않도록 아직 정해지지 않았을 때(null)만 채운다.
  useEffect(() => {
    if (!isAdmin || adminMarketCode !== null) return;
    if (isEditMode) {
      // 글을 아직 못 불러왔으면 기다린다. 여기서 ''로 채우면 불러온 뒤에도
      // "전체"로 고정돼 원래 시장이 지워진다.
      if (isLoading) return;
      setAdminMarketCode(postMarketCode ?? '');
    } else {
      setAdminMarketCode(user?.marketCode ?? '');
    }
  }, [isAdmin, adminMarketCode, isEditMode, isLoading, postMarketCode, user?.marketCode]);

  // 공지사항 카테고리는 관리자만 선택 가능 - 비관리자가 실수로 관리자 전용 값을
  // 들고 있게 되는 경우(예: 권한이 바뀐 계정) 안전하게 첫 번째 선택 가능한 값으로 되돌림
  useEffect(() => {
    if (!isAdmin && categoryCode === ADMIN_ONLY_CATEGORY_CODE) {
      const fallback = categoryOptions.find((c) => c.code !== ADMIN_ONLY_CATEGORY_CODE);
      if (fallback) setCategoryCode(fallback.code);
    }
  }, [isAdmin, categoryCode, categoryOptions]);

  // 이 글이 올라갈 시장.
  //  - 관리자(ROL01): 직접 고른다. 빈 값은 "전체"(marketCode=null)로, 모든 시장에서 보인다.
  //  - 그 외: 고를 수 없다. 작성자의 담당 시장으로 정해지며 읽기 전용으로 보여준다.
  //    (BE도 같은 판정을 다시 하므로 화면 값을 믿고 통과시키지 않는다.)
  //
  // 기본값: 수정 모드는 글에 저장된 시장, 작성 모드는 작성자의 담당 시장.
  // 작성자의 현재 담당 시장이 그 사이에 바뀌었을 수 있는데, 수정으로 시장이
  // 저절로 옮겨가면 안 되므로 수정 모드는 글의 값을 그대로 쓴다.
  const defaultMarketCode = isEditMode ? postMarketCode : user?.marketCode ?? null;
  const effectiveMarketCode = isAdmin ? adminMarketCode : defaultMarketCode;
  const marketLabel = defaultMarketCode ? marketLabelOf(defaultMarketCode) : null;
  // 담당 시장이 없는데 공지도 아니면 BE가 거절한다(requireMarketCode). 저장을 눌러
  // 오류를 보기 전에 미리 알린다. 관리자는 직접 고를 수 있으니 해당 없음.
  const isMissingMarket = !isAdmin && !isEditMode && !defaultMarketCode && !notice;

  const toggleDeleteAttachment = (attachmentId: number) => {
    setDeleteAttachmentIds((prev) =>
        prev.includes(attachmentId)
            ? prev.filter((id) => id !== attachmentId)
            : [...prev, attachmentId],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || content === '<p></p>') {
      setSubmitError('제목과 내용을 모두 입력해주세요.');
      return;
    }
    if (!categoryCode) {
      setSubmitError('카테고리를 선택해주세요.');
      return;
    }
    setSubmitError('');
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      if (isEditMode && postId) {
        await updatePost(
            Number(postId),
            {
              title,
              content,
              notice: isAdmin ? notice : undefined,
              categoryCode,
              // 관리자만 보낸다. 그 외 권한이 보내도 BE가 무시하고 작성자 담당 시장을
              // 쓰지만, 보내지 않는 편이 요청의 뜻이 분명하다.
              marketCode: isAdmin ? adminMarketCode ?? '' : undefined,
              deleteAttachmentIds,
              files: newFiles,
            },
            setUploadProgress,
        );
        navigate(`/board/${postId}`);
      } else {
        const newPostId = await createPost(
            {
              title,
              content,
              notice: isAdmin && notice,
              categoryCode,
              marketCode: isAdmin ? adminMarketCode ?? '' : undefined,
              files: newFiles,
            },
            setUploadProgress,
        );
        navigate(`/board/${newPostId}`);
      }
    } catch (err) {
      setSubmitError(toDisplayErrorMessage(err, '게시글 저장에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (isLoading) return <Spinner label="게시글을 불러오는 중..." />;
  if (loadError) return <ErrorBanner message={loadError} />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {isEditMode ? '게시글 수정' : '게시글 작성'}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
      >
        {/* 카테고리(고르는 값)와 게시 시장(정해지는 값)을 한 줄에 나란히 둔다.
            시장은 select가 아니라 회색 상자로 그려서, 눌러도 열리지 않는다는 것을
            생김새로 알 수 있게 했다. */}
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="category" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              카테고리
            </label>
            <select
              id="category"
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              className="w-full max-w-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">선택해주세요</option>
              {categoryOptions.map((c) => (
                <option key={c.code} value={c.code} disabled={c.code === ADMIN_ONLY_CATEGORY_CODE && !isAdmin}>
                  {c.name}
                  {c.code === ADMIN_ONLY_CATEGORY_CODE && !isAdmin ? ' (관리자 전용)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[200px] flex-1">
            {/* 관리자만 고를 수 있다. 그 외에는 같은 자리에 회색 상자로 결과만 보여줘,
                눌러도 열리지 않는다는 것을 생김새로 알 수 있게 했다. */}
            {isAdmin ? (
              <>
                <label htmlFor="market" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                  작성 시장
                </label>
                <select
                  id="market"
                  value={adminMarketCode ?? ''}
                  onChange={(e) => setAdminMarketCode(e.target.value)}
                  className="w-full max-w-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">전체 (선택 안 함)</option>
                  {marketOptions.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {effectiveMarketCode
                    ? '선택한 시장의 게시판에 올라갑니다.'
                    : '시장을 고르지 않으면 모든 시장에서 보입니다.'}
                </p>
              </>
            ) : (
              <>
                <span className="mb-1 block text-sm text-slate-500 dark:text-slate-400">작성 시장</span>
                <p
                  className={`w-full max-w-xs rounded border px-3 py-2 text-sm ${
                    isMissingMarket
                      ? 'border-red-400 text-red-600 dark:border-red-700 dark:text-red-400'
                      : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400'
                  }`}
                >
                  {marketLabel ?? (isMissingMarket ? '담당 시장 없음' : '전체 시장')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {isMissingMarket
                    ? '담당 시장이 없어 일반 글을 쓸 수 없습니다. 관리자에게 소속 시장 지정을 요청해주세요.'
                    : '작성자의 담당 시장으로 자동 게시됩니다.'}
                </p>
              </>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="title" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            제목
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">내용</label>
          <Suspense fallback={<div className="min-h-[240px] rounded-b border border-t-0 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-500">에디터를 불러오는 중...</div>}>
              <RichTextEditor value={content} onChange={setContent} />
            </Suspense>
        </div>

        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={notice}
              onChange={(e) => setNotice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
            상단 고정
            <span className="text-xs text-slate-500">
              (카테고리·시장 필터와 관계없이 목록 맨 위에 항상 노출됩니다)
            </span>
          </label>
        )}

        {isEditMode && existingAttachments.length > 0 && (
          <div>
            <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">기존 첨부파일 (체크하면 삭제됨)</p>
            <ul className="space-y-1">
              {existingAttachments.map((attachment) => (
                <li key={attachment.attachmentId} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={deleteAttachmentIds.includes(attachment.attachmentId)}
                    onChange={() => toggleDeleteAttachment(attachment.attachmentId)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <span className={deleteAttachmentIds.includes(attachment.attachmentId) ? 'line-through text-slate-400 dark:text-slate-600' : ''}>
                    {attachment.originalName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
            {isEditMode ? '새 첨부파일 추가' : '첨부파일'}
          </label>
          <FileDropzone files={newFiles} onChange={setNewFiles} uploadProgress={isSubmitting ? uploadProgress : null} />
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '저장 중...' : isEditMode ? '수정 완료' : '등록'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
            className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
