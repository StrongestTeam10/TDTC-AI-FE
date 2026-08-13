import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// 2026-08-12 추가 (UIUX 피드백)
//
// 설정 화면의 설명문이 항상 펼쳐져 있어서, 실제 입력 칸보다 안내 문구가 더 긴
// 상태였다. 설명을 제목 옆 ⓘ 안으로 접어 넣고 필요할 때만 꺼내 본다.
//
// 동작(요청한 그대로):
//   - 마우스를 올리면 뜨고, 벗어나면 사라진다.
//   - 클릭하면 고정된다(커서를 치워도 남는다).
//   - 고정된 상태에서 다시 클릭하면 사라진다. 이때 커서가 아직 아이콘 위에 있어도
//     다시 뜨지 않는다 - 그러면 클릭이 아무 일도 안 한 것처럼 보이기 때문이다.
//     커서가 한 번 벗어나면 hover 동작이 되살아난다.
//
// 왜 position:fixed인가: 이 아이콘이 놓이는 좌측 설정 패널은 폭 350px에
// overflow-hidden이 걸려 있다. 말풍선을 absolute로 띄우면 패널 경계에서 잘린다.
// 화면 좌표계에 직접 띄우고, 열릴 때마다 아이콘 위치를 재서 붙인다.

interface InfoTooltipProps {
  /** 보조기기에 읽히는 이름. 예: "총 유입 인원 설명" */
  label: string;
  /** 말풍선 안에 들어갈 내용 */
  children: ReactNode;
  className?: string;
}

const BUBBLE_WIDTH = 260;
const GAP = 8;
const VIEWPORT_MARGIN = 8;

export default function InfoTooltip({ label, children, className = '' }: InfoTooltipProps) {
  const [isPinned, setPinned] = useState(false);
  const [isHovering, setHovering] = useState(false);
  // 클릭으로 닫은 직후 커서가 아직 아이콘 위에 있는 동안 hover를 무시한다.
  const [isHoverSuppressed, setHoverSuppressed] = useState(false);

  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const isOpen = isPinned || (isHovering && !isHoverSuppressed);

  // 아이콘의 화면상 위치를 재서 말풍선을 바로 아래에 붙인다. 오른쪽/아래로 넘치면
  // 화면 안으로 밀어 넣는다(좁은 패널 안이라 오른쪽으로 넘치는 일이 잦다).
  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();

      let left = rect.left;
      const maxLeft = window.innerWidth - BUBBLE_WIDTH - VIEWPORT_MARGIN;
      if (left > maxLeft) left = Math.max(VIEWPORT_MARGIN, maxLeft);

      let top = rect.bottom + GAP;
      const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;
      // 아래로 넘치면 아이콘 위쪽으로 뒤집는다.
      if (bubbleHeight > 0 && top + bubbleHeight > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, rect.top - GAP - bubbleHeight);
      }

      setPosition({ top, left });
    };

    place();
    // 고정해둔 채로 스크롤하면 말풍선만 제자리에 남아 엉뚱한 곳을 가리킨다.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [isOpen, children]);

  // 고정된 말풍선은 바깥을 누르거나 Esc로 닫는다. 고정 상태가 아닐 때는 등록하지 않는다.
  useEffect(() => {
    if (!isPinned) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return; // 아이콘 클릭은 아래 onClick이 처리
      if (bubbleRef.current?.contains(target)) return; // 말풍선 안 클릭(드래그 선택 등)은 유지
      setPinned(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(false);
      setHovering(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinned]);

  const handleClick = () => {
    if (isPinned) {
      setPinned(false);
      setHoverSuppressed(true);
    } else {
      setPinned(true);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => {
          setHovering(false);
          setHoverSuppressed(false);
        }}
        // 키보드로 탭 이동해도 같은 내용을 볼 수 있어야 한다.
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-colors ${
          isOpen
            ? 'border-blue-500 bg-blue-500 text-white'
            : 'border-slate-400 text-slate-500 hover:border-blue-500 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400 dark:hover:text-blue-400'
        } ${className}`}
      >
        i
      </button>

      {isOpen && position && (
        <div
          ref={bubbleRef}
          role="tooltip"
          style={{ top: position.top, left: position.left, width: BUBBLE_WIDTH }}
          className="fixed z-50 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed font-normal text-slate-600 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {children}
        </div>
      )}
    </>
  );
}
