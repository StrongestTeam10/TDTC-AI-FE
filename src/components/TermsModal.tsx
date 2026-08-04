import { useRef, useState, type ReactNode } from 'react';

// 2026-07-24 추가
// 회원가입의 필수 동의 항목(서비스 이용약관/개인정보 수집·이용)을 체크박스로
// 바로 켤 수 없게 하고, 이 팝업으로 전문을 보여준 뒤 "끝까지 스크롤해야 확인 버튼이
// 눌리게" 만든 컴포넌트. 확인을 눌러야만 회원가입 화면 쪽 체크박스가 켜짐.
interface TermsModalProps {
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

// 스크롤 맨 아래로 인정하는 여유값(px). 폰트/줄바꿈 반올림 오차를 흡수하기 위함.
const BOTTOM_THRESHOLD_PX = 8;

export default function TermsModal({ title, children, onConfirm, onClose }: TermsModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // 내용이 스크롤할 필요가 없을 만큼 짧은 경우(초기 렌더 시 이미 다 보이는 경우)까지
  // 대비해서, 마운트 직후 한 번 스크롤 가능 여부를 확인해 초기값을 정함.
  const [reachedBottom, setReachedBottom] = useState(false);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_THRESHOLD_PX;
    if (atBottom) setReachedBottom(true);
  };

  const handleBodyRef = (el: HTMLDivElement | null) => {
    bodyRef.current = el;
    if (el && el.scrollHeight <= el.clientHeight) {
      // 내용이 짧아 스크롤 자체가 필요 없는 경우 바로 확인 가능하게 처리
      setReachedBottom(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <div
          ref={handleBodyRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400"
        >
          {children}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 dark:text-slate-600">
            {reachedBottom ? '내용을 모두 확인했습니다.' : '끝까지 읽으면 확인 버튼이 활성화됩니다.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!reachedBottom}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500"
            >
              확인하고 동의
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
