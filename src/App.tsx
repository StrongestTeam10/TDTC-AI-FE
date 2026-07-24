import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import ScenarioPage from './pages/ScenarioPage';
import PredictionPage from './pages/PredictionPage';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import AppLayout from './components/layout/AppLayout';
import RequireAuth from './components/RequireAuth';

// 2026-07-24 변경
// "/" 를 비로그인도 볼 수 있는 공개 랜딩페이지로 바꾸고, 기존 "/"에 있던 관제
// 대시보드는 "/dashboard"로 옮김(로그인 필요). 랜딩페이지를 제외한 모든 화면은
// RequireAuth로 감싸서 비로그인 접근 시 /login으로 리다이렉트됨.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout>
              <LandingPage />
            </AppLayout>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/scenario"
          element={
            <RequireAuth>
              <AppLayout>
                <ScenarioPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/prediction"
          element={
            <RequireAuth>
              <AppLayout>
                <PredictionPage />
              </AppLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
