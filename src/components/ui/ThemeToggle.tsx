import type { ReactElement } from 'react';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';

// 2026-08-04 추가 (다크모드/라이트모드)
//
// 2026-08-12 변경: 버튼 하나를 눌러 시스템 → 라이트 → 다크로 순환하는 방식이었는데,
// 원하는 테마로 가려면 최대 세 번을 눌러야 했고(중간 상태가 잠깐씩 적용돼 화면이
// 두 번 깜빡였다) 지금 무엇이 선택돼 있는지도 아이콘 하나로만 알 수 있었다.
// 세 가지를 나란히 두고 바로 고르는 세그먼티드 컨트롤로 바꾼다 - 한 번 누르면
// 원하는 값이고, 선택된 항목이 눈에 보인다.
//
// 아이콘 라이브러리가 프로젝트에 없어서(package.json 확인함) 새 의존성을 추가하는
// 대신 최소한의 인라인 SVG로 직접 그림.
const ICONS: Record<ThemeMode, ReactElement> = {
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        strokeLinecap="round"
      />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" strokeLinejoin="round" />
    </svg>
  ),
};

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '시스템 설정' },
  { mode: 'light', label: '라이트 모드' },
  { mode: 'dark', label: '다크 모드' },
];

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    // radiogroup: 세 개 중 하나만 켜지는 관계를 보조기기에 알린다. 버튼 세 개를
    // 그냥 두면 스크린리더가 서로 무관한 동작 세 개로 읽는다.
    <div
      role="radiogroup"
      aria-label="화면 테마"
      className={`flex items-center gap-0.5 rounded border border-slate-300 p-0.5 dark:border-slate-700 ${className}`}
    >
      {OPTIONS.map((option) => {
        const isSelected = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={isSelected}
            title={option.label}
            aria-label={option.label}
            onClick={() => setMode(option.mode)}
            className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {ICONS[option.mode]}
          </button>
        );
      })}
    </div>
  );
}
