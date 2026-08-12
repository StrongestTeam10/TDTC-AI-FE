import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 2026-08-04 추가 (다크모드/라이트모드)
//
// 기본은 OS 설정(prefers-color-scheme)을 따르되, 사용자가 수동으로 라이트/다크를
// 선택하면 그 이후로는 OS 설정 변경과 무관하게 선택한 테마를 유지함(선택값을
// localStorage에 저장). ThemeToggle이 'system' → 'light' → 'dark' → 'system' 순으로
// 순환시킴 - "system"으로 되돌리면 다시 OS 설정을 따르기 시작함.
//
// 실제 다크모드 적용은 <html> 태그에 'dark' 클래스를 붙이는 방식(Tailwind
// @custom-variant dark, index.css 참고). index.html의 인라인 스크립트가 React 마운트
// 전에 이미 한 번 적용해두므로, 여기서는 그 상태와 store 값을 동기화(onRehydrateStorage)
// 하고 이후 변경사항만 반영하면 됨.
//
// 2026-08-12: ThemeToggle이 순환 버튼에서 세 값을 직접 고르는 세그먼티드 컨트롤로
// 바뀌면서 cycleMode를 쓰는 곳이 없어져 제거함(setMode 하나면 충분).

export type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

function applyThemeClass(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeStore {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system',
      resolvedTheme: getSystemTheme(),

      setMode: (mode) => {
        const resolved = resolveTheme(mode);
        applyThemeClass(resolved);
        set({ mode, resolvedTheme: resolved });
      },
    }),
    {
      name: 'tdtc-ai-theme',
      onRehydrateStorage: () => (state) => {
        // localStorage에서 복원된 직후, index.html 인라인 스크립트가 이미 적용해둔
        // DOM 클래스와 store 상태를 다시 한 번 맞춰줌(SSR은 안 쓰지만 방어적으로)
        if (!state) return;
        const resolved = resolveTheme(state.mode);
        applyThemeClass(resolved);
        state.resolvedTheme = resolved;
      },
    }
  )
);

// mode가 'system'일 때는 OS 설정이 바뀌는 순간에도 실시간으로 반영
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (useThemeStore.getState().mode !== 'system') return;
    const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
    applyThemeClass(resolved);
    useThemeStore.setState({ resolvedTheme: resolved });
  });
}
