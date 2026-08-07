import { useEffect, type ReactNode } from 'react';

// 2026-08-07 신규: 푸터의 "개인정보처리방침" / "이용약관" 전문을 띄우는 보기 전용 팝업.
//
// components/TermsModal.tsx와 비슷해 보이지만 용도가 다르다. 그쪽은 회원가입의 동의
// 절차용이라 "끝까지 스크롤해야 확인 버튼이 활성화"되고 onConfirm으로 체크박스를
// 켜준다. 이건 이미 가입한 사람이든 아니든 아무나 열어보는 열람용이라 동의 개념이
// 없고, 표가 들어간 긴 문서라 폭도 더 넓다.

interface LegalDocModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export default function LegalDocModal({ title, children, onClose }: LegalDocModalProps) {
  // 열려 있는 동안 Esc로 닫고, 뒤쪽 본문이 같이 스크롤되지 않게 막는다.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
      <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={onClose}
      >
        <div
            className="flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
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

          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

          <div className="flex justify-end border-t border-slate-200 dark:border-slate-800 px-5 py-4">
            <button
                type="button"
                onClick={onClose}
                className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
  );
}
