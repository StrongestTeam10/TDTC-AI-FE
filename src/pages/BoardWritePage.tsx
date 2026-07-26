import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import RichTextEditor from '../components/RichTextEditor';
import FileDropzone from '../components/FileDropzone';
import { useAuthStore } from '../store/authStore';
import { createPost, fetchCommonCodes, fetchPostDetail, updatePost } from '../api/client';
import { CATEGORY_CODE_OPTIONS, ADMIN_ONLY_CATEGORY_CODE } from '../constants/categoryCode';
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
export default function BoardWritePage() {
  const { postId } = useParams<{ postId: string }>();
  const isEditMode = Boolean(postId);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState(CATEGORY_CODE_OPTIONS);
  const [categoryCode, setCategoryCode] = useState('');
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [deleteAttachmentIds, setDeleteAttachmentIds] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // 2026-07-26: StrictMode 이중 실행 방지(BoardListPage와 동일 패턴)
  const commonCodesLoadedRef = useRef(false);
  useEffect(() => {
    if (commonCodesLoadedRef.current) return;
    commonCodesLoadedRef.current = true;

    fetchCommonCodes('BCT')
        .then((codes) => {
          if (codes.length > 0) setCategoryOptions(codes.map((c) => ({ code: c.code, name: c.codeName })));
        })
        .catch((err) => console.error('공통코드(카테고리) 조회 실패, 로컬 기본값 사용', err));
  }, []);

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
          setExistingAttachments(detail.attachments);
        })
        .catch((err) => setLoadError(toDisplayErrorMessage(err, '게시글을 불러오지 못했습니다.')))
        .finally(() => setIsLoading(false));
  }, [isEditMode, postId]);

  // 공지사항 카테고리는 관리자만 선택 가능 - 비관리자가 실수로 관리자 전용 값을
  // 들고 있게 되는 경우(예: 권한이 바뀐 계정) 안전하게 첫 번째 선택 가능한 값으로 되돌림
  useEffect(() => {
    if (!isAdmin && categoryCode === ADMIN_ONLY_CATEGORY_CODE) {
      const fallback = categoryOptions.find((c) => c.code !== ADMIN_ONLY_CATEGORY_CODE);
      if (fallback) setCategoryCode(fallback.code);
    }
  }, [isAdmin, categoryCode, categoryOptions]);

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
              deleteAttachmentIds,
              files: newFiles,
            },
            setUploadProgress,
        );
        navigate(`/board/${postId}`);
      } else {
        const newPostId = await createPost(
            { title, content, notice: isAdmin && notice, categoryCode, files: newFiles },
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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">
        {isEditMode ? '게시글 수정' : '게시글 작성'}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900 p-6"
      >
        <div>
          <label htmlFor="category" className="mb-1 block text-sm text-slate-400">
            카테고리
          </label>
          <select
            id="category"
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            className="w-full max-w-xs rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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

        <div>
          <label htmlFor="title" className="mb-1 block text-sm text-slate-400">
            제목
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">내용</label>
          <RichTextEditor value={content} onChange={setContent} />
        </div>

        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={notice}
              onChange={(e) => setNotice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            공지사항으로 상단 고정
          </label>
        )}

        {isEditMode && existingAttachments.length > 0 && (
          <div>
            <p className="mb-1 text-sm text-slate-400">기존 첨부파일 (체크하면 삭제됨)</p>
            <ul className="space-y-1">
              {existingAttachments.map((attachment) => (
                <li key={attachment.attachmentId} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={deleteAttachmentIds.includes(attachment.attachmentId)}
                    onChange={() => toggleDeleteAttachment(attachment.attachmentId)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                  />
                  <span className={deleteAttachmentIds.includes(attachment.attachmentId) ? 'line-through text-slate-600' : ''}>
                    {attachment.originalName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-slate-400">
            {isEditMode ? '새 첨부파일 추가' : '첨부파일'}
          </label>
          <FileDropzone files={newFiles} onChange={setNewFiles} uploadProgress={isSubmitting ? uploadProgress : null} />
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-red-400">
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
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
