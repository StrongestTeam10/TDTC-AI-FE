import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import TermsModal from '../components/TermsModal';
import ThemeToggle from '../components/ui/ThemeToggle';
import { PASSWORD_RULES, isPasswordValid } from '../utils/password';
import { TERMS_TEXT, PRIVACY_TEXT } from '../constants/legalText';
import { useCommonCodes } from '../hooks/useCommonCodes';
import { useAuthStore } from '../store/authStore';

// 2026-07-24 추가 (1차, SIGNUP-01)
// 행안부 가이드라인 - 기본패턴 영역 반영: "개인 식별 정보 입력" + "동의" 패턴을
// 회원가입 화면 하나에 결합해서 구현.
//
// 2026-07-24 (2차, SIGNUP-02) 변경 사항:
// - TERMS_TEXT/PRIVACY_TEXT를 constants/legalText.ts의 표준 양식 기반 초안으로 교체.
//   ⚠️ 실제 변호사 법무 검토를 거친 문구가 아니므로 배포 전 검토 필요(legalText.ts 상단 주석 참고)
// - 비밀번호 검증을 "8자 이상"에서 "8자 이상 + 영문 대/소문자·숫자·특수문자 모두 포함"으로 강화
// - 서비스 이용약관/개인정보 수집·이용 동의를 인라인 펼침이 아니라 팝업(TermsModal)으로 표시.
//   팝업은 끝까지 스크롤해야 "확인하고 동의" 버튼이 활성화되고, 그 버튼을 눌러야만
//   회원가입 화면의 체크박스가 켜짐 (체크박스를 직접 클릭해서 켤 수는 없음. 끄는 것은 직접 가능)
//
// 2026-07-24 (3차, SIGNUP-03): BE 회원가입 API가 생기면서 실제로 계정이 생성되도록
// authStore.signup()을 통해 axios 호출로 교체. 소속기관 옵션도 BE
// GET /api/common-codes?domain=ORG로 조회하되, 실패하면 constants/orgCode.ts의
// 값으로 대체(오프라인/BE 장애 시 폴백).

interface ConsentState {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
}

type ModalKey = 'terms' | 'privacy' | null;

export default function SignupPage() {
  const navigate = useNavigate();
  const signup = useAuthStore((s) => s.signup);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [orgCode, setOrgCode] = useState('');
  // 2026-08-12: 화면마다 복사돼 있던 공통코드 조회를 useCommonCodes로 모았다.
  const { options: orgOptions } = useCommonCodes('ORG');
  const [marketCode, setMarketCode] = useState('');
  const { options: marketOptions } = useCommonCodes('MKT');

  const [consent, setConsent] = useState<ConsentState>({
    terms: false,
    privacy: false,
    marketing: false,
  });

  // 2026-07-24: 팝업으로 열려있는 항목. "전체 동의"를 눌렀을 때 terms -> privacy
  // 순서로 이어서 보여주기 위해, 다음에 마저 보여줘야 할 항목을 chainNext에 잠깐 담아둠.
  const [openModal, setOpenModal] = useState<ModalKey>(null);
  const [chainNext, setChainNext] = useState<ModalKey>(null);

  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const allRequiredAgreed = consent.terms && consent.privacy;
  const allAgreed = consent.terms && consent.privacy && consent.marketing;

  // 필수 항목은 팝업에서 "확인하고 동의"를 눌러야만 true가 됨(직접 체크 불가).
  // 이미 동의한 상태에서 체크 해제하는 것(철회)은 팝업 없이 바로 허용.
  const handleRequiredCheckboxChange = (key: 'terms' | 'privacy', nextChecked: boolean) => {
    if (nextChecked) {
      setOpenModal(key);
    } else {
      setConsent((c) => ({ ...c, [key]: false }));
    }
  };

  const handleModalConfirm = () => {
    if (!openModal) return;
    setConsent((c) => ({ ...c, [openModal]: true }));
    setOpenModal(null);

    // "전체 동의" 체인 진행 중이었다면 다음 항목 팝업을 이어서 띄움
    if (chainNext) {
      const next = chainNext;
      setChainNext(null);
      setOpenModal(next);
    }
  };

  const handleModalClose = () => {
    setOpenModal(null);
    setChainNext(null); // 중간에 닫으면 체인도 중단(원치 않으면 나머지도 다시 눌러야 함)
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setConsent({ terms: false, privacy: false, marketing: false });
      return;
    }
    setConsent((c) => ({ ...c, marketing: true }));
    if (!consent.terms) {
      setChainNext(consent.privacy ? null : 'privacy');
      setOpenModal('terms');
    } else if (!consent.privacy) {
      setOpenModal('privacy');
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId || !password || !name || !orgCode || !marketCode) {
      setError('아이디, 비밀번호, 이름, 소속기관, 담당 시장은 필수 입력 항목입니다.');
      return;
    }
    if (!isPasswordValid(password)) {
      setError('비밀번호는 8자 이상, 영문 대문자·소문자·숫자·특수문자를 모두 포함해야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!allRequiredAgreed) {
      setError('필수 약관에 동의해야 가입할 수 있습니다.');
      return;
    }

    setIsSubmitting(true);
    const result = await signup({
      loginId,
      password,
      name,
      phoneNumber,
      orgCode,
      marketCode,
      agreeTerms: consent.terms,
      agreePrivacy: consent.privacy,
      agreeMarketing: consent.marketing,
    });
    setIsSubmitting(false);

    if (result.ok) {
      setSubmitted(true);
    } else {
      setError(result.message);
    }
  };

  if (submitted) {
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
        <div className="relative z-10 w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center">
          <p className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">가입 신청이 접수되었습니다</p>
          <p className="mb-6 text-sm text-slate-500">
            관리자 승인 후 로그인할 수 있습니다. 승인까지 다소 시간이 걸릴 수 있습니다.
          </p>
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
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
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
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          {/* 2026-08-12: 제목이 "관제 시스템 계정 등록"이었는데, 여기로 들어오는 통로
              (로그인 화면의 버튼, 하단 링크)가 모두 "회원가입"이라 도착한 화면 이름이
              달랐다. 부르는 이름을 하나로 맞춘다. 크기·여백도 로그인 화면과 통일. */}
          <p className="mb-1.5 text-sm text-slate-500">KT Aivle School B2G 빅프로젝트</p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">회원가입</h1>
          <p className="mt-2.5 text-sm text-slate-500">
            가입 신청 후 관리자 승인을 받으면 로그인할 수 있습니다.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
        >
          {/* 개인 식별 정보 입력 */}
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="loginId" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                아이디 <span className="text-red-600 dark:text-red-400">*</span>
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
              <label htmlFor="password" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                비밀번호 <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {/* 2026-07-24: 통상적인 비밀번호 조합 규칙 실시간 체크리스트 */}
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <li
                      key={rule.key}
                      className={met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'}
                    >
                      {met ? '✓' : '·'} {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <label htmlFor="passwordConfirm" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                비밀번호 확인 <span className="text-red-600 dark:text-red-400">*</span>
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
            <div>
              <label htmlFor="name" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                이름 <span className="text-red-600 dark:text-red-400">*</span>
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
              <label htmlFor="phoneNumber" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                전화번호 (선택)
              </label>
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  const rawValue = e.target.value.replace(/[^0-9]/g, '');
                  let formattedValue = '';
                  if (rawValue.length < 4) {
                    formattedValue = rawValue;
                  } else if (rawValue.length < 8) {
                    formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3)}`;
                  } else {
                    formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 7)}-${rawValue.slice(7, 11)}`;
                  }
                  setPhoneNumber(formattedValue);
                }}
                maxLength={13}
                placeholder="010-0000-0000"
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="orgCode" className="mb-1 block text-sm text-slate-500 dark:text-slate-400">
                소속기관 <span className="text-red-600 dark:text-red-400">*</span>
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
                담당 시장 <span className="text-red-600 dark:text-red-400">*</span>
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
          </div>

          {/* 동의 */}
          <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
            <label className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 text-sm font-medium text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 accent-blue-600"
              />
              전체 동의합니다
            </label>

            <div className="mt-3 flex flex-col gap-3">
              <RequiredConsentRow
                label="[필수] 서비스 이용약관 동의"
                checked={consent.terms}
                onChange={(checked) => handleRequiredCheckboxChange('terms', checked)}
                onViewClick={() => setOpenModal('terms')}
              />
              <RequiredConsentRow
                label="[필수] 개인정보 수집 및 이용 동의"
                checked={consent.privacy}
                onChange={(checked) => handleRequiredCheckboxChange('privacy', checked)}
                onViewClick={() => setOpenModal('privacy')}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={consent.marketing}
                  onChange={(e) => setConsent((c) => ({ ...c, marketing: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 accent-blue-600"
                />
                [선택] 안내사항 수신 동의
              </label>
            </div>
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
            {isSubmitting ? '가입 처리 중...' : '가입하기'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-center text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
          >
            이미 계정이 있으신가요? 로그인하기
          </button>
        </form>
      </div>

      {openModal === 'terms' && (
        <TermsModal title="서비스 이용약관" onConfirm={handleModalConfirm} onClose={handleModalClose}>
          {TERMS_TEXT}
        </TermsModal>
      )}
      {openModal === 'privacy' && (
        <TermsModal
          title="개인정보 수집 및 이용 동의"
          onConfirm={handleModalConfirm}
          onClose={handleModalClose}
        >
          {PRIVACY_TEXT}
        </TermsModal>
      )}
    </div>
  );
}

interface RequiredConsentRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onViewClick: () => void;
}

// 2026-07-24: 필수 동의 항목 행. 체크박스를 직접 눌러 "켜는" 것은 막고(팝업으로 유도),
// "내용 보기"를 눌러도 같은 팝업이 뜸. 체크 해제(철회)는 체크박스로 바로 가능.
function RequiredConsentRow({ label, checked, onChange, onViewClick }: RequiredConsentRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 accent-blue-600"
        />
        {label}
      </label>
      <button
        type="button"
        onClick={onViewClick}
        className="shrink-0 text-xs text-slate-500 underline hover:text-slate-900 dark:hover:text-slate-300"
      >
        내용 보기
      </button>
    </div>
  );
}
