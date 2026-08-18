import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommonCodes } from '../hooks/useCommonCodes';
import { useAuthStore } from '../store/authStore';
import ThemeToggle from '../components/ui/ThemeToggle';

// 2026-08-04 추가 (비밀번호 찾기 1/2 - 본인확인)
//
// usrusrs01m에 이메일/휴대폰 컬럼이 없어 이메일 인증코드 방식은 쓸 수 없음. 대신
// 회원가입 때 입력한 필드(아이디+이름+소속기관+담당시장)가 모두 일치하는지만
// 확인하는 방식을 씀(재재님 결정 - 지금 있는 필드만 사용, 스키마 변경 없음).
//
// 본인확인에 성공하면 다음 화면(/reset-password)으로 이동하되, 입력했던 4개 필드를
// 그대로 들고 감(location.state) - ResetPasswordPage가 실제 재설정 API를 호출할 때도
// 이 4개 필드를 함께 보내 서버가 다시 한 번 검증하도록 하기 위함(브라우저 state를
// 직접 조작해서 이 화면을 건너뛰는 걸 막는 최소한의 방어).
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const verifyIdentity = useAuthStore((s) => s.verifyIdentity);

  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  // 2026-08-12: 화면마다 복사돼 있던 공통코드 조회를 useCommonCodes로 모았다.
  const { options: orgOptions } = useCommonCodes('ORG');
  const [marketCode, setMarketCode] = useState('');
  const { options: marketOptions } = useCommonCodes('MKT');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId || !name || !orgCode || !marketCode) {
      setError('아이디, 이름, 소속기관, 담당 시장을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    const result = await verifyIdentity({ loginId, name, orgCode, marketCode });
    setIsSubmitting(false);

    if (result.ok) {
      navigate('/reset-password', { state: { loginId, name, orgCode, marketCode } });
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      {/* Background Mask Wrapper */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%), linear-gradient(to right, black 0%, black calc(100% - 15px), transparent 100%)',
          WebkitMaskComposite: 'source-in',
          maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%), linear-gradient(to right, black 0%, black calc(100% - 15px), transparent 100%)',
          maskComposite: 'intersect',
        }}
      >
        {/* Light Mode Background Image */}
        <img
          src="/images/bg-light.png"
          alt="Digital Twin Background Light"
          className="h-full w-full object-cover object-center dark:hidden"
        />
        
        {/* Dark Mode Background Image */}
        <img
          src="/images/bg-dark.png"
          alt="Digital Twin Background Dark"
          className="hidden h-full w-full object-cover object-center dark:block"
        />
      </div>

      {/* Subtle Overlay to ensure text readability */}
      <div className="fixed inset-0 pointer-events-none bg-white/40 backdrop-blur-[2px] dark:bg-slate-950/40"></div>
      <ThemeToggle className="absolute right-6 top-6 z-10" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="mb-1 text-sm text-slate-500">KT Aivle School B2G 빅프로젝트</p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">비밀번호 찾기</h1>
          <p className="mt-2 text-sm text-slate-500">
            가입 시 입력하신 정보로 본인확인을 진행합니다.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
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
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              이름
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label htmlFor="orgCode" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              소속기관
            </label>
            <select
              id="orgCode"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">선택해주세요</option>
              {orgOptions.map((org) => (
                <option key={org.code} value={org.code}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="marketCode" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
              담당 시장
            </label>
            <select
              id="marketCode"
              value={marketCode}
              onChange={(e) => setMarketCode(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">선택해주세요</option>
              {marketOptions.map((market) => (
                <option key={market.code} value={market.code}>
                  {market.name}
                </option>
              ))}
            </select>
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
            {isSubmitting ? '확인 중...' : '본인 확인'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
        >
          로그인 화면으로 돌아가기
        </button>
      </div>
    </div>
  );
}
