import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, UserRole } from '../types/auth';
import {
  login as loginRequest,
  signup as signupRequest,
  verifyIdentity as verifyIdentityRequest,
  resetPassword as resetPasswordRequest,
} from '../api/client';
import type { SignupRequest, VerifyIdentityRequest, ResetPasswordRequest } from '../api/client';
import { getToken, setToken, setUnauthorizedHandler } from '../auth/tokenStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-07-24 추가 (1차, SIGNUP-01)
// 로그인 상태 관리 zustand 스토어. 처음엔 BE 로그인 API가 없어서 FE 단독 mock
// 계정으로 동작했었음.
//
// 2026-07-24 (2차): BE에 실제 로그인/회원가입 API(JWT 발급)가 생기면서 mock 계정을
// 지우고 실제 API 호출로 교체함. 토큰은 auth/tokenStore.ts에 보관해서 api/client.ts의
// axios 인터셉터가 모든 요청에 Authorization 헤더로 자동 첨부하도록 함(순환 참조를
// 피하려고 tokenStore를 중간에 둠 - tokenStore.ts 주석 참고).

type LoginResult = { ok: true; message?: undefined } | { ok: false; message: string };
type SignupResult = { ok: true; message?: undefined } | { ok: false; message: string };
// 2026-08-04 추가 (비밀번호 찾기)
type VerifyIdentityResult = { ok: true; message?: undefined } | { ok: false; message: string };
type ResetPasswordResult = { ok: true; message?: undefined } | { ok: false; message: string };

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  login: (loginId: string, password: string) => Promise<LoginResult>;
  signup: (request: SignupRequest) => Promise<SignupResult>;
  verifyIdentity: (request: VerifyIdentityRequest) => Promise<VerifyIdentityResult>;
  resetPassword: (request: ResetPasswordRequest) => Promise<ResetPasswordResult>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,

      login: async (loginId, password) => {
        try {
          const response = await loginRequest({ loginId, password });
          setToken(response.accessToken);
          set({
            token: response.accessToken,
            user: {
              userId: response.user.userId,
              loginId: response.user.loginId,
              name: response.user.name,
              rulesCode: response.user.rulesCode as UserRole,
              orgCode: response.user.orgCode,
              marketCode: response.user.marketCode,
            },
          });
          return { ok: true };
        } catch (err) {
          return { ok: false, message: toDisplayErrorMessage(err, '로그인에 실패했습니다.') };
        }
      },

      signup: async (request) => {
        try {
          await signupRequest(request);
          return { ok: true };
        } catch (err) {
          return { ok: false, message: toDisplayErrorMessage(err, '회원가입에 실패했습니다.') };
        }
      },

      // 2026-08-04 추가 (비밀번호 찾기)
      // 인증 상태와 무관한 흐름이라 토큰/user를 건드리지 않음. 성공/실패만 페이지에 알려줌.
      verifyIdentity: async (request) => {
        try {
          const response = await verifyIdentityRequest(request);
          if (!response.verified) {
            return { ok: false, message: '입력하신 정보와 일치하는 계정을 찾을 수 없습니다.' };
          }
          return { ok: true };
        } catch (err) {
          return { ok: false, message: toDisplayErrorMessage(err, '본인확인에 실패했습니다.') };
        }
      },

      resetPassword: async (request) => {
        try {
          await resetPasswordRequest(request);
          return { ok: true };
        } catch (err) {
          return { ok: false, message: toDisplayErrorMessage(err, '비밀번호 재설정에 실패했습니다.') };
        }
      },

      logout: () => {
        setToken(null);
        set({ user: null, token: null });
      },
    }),
    {
      name: 'tdtc-ai-auth',
      // 2026-07-24: 새로고침 후 zustand가 저장된 값을 복원하면, 그 안의 토큰을
      // tokenStore(axios 인터셉터가 읽는 곳)에도 다시 심어줘야 API 호출이 계속 인증됨.
      onRehydrateStorage: () => (state) => {
        if (state?.token) setToken(state.token);
      },
    },
  ),
);

// 2026-07-24 추가: API가 401(토큰 만료/위조)을 응답하면 로그인 상태를 정리함.
// RequireAuth가 user 상태를 구독하고 있어서, 이것만으로 자동으로 /login까지 이동됨.
setUnauthorizedHandler(() => {
  const currentToken = getToken();
  if (currentToken) {
    useAuthStore.getState().logout();
  }
});
