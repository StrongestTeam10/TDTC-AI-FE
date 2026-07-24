import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import TermsModal from '../components/TermsModal';
import { PASSWORD_RULES, isPasswordValid } from '../utils/password';
import { TERMS_TEXT, PRIVACY_TEXT } from '../constants/legalText';
import { ORG_CODE_OPTIONS } from '../constants/orgCode';

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
// ⚠️ 범위: 지금은 화면(UI/검증/인터랙션)만 구현. 실제 계정 생성 BE API가 없어서
// 제출해도 서버에 아무것도 저장되지 않고, 화면 안에서만 "접수됨" 상태를 보여줌.
// BE 작업 시 아래를 함께 반영해야 함:
//   1. usrusrs01m에 동의 이력 컬럼 추가 필요 (예: agree_terms_at, agree_privacy_at,
//      agree_marketing TIMESTAMP/BOOLEAN 등 - 실제 컬럼명/타입은 BE 담당자와 협의)
//   2. 회원가입 API(POST /api/auth/signup 등) 연동 후, 아래 handleSubmit의 mock
//      처리 부분만 axios 호출로 교체

interface ConsentState {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
}

type ModalKey = 'terms' | 'privacy' | null;

export default function SignupPage() {
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [orgCode, setOrgCode] = useState('');

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId || !password || !name || !orgCode) {
      setError('아이디, 비밀번호, 이름, 소속기관은 필수 입력 항목입니다.');
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

    // TODO(BE 연동 시): 여기서 실제 회원가입 API를 호출하고, 응답의 성공/실패에 따라
    // 처리하도록 교체. 지금은 화면 흐름 확인용으로 접수 상태만 표시함.
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="mb-2 text-lg font-semibold text-slate-100">가입 신청이 접수되었습니다</p>
          <p className="mb-6 text-sm text-slate-500">
            실제 계정 생성은 BE 연동 후 적용됩니다. 지금은 화면 흐름만 확인할 수 있습니다.
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="mb-1 text-sm text-slate-500">KT Aivle School B2G 빅프로젝트</p>
          <h1 className="text-xl font-semibold text-slate-100">관제 시스템 계정 등록</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-lg border border-slate-800 bg-slate-900 p-6"
        >
          {/* 개인 식별 정보 입력 */}
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="loginId" className="mb-1 block text-sm text-slate-400">
                아이디 <span className="text-red-400">*</span>
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
                비밀번호 <span className="text-red-400">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {/* 2026-07-24: 통상적인 비밀번호 조합 규칙 실시간 체크리스트 */}
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <li
                      key={rule.key}
                      className={met ? 'text-emerald-400' : 'text-slate-600'}
                    >
                      {met ? '✓' : '·'} {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <label htmlFor="passwordConfirm" className="mb-1 block text-sm text-slate-400">
                비밀번호 확인 <span className="text-red-400">*</span>
              </label>
              <input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="name" className="mb-1 block text-sm text-slate-400">
                이름 <span className="text-red-400">*</span>
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="orgCode" className="mb-1 block text-sm text-slate-400">
                소속기관 <span className="text-red-400">*</span>
              </label>
              <select
                id="orgCode"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">선택해주세요</option>
                {ORG_CODE_OPTIONS.map((org) => (
                  <option key={org.code} value={org.code}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 동의 */}
          <div className="rounded border border-slate-800 bg-slate-950/60 p-4">
            <label className="flex items-center gap-2 border-b border-slate-800 pb-3 text-sm font-medium text-slate-200">
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-blue-600"
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
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={consent.marketing}
                  onChange={(e) => setConsent((c) => ({ ...c, marketing: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-blue-600"
                />
                [선택] 안내사항 수신 동의
              </label>
            </div>
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
            가입하기
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-center text-sm text-slate-500 hover:text-slate-300"
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
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-blue-600"
        />
        {label}
      </label>
      <button
        type="button"
        onClick={onViewClick}
        className="shrink-0 text-xs text-slate-500 underline hover:text-slate-300"
      >
        내용 보기
      </button>
    </div>
  );
}
