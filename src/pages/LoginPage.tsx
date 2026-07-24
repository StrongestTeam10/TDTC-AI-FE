import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// 2026-07-24 추가
// 행안부 가이드라인 - 로그인 영역 반영 (아이디/비밀번호 로그인 정보입력 패턴 기준).
//
// 범위를 좁힌 부분: 가이드라인의 간편인증/공동인증서/금융인증서/생체인증은
// 외부 인증기관 연동이 필요해서 이번 캡스톤 범위에서는 제외하고, 내부 관제 시스템에
// 맞는 아이디/비밀번호 로그인만 구현함. 로그인 방식 선택 화면도 이 사유로 생략함.
//
// BE 로그인 API가 아직 없어서 authStore의 mock 계정으로 로그인함. 심사/데모에서
// 전체 화면을 확인할 수 있도록 "전체 관리자로 채우기" 테스트 버튼을 제공함.
export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  // 2026-07-24 변경: 기본 랜딩 위치를 "/"(공개 랜딩페이지)가 아니라 "/dashboard"(관제
  // 대시보드)로 변경. RequireAuth를 거쳐 온 경우엔 원래 가려던 경로(from)로 이동함.
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/dashboard';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = login(loginId, password);
    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.message);
    }
  };

  const fillTestAccount = (id: string, pw: string) => {
    setLoginId(id);
    setPassword(pw);
    setError('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
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
            className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-500"
          >
            로그인
          </button>
        </form>

        <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500">
          <p className="mb-2">테스트 계정 (BE 인증 연동 전까지 전체 화면 확인용 임시 계정)</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fillTestAccount('admin', 'admin1234')}
              className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              전체 관리자로 채우기
            </button>
            <button
              type="button"
              onClick={() => fillTestAccount('viewer', 'viewer1234')}
              className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              뷰어로 채우기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
