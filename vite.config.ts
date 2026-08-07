import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    // 2026-08-06 추가: CCTV 관제 대시보드를 iframe에서 React로 옮기면서 원본
    // styles.css를 CSS Module(*.module.css)로 들여왔다. 클래스명이 전부 kebab-case라
    // 그대로 두면 styles['metric-card'] 같은 대괄호 접근이 화면 전체에 깔린다.
    // camelCaseOnly로 styles.metricCard 형태만 노출시킨다.
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
