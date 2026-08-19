import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { homePathFor } from '../auth/permissions';
import ThemeToggle from '../components/ui/ThemeToggle';
import BackdropImage from '../components/ui/BackdropImage';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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
// 2026-08-04 변경: 하단의 "계정이 없으신가요? 회원가입" 링크를 "비밀번호를
// 잊으셨나요? 비밀번호 찾기"로 교체하고, 회원가입은 화면 우측 상단에 눈에 띄는
// 버튼으로 분리해서 더 명시적으로 노출함.
//
// 2026-08-12 변경 (UIUX 피드백 반영): 카드가 화면 대비 너무 작다는 의견이 있어
// max-w-sm(384px) -> max-w-md(448px)로 넓히고, 카드 안의 여백·제목·입력 높이를
// 함께 키웠다. 폭만 넓히면 내용은 그대로라 여백만 늘어난 것처럼 보인다.
// 안내 문구도 "관제 시스템 로그인이 필요합니다."에서 바꿨다(문구는 확정 아님).
export default function LoginPage() {
  useDocumentTitle('로그인');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  // 2026-07-24: RequireAuth를 거쳐 온 경우 원래 가려던 경로(location.state.from)로
  // 되돌려 보냈었다.
  //
  // 2026-08-12 변경: 그 복귀를 없애고 항상 권한별 기본 화면(homePathFor)으로 보낸다.
  // 로그아웃 직전에 보던 화면이 새 계정의 권한 밖일 수 있어서(예: 관리자로 보던
  // 시뮬레이션 비교 화면에서 로그아웃한 뒤 상인회 계정으로 로그인) 가드가 곧바로
  // 되돌려 보내는 왕복이 생겼다. 랜딩의 시작 버튼과 목적지를 하나로 맞춰,
  // 어디로 들어오든 자기 권한에 맞는 화면에 도착하게 한다.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(loginId, password);
    setIsSubmitting(false);
    if (result.ok) {
      // login()이 방금 스토어에 채운 사용자로 목적지를 정한다. 위에서 구독 중인
      // user 값은 이 렌더에서는 아직 갱신 전이라 쓸 수 없다.
      navigate(homePathFor(useAuthStore.getState().user), { replace: true });
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <BackdropImage className="fixed inset-0 pointer-events-none" />

      {/* Subtle Overlay to ensure text readability */}
      <div className="fixed inset-0 pointer-events-none bg-white/40 backdrop-blur-[2px] dark:bg-slate-950/40"></div>
      <div className="absolute right-6 top-6 z-10 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="mb-1.5 text-sm text-slate-500">KT Aivle School B2G 빅프로젝트</p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">시켜줘 네 장터매니저</h1>
          <p className="mt-2.5 text-sm text-slate-500">
            등록된 계정으로 로그인해 주세요.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8"
        >
          <div>
            <label htmlFor="loginId" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              아이디
            </label>
            <input
              id="loginId"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
            className="w-full rounded bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>

          <button
              type="button"
              onClick={() => navigate('/signup')}
              className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400"
          >
            회원가입
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/forgot-password')}
          className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
        >
          비밀번호를 잊으셨나요? 비밀번호 찾기
        </button>
      </div>
    </div>
  );
}
