import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import SimulationComparePage from './pages/SimulationComparePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import LandingPage from './pages/LandingPage';
import NotFoundPage from './pages/NotFoundPage';
import BoardListPage from './pages/BoardListPage';
import BoardDetailPage from './pages/BoardDetailPage';
import BoardWritePage from './pages/BoardWritePage';
import FacilityManagePage from './pages/FacilityManagePage';
import UserAdminPage from './pages/UserAdminPage';
import AppLayout from './components/layout/AppLayout';
import RequireAuth from './components/RequireAuth';
import RequireFacilityManager from './components/RequireFacilityManager';
import { useAuthStore } from './store/authStore';
import { fetchMe } from './api/client';

// 2026-07-24 변경
// "/" 를 비로그인도 볼 수 있는 공개 랜딩페이지로 바꾸고, 기존 "/"에 있던 관제
// 대시보드는 "/dashboard"로 옮김(로그인 필요). 랜딩페이지를 제외한 모든 화면은
// RequireAuth로 감싸서 비로그인 접근 시 /login으로 리다이렉트됨.
export default function App() {
  // 2026-07-26 버그 수정: 로그인 상태(zustand persist -> localStorage)는 새로고침/서버
  // 재시작과 무관하게 그대로 복원되는데, 지금까지는 저장된 토큰이 실제로 아직 유효한지
  // 서버에 확인하는 절차가 전혀 없었음. RequireAuth는 클라이언트에 저장된 user 값만 보고
  // 통과시키므로, 토큰이 만료(기본 1시간)돼도 마침 인증이 필요한 API를 호출하는 화면으로
  // 이동하기 전까진 "로그인된 것처럼" 계속 보이는 문제가 있었음(서버
  // 재시작 후에도 1시간 넘게 로그인 유지 현상의 실제 원인 - 서버 재시작 자체와는
  // 무관하고, 부팅 시 토큰을 검증하지 않는 게 문제였음). 앱을 처음 띄울 때 저장된 토큰이
  // 있으면 /api/auth/me로 서버에 한 번 확인하고, 만료/위조된 토큰이면 기존 401 처리
  // 로직(api/client.ts 응답 인터셉터 -> authStore.logout())이 자동으로 로그아웃 처리하게 함.
  const token = useAuthStore((s) => s.token);
  const meCheckedRef = useRef(false);
  useEffect(() => {
    if (!token || meCheckedRef.current) return;
    meCheckedRef.current = true;
    fetchMe().catch(() => {
      // 401이면 api/client.ts 응답 인터셉터가 이미 로그아웃 처리를 해줌 - 추가 처리 불필요
    });
  }, [token]);

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
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
          path="/compare"
          element={
            <RequireAuth>
              <AppLayout>
                <SimulationComparePage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/facilities"
          element={
            <RequireAuth>
              <RequireFacilityManager>
                <AppLayout>
                  <FacilityManagePage />
                </AppLayout>
              </RequireFacilityManager>
            </RequireAuth>
          }
        />
        <Route
          path="/board"
          element={
            <RequireAuth>
              <AppLayout>
                <BoardListPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/board/write"
          element={
            <RequireAuth>
              <AppLayout>
                <BoardWritePage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/board/:postId"
          element={
            <RequireAuth>
              <AppLayout>
                <BoardDetailPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/board/:postId/edit"
          element={
            <RequireAuth>
              <AppLayout>
                <BoardWritePage />
              </AppLayout>
            </RequireAuth>
          }
        />
        {/* 2026-08-05 추가 (회원관리) - 관리자(ROL01) 전용, requireRole로 그 외 권한은 /dashboard로 리다이렉트.
            2026-08-05(2차): 회원 승인은 별도 화면 대신 이 페이지의 "회원 승인" 탭으로 통합됨 - /admin/approvals 라우트 제거 */}
        <Route
          path="/admin/users"
          element={
            <RequireAuth requireRole="ROL01">
              <AppLayout>
                <UserAdminPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="*"
          element={
            <AppLayout>
              <NotFoundPage />
            </AppLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
