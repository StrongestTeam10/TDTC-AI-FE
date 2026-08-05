import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// 2026-08-04 추가 (회원가입 관리자 승인)
// RequireFacilityManager와 동일한 패턴 - 관리자(ROL01)가 아니면 대시보드로 돌려보냄.
// 실제 데이터 접근 차단은 BE UserApprovalService가 매번 재검증함.
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
