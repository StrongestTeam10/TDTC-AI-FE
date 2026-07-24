import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { deletePost, downloadAttachment, fetchCommonCodes, fetchPostDetail, togglePostLike } from '../api/client';
import { CATEGORY_CODE_OPTIONS } from '../constants/categoryCode';
import type { PostDetail } from '../types/board';
import { toDisplayErrorMessage } from '../utils/errorMessage';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function categoryLabel(options: { code: string; name: string }[], code: string) {
  return options.find((o) => o.code === code)?.name ?? code;
}

export default function BoardDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [categoryOptions, setCategoryOptions] = useState(CATEGORY_CODE_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchCommonCodes('BCT')
        .then((codes) => {
          if (codes.length > 0) setCategoryOptions(codes.map((c) => ({ code: c.code, name: c.codeName })));
        })
        .catch((err) => console.error('공통코드(카테고리) 조회 실패, 로컬 기본값 사용', err));
  }, []);

  const load = useCallback(() => {
    if (!postId) return;
    setIsLoading(true);
    setLoadError('');
    fetchPostDetail(Number(postId))
        .then(setPost)
        .catch((err) => setLoadError(toDisplayErrorMessage(err, '게시글을 불러오지 못했습니다.')))
        .finally(() => setIsLoading(false));
  }, [postId]);

  // 2026-07-25 버그 수정: GET /api/posts/{id}는 호출될 때마다 서버 조회수를 1 증가시키는데,
  // React 18/19 StrictMode(main.tsx)가 개발 모드에서 마운트 시 useEffect를 의도적으로
  // 두 번 실행하면서(버그 조기 발견 목적) 조회수가 한 번에 2씩 올라가는 문제가 있었음.
  // postId별로 "이미 조회수 반영용 조회를 했는지"를 ref로 기억해서, 같은 postId에 대해
  // StrictMode가 effect를 다시 실행해도 fetchPostDetail을 중복 호출하지 않도록 막음.
  const viewCountedPostIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!postId || viewCountedPostIdRef.current === postId) return;
    viewCountedPostIdRef.current = postId;
    load();
  }, [postId, load]);

  const handleLike = async () => {
    if (!postId) return;
    setActionError('');
    try {
      // 2026-07-25 버그 수정: 좋아요 토글 후 load()로 상세를 다시 조회하면 그때마다
      // 조회수가 또 올라가는 부작용이 있었음(좋아요만 눌렀는데 조회수가 같이 오름).
      // 조회수를 건드리지 않도록, 서버 응답(liked)만으로 로컬 상태를 직접 갱신함.
      const { liked } = await togglePostLike(Number(postId));
      setPost((prev) =>
          prev ? { ...prev, liked, likeCount: prev.likeCount + (liked ? 1 : -1) } : prev,
      );
    } catch (err) {
      setActionError(toDisplayErrorMessage(err, '좋아요 처리에 실패했습니다.'));
    }
  };

  const handleDelete = async () => {
    if (!postId) return;
    if (!window.confirm('이 게시글을 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await deletePost(Number(postId));
      navigate('/board');
    } catch (err) {
      setActionError(toDisplayErrorMessage(err, '게시글 삭제에 실패했습니다.'));
      setIsDeleting(false);
    }
  };

  const handleDownload = async (attachmentId: number, originalName: string) => {
    if (!postId) return;
    setActionError('');
    try {
      await downloadAttachment(Number(postId), attachmentId, originalName);
    } catch (err) {
      setActionError(toDisplayErrorMessage(err, '파일 다운로드에 실패했습니다.'));
    }
  };

  if (isLoading) return <Spinner label="게시글을 불러오는 중..." />;
  if (loadError) return <ErrorBanner message={loadError} onRetry={load} />;
  if (!post) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              {post.notice && (
                <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                  공지
                </span>
              )}
              <span className="inline-block rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                {categoryLabel(categoryOptions, post.categoryCode)}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-slate-100">{post.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {post.writerName} · {formatDate(post.createdAt)}
              {post.updatedAt && ` (수정됨 ${formatDate(post.updatedAt)})`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm text-slate-400">
            <span>조회 {post.viewCount}</span>
            <span>좋아요 {post.likeCount}</span>
            {(post.canEdit || post.canDelete) && (
              <span className="flex gap-2 border-l border-slate-800 pl-3">
                {post.canEdit && (
                  <button
                    type="button"
                    onClick={() => navigate(`/board/${post.postId}/edit`)}
                    className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    수정
                  </button>
                )}
                {post.canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </button>
                )}
              </span>
            )}
          </div>
        </div>

        {/* 2026-07-24: content는 RichTextEditor(Tiptap)가 만든 HTML 문자열이라, 저장된
            값을 그대로 신뢰하지 않고 DOMPurify로 sanitize한 뒤에만 렌더링함(저장형 XSS 방지) */}
        <div
          className="prose prose-invert prose-sm max-w-none text-slate-200"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }}
        />

        {post.attachments.length > 0 && (
          <div className="mt-6 border-t border-slate-800 pt-4">
            <p className="mb-2 text-sm text-slate-400">첨부파일</p>
            <ul className="space-y-1">
              {post.attachments.map((attachment) => (
                <li key={attachment.attachmentId}>
                  <button
                    type="button"
                    onClick={() => handleDownload(attachment.attachmentId, attachment.originalName)}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    📎 {attachment.originalName}{' '}
                    <span className="text-slate-500">({formatFileSize(attachment.fileSize)})</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionError && (
          <div className="mt-4">
            <ErrorBanner message={actionError} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLike}
            className={`rounded border px-4 py-2 text-sm ${
              post.liked
                ? 'border-blue-600 bg-blue-600/20 text-blue-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {post.liked ? '좋아요 취소' : '좋아요'}
          </button>
        </div>

        <div className="mt-4 flex justify-center border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => navigate('/board')}
            className="rounded border border-slate-700 px-6 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← 목록
          </button>
        </div>
      </div>
    </div>
  );
}
