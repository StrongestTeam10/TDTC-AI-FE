// 2026-07-24 추가
// 통상적으로 쓰이는 비밀번호 정책: 최소 8자 이상 + 영문 대문자/소문자/숫자/특수문자
// 4종류를 모두 포함. 회원가입 화면에서 실시간 체크리스트로도 보여주고, 제출 시
// 최종 검증에도 사용함.
export interface PasswordRule {
  key: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: '8자 이상', test: (pw) => pw.length >= 8 },
  { key: 'upper', label: '영문 대문자 포함', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lower', label: '영문 소문자 포함', test: (pw) => /[a-z]/.test(pw) },
  { key: 'number', label: '숫자 포함', test: (pw) => /\d/.test(pw) },
  { key: 'special', label: '특수문자 포함 (!@#$%^&* 등)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
