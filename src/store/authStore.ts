import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../types/auth';

// 2026-07-24 추가
// BE에 로그인 API(usrusrs01m 기반)가 아직 없어서, FE 단독으로 동작하는 임시 mock 계정.
// 빅프로젝트 심사/데모에서 모든 화면을 확인할 수 있도록 ADMIN 테스트 계정을 포함함.
// 나중에 BE 로그인 API가 생기면 이 배열은 지우고 login()의 구현부만
// axios POST 호출로 교체하면 됨 (AuthUser 형태는 그대로 유지하면 나머지 코드는 안 바꿔도 됨).
interface MockAccount extends AuthUser {
  password: string;
}

const MOCK_ACCOUNTS: MockAccount[] = [
  {
    loginId: 'admin',
    password: 'admin1234',
    name: '전체 관리자(테스트)',
    rulesCode: 'ADMIN',
    orgCode: 'KT01',
  },
  {
    loginId: 'viewer',
    password: 'viewer1234',
    name: '뷰어(테스트)',
    rulesCode: 'VIEWER',
    orgCode: 'KT01',
  },
];

type LoginResult = { ok: true } | { ok: false; message: string };

interface AuthStore {
  user: AuthUser | null;
  login: (loginId: string, password: string) => LoginResult;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      login: (loginId, password) => {
        const found = MOCK_ACCOUNTS.find((a) => a.loginId === loginId);
        if (!found) {
          return { ok: false, message: '등록되지 않은 아이디입니다.' };
        }
        if (found.password !== password) {
          return { ok: false, message: '비밀번호가 올바르지 않습니다.' };
        }
        const { password: _pw, ...user } = found;
        set({ user });
        return { ok: true };
      },
      logout: () => set({ user: null }),
    }),
    { name: 'tdtc-ai-auth' },
  ),
);
