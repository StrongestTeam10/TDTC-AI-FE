import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { UserRole } from '../types/auth';

// 2026-07-24 추가
// 로그인하지 않은 사용자가 관제 화면에 바로 접근하지 못하도록 막는 라우트 가드.
// 로그인 후에는 원래 가려던 경로(from)로 돌려보냄.
//
// 2026-08-05 추가(회원관리): requireRole을 넘기면 로그인은 했지만 해당 권한이 아닌
// 사용자를 /dashboard로 돌려보냄. BE도 UserAdminService에서 동일하게 403 처리하므로
// 이건 어디까지나 화면단 안내용(직접 API를 두드리면 BE가 최종적으로 막아줌).
export default function RequireAuth({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: UserRole;
}) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (requireRole && user.rulesCode !== requireRole) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
