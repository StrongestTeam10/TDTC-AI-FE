import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { homePathFor } from '../auth/permissions';

// 2026-08-04 추가 (상점 위치 등록 화면)
//
// RequireAuth(로그인 여부)와 별개로, 이 화면은 관리자(ROL01) 또는 상인회(ORGMA)만
// 들어올 수 있음. 다른 역할이 주소를 직접 입력해 들어오는 경우를 대비한 FE 가드 -
// 실제 데이터 접근 차단은 BE FacilityService/FacilityPhotoService가 매번 재검증함.
export default function RequireFacilityManager({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const canManage = user?.rulesCode === 'ROL01' || user?.orgCode === 'ORGMA';

  if (!canManage) {
    // 2026-08-06: /dashboard 고정에서 권한별 기본 화면으로 바꿈(RequireAuth와 같은 이유).
    return <Navigate to={homePathFor(user)} replace />;
  }
  return <>{children}</>;
}
