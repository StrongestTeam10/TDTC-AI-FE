// 2026-07-24 추가 (SIGNUP-01)
// BE usrusrs01m(사용자) 테이블과 필드 개념을 맞춰둠: loginId=login_id, rulesCode=rules_code, orgCode=org_code

// 2026-07-24 (2차): 처음엔 FE 편의상 'ADMIN' | 'VIEWER' 2단계로 단순화해뒀었는데,
// 실제 BE 회원가입/로그인 API를 연동하면서 comcode01m 기준 실제 권한 코드
// (ROL01=관리자, ROL02=관제요원, ROL03=조회자)로 통일함.
export type UserRole = 'ROL01' | 'ROL02' | 'ROL03';

export const ROLE_LABELS: Record<UserRole, string> = {
  ROL01: '관리자',
  ROL02: '관제요원',
  ROL03: '조회자',
};

export interface AuthUser {
  userId: number;
  loginId: string;
  name: string;
  rulesCode: UserRole;
  orgCode: string;
  // 2026-07-24 추가(게시판): 담당 시장 코드. 관리자는 시장 제한이 없어 없을 수도 있음(optional).
  marketCode?: string;
}
