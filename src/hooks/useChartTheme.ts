import { useThemeStore } from '../store/themeStore';

// 2026-08-10 추가 (라이트모드)
//
// recharts는 축/격자/툴팁 색을 CSS 클래스가 아니라 prop(문자열 색)으로 받아서,
// Tailwind의 dark: variant가 통하지 않는다. 차트마다 따로 분기하면 색이 금방
// 어긋나므로 테마별 색을 여기 한 군데로 모았다.
//
// resolvedTheme은 themeStore가 'system'까지 풀어낸 실제 적용 테마라, OS 설정을
// 따르는 상태에서 OS를 바꿔도 차트 색이 같이 따라온다.
export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipContentStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}

export function useChartTheme(): ChartTheme {
  const isDark = useThemeStore((s) => s.resolvedTheme) === 'dark';

  return {
    grid: isDark ? '#334155' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',
    tooltipContentStyle: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
      borderRadius: 8,
      fontSize: 12,
      color: isDark ? '#e2e8f0' : '#0f172a',
    },
    tooltipLabelStyle: { color: isDark ? '#e2e8f0' : '#0f172a' },
  };
}
