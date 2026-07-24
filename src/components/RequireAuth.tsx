import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// 2026-07-24 추가
// 로그인하지 않은 사용자가 관제 화면에 바로 접근하지 못하도록 막는 라우트 가드.
// 로그인 후에는 원래 가려던 경로(from)로 돌려보냄.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
