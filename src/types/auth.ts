// 2026-07-24 추가
// BE usrusrs01m(사용자) 테이블과 필드 개념을 맞춰둠: loginId=login_id, rulesCode=rules_code, orgCode=org_code
// 지금은 rulesCode를 'ADMIN' | 'VIEWER' 2단계로만 씀. BE의 rules_code(VARCHAR(5)) 코드 체계가
// 정해지면 그 코드값에 맞춰 이 유니언 타입만 넓히면 됨.
export type UserRole = 'ADMIN' | 'VIEWER';

export interface AuthUser {
  loginId: string;
  name: string;
  rulesCode: UserRole;
  orgCode: string;
}
