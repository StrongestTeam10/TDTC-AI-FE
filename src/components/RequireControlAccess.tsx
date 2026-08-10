import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { canAccessControlSystem, homePathFor } from '../auth/permissions';

// 2026-08-06 추가 (관제 대시보드 · 시뮬레이션 비교 · 시나리오 이력)
//
// RequireAuth(로그인 여부)와 별개로, 관제 화면 세 곳은 관리자(ROL01)와 관제요원(ROL02)만
// 들어올 수 있다. 조회자(ROL03, 상인회)는 헤더에서 메뉴 자체가 숨겨지지만 주소를
// 직접 입력하는 경우가 남아서 라우트에서도 막는다.
//
// RequireAuth의 requireRole은 단일 권한만 받아 두 권한을 함께 허용할 수 없어
// RequireFacilityManager와 같은 방식으로 별도 가드를 뒀다. 실제 데이터 접근 차단은
// BE SecurityConfig(/api/dashboard/** 와 /api/simulation/** 은 ROL01·ROL02만)가
// 매번 재검증한다.
export default function RequireControlAccess({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);

  if (!canAccessControlSystem(user)) {
    // /dashboard로 보내면 안 된다 - 이 가드가 지키는 화면이라 되돌아와 왕복이 된다.
    return <Navigate to={homePathFor(user)} replace />;
  }
  return <>{children}</>;
}
