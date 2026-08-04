import type { ReactElement } from 'react';
import { useThemeStore } from '../../store/themeStore';

// 2026-08-04 추가 (다크모드/라이트모드)
//
// 클릭할 때마다 시스템 설정 → 라이트 → 다크 → 시스템 설정 순으로 순환. 아이콘
// 라이브러리가 프로젝트에 없어서(package.json 확인함) 새 의존성을 추가하는 대신
// 최소한의 인라인 SVG로 직접 그림.
const ICONS: Record<string, ReactElement> = {
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

const LABELS: Record<string, string> = {
  system: '시스템 설정',
  light: '라이트 모드',
  dark: '다크 모드',
};

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);

  return (
    <button
      type="button"
      onClick={cycleMode}
      title={`${LABELS[mode]} (클릭하여 전환)`}
      aria-label={`현재 ${LABELS[mode]}. 클릭하면 다음 테마로 전환됩니다.`}
      className={`flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 ${className}`}
    >
      {ICONS[mode]}
    </button>
  );
}
