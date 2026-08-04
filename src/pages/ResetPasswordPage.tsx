import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PASSWORD_RULES, isPasswordValid } from '../utils/password';
import { useAuthStore } from '../store/authStore';
import ThemeToggle from '../components/ui/ThemeToggle';

// 2026-08-04 추가 (비밀번호 찾기 2/2 - 재설정)
//
// ForgotPasswordPage에서 본인확인에 성공해야만 접근 가능. 직접 URL로 들어오는 등
// state가 없는 경우엔 본인확인을 다시 하도록 /forgot-password로 돌려보냄(이 화면
// 자체가 인증 없이 비밀번호를 바꾸는 민감한 동작이라, "본인확인을 통과한 상태"라는
// 근거 없이는 진입시키지 않음).
//
// 실제 재설정 API 호출 시에는 화면에서 다시 입력받지 않고 본인확인 때 넘어온
// loginId/name/orgCode/marketCode를 그대로 함께 보냄 - 서버가 이 값들로 다시 한 번
// 본인확인을 재검증하도록 하기 위함(state 조작으로 이 화면에 도달했더라도, 4개
// 필드가 실제로 일치하지 않으면 서버에서 거부됨).
interface LocationState {
  loginId: string;
  name: string;
  orgCode: string;
  marketCode: string;
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const state = location.state as LocationState | null;

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  if (!state?.loginId) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <ThemeToggle className="absolute right-6 top-6" />
        <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center">
          <p className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">본인확인이 필요합니다</p>
          <p className="mb-6 text-sm text-slate-500">
            비밀번호 찾기 화면에서 먼저 본인확인을 진행해주세요.
          </p>
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-500"
          >
            비밀번호 찾기로 이동
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isPasswordValid(password)) {
      setError('비밀번호는 8자 이상, 영문 대문자·소문자·숫자·특수문자를 모두 포함해야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    const result = await resetPassword({
      loginId: state.loginId,
      name: state.name,
      orgCode: state.orgCode,
      marketCode: state.marketCode,
      newPassword: password,
    });
    setIsSubmitting(false);

    if (result.ok) {
      setCompleted(true);
    } else {
      setError(result.message);
    }
  };

  if (completed) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <ThemeToggle className="absolute right-6 top-6" />
        <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center">
          <p className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">비밀번호가 변경되었습니다</p>
          <p className="mb-6 text-sm text-slate-500">새 비밀번호로 로그인해주세요.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-500"
          >
            로그인 화면으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <ThemeToggle className="absolute right-6 top-6" />
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="mb-1 text-sm text-slate-500">KT Aivle School B2G 빅프로젝트</p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">비밀번호 재설정</h1>
          <p className="mt-2 text-sm text-slate-500">{state.loginId}님의 새 비밀번호를 설정해주세요.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
        >
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              새 비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li key={rule.key} className={met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'}>
                    {met ? '✓' : '·'} {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <label htmlFor="passwordConfirm" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              새 비밀번호 확인
            </label>
            <input
              id="passwordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  );
}
