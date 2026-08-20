import { useEffect, useRef, type RefObject } from 'react';

// 2026-08-20 추가 (접근성): 모달 공용 키보드·초점 처리.
//
// 모달이 셋(LegalDocModal · TermsModal · CctvZonePopupModal) 있었는데 각자 다른 만큼만
// 갖추고 있었다. LegalDocModal 만 Escape 가 있었고, 초점 트랩은 셋 다 없어서 Tab 을
// 계속 누르면 모달 뒤의 헤더·본문으로 빠져나갔다(WCAG 2.1.2 초점 이동 제한 없음 위반이
// 아니라 그 반대 - 모달인데 안 갇혀서 "지금 어디 있는지" 를 잃는 문제. 2.4.3 초점 순서).
// 회원가입 필수 동의인 TermsModal 은 Escape 가 없어 키보드로는 닫기 버튼까지 Tab 해야만
// 나갈 수 있었다.
//
// 한 곳에서 전부 처리한다:
//  1. Escape → onClose
//  2. 열릴 때 대화상자(또는 지정 요소)로 초점 이동, 닫힐 때 열기 전 요소로 복원
//  3. Tab / Shift+Tab 이 대화상자 밖으로 못 나가게 순환 (초점 트랩)
//  4. 뒤쪽 본문 스크롤 잠금 (열기 전 overflow 값을 기억해 그대로 되돌림)
//
// 쓰는 쪽은 dialogRef 를 모달 루트(role="dialog" 요소)에 달고 tabIndex={-1} 을 준다.
// 배경 클릭으로 닫는 건 각 컴포넌트가 마우스 편의로 따로 유지해도 된다 - 키보드 경로는
// 이 훅의 Escape 와 닫기 버튼이 보장한다.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Options {
  /** 열릴 때 초점을 줄 요소. 없으면 dialogRef 자체. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 뒤쪽 본문 스크롤을 잠글지. 기본 true. */
  lockScroll?: boolean;
}

export function useModalDismiss(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  { initialFocusRef, lockScroll = true }: Options = {},
) {
  // onClose 가 렌더마다 새 함수여도 리스너를 다시 달지 않게 ref 로 받는다.
  // (LegalDocModal 은 deps 에 onClose 를 넣어 부모가 인라인 함수를 주면 매 렌더 재등록됐다)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // 2. 초점 이동 + 복원 준비
    const opener = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? dialog;
    // 마운트 직후에는 자식 렌더가 끝나 있으므로 바로 focus 해도 된다.
    target.focus({ preventScroll: true });

    // 4. 스크롤 잠금
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      // 3. Tab 순환
      if (e.key !== 'Tab') return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null); // 숨겨진 요소 제외
      if (focusables.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        // 첫 요소(또는 대화상자 자체)에서 Shift+Tab → 마지막으로
        if (active === first || active === dialog || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        // 마지막 요소에서 Tab → 첫 요소로
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      // 열기 전 요소가 아직 문서에 있을 때만 되돌린다(없어졌으면 초점을 강제하지 않는다)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // dialogRef / initialFocusRef 는 ref 객체라 안정적. lockScroll 은 열린 뒤 바뀌지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
