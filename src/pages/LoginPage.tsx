import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// 2026-07-24 추가 (1차)
// 행안부 가이드라인 - 로그인 영역 반영 (아이디/비밀번호 로그인 정보입력 패턴 기준).
//
// 범위를 좁힌 부분: 가이드라인의 간편인증/공동인증서/금융인증서/생체인증은
// 외부 인증기관 연동이 필요해서 이번 빅프로젝트 범위에서는 제외하고, 내부 관제 시스템에
// 맞는 아이디/비밀번호 로그인만 구현함. 로그인 방식 선택 화면도 이 사유로 생략함.
//
// 2026-07-24 (2차): BE 로그인 API가 생기면서 authStore의 mock 계정 로그인을 실제
// API 호출로 교체함. login()이 비동기(API 호출)라 handleSubmit도 async로 변경.
// mock 시절 있었던 "테스트 계정으로 채우기" 버튼은 이제 실제로 존재하는 계정이
// 아니면 로그인이 실패하므로 제거함 — 화면 전체를 확인할 관리자 계정이 필요하면
// /signup으로 가입한 뒤, BE에서 해당 계정의 rules_code를 ROL01(관리자)로 한 번
// 수동 변경해두는 걸 권장(BE README 참고 - 자가 가입은 기본적으로 ROL03 부여).
export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  // 2026-07-24 변경: 기본 랜딩 위치를 "/"(공개 랜딩페이지)가 아니라 "/dashboard"(관제
  // 대시보드)로 변경. RequireAuth를 거쳐 온 경우엔 원래 가려던 경로(from)로 이동함.
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/dashboard';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(loginId, password);
    setIsSubmitting(false);
    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="mb-1 text-sm text-slate-500">KT Aivle School B2G 빅프로젝트</p>
          <h1 className="text-xl font-semibold text-slate-100">전통시장 안전탐지 디지털 트윈</h1>
          <p className="mt-2 text-sm text-slate-500">관제 시스템 로그인이 필요합니다.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900 p-6"
        >
          <div>
            <label htmlFor="loginId" className="mb-1 block text-sm text-slate-400">
              아이디
            </label>
            <input
              id="loginId"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-400">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-300"
        >
          계정이 없으신가요? 회원가입
        </button>
      </div>
    </div>
  );
}
