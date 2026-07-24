import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

// 2026-07-24 추가
// 행안부 가이드라인 - 기본패턴 영역 반영: "개인 식별 정보 입력" + "동의" 패턴을
// 회원가입 화면 하나에 결합해서 구현.
//
// ⚠️ 범위: 지금은 화면(UI/검증/인터랙션)만 구현. 실제 계정 생성 BE API가 없어서
// 제출해도 서버에 아무것도 저장되지 않고, 화면 안에서만 "접수됨" 상태를 보여줌.
// BE 작업 시 아래를 함께 반영해야 함:
//   1. usrusrs01m에 동의 이력 컬럼 추가 필요 (예: agree_terms_at, agree_privacy_at,
//      agree_marketing TIMESTAMP/BOOLEAN 등 - 실제 컬럼명/타입은 BE 담당자와 협의)
//   2. 회원가입 API(POST /api/auth/signup 등) 연동 후, 아래 handleSubmit의 mock
//      처리 부분만 axios 호출로 교체
//   3. 약관/개인정보처리방침 본문(TERMS_TEXT, PRIVACY_TEXT)은 지금 자리표시용 텍스트이므로
//      법무 검토가 끝난 실제 조항으로 교체 필요
const TERMS_TEXT =
  '(자리표시용 문구) 본 서비스는 전통시장 관제를 위한 내부 시스템으로, 이용자는 서비스 ' +
  '이용 목적에 맞게 계정을 사용해야 합니다. 상세 이용약관은 추후 확정되는 대로 이 자리에 ' +
  '반영됩니다.';

const PRIVACY_TEXT =
  '(자리표시용 문구) 수집 항목: 아이디, 이름, 소속기관. 수집 목적: 관제 시스템 계정 발급 및 ' +
  '접근 권한 관리. 보유 기간: 계정 삭제 시까지. 상세 개인정보 수집·이용 내역은 추후 확정되는 ' +
  '대로 이 자리에 반영됩니다.';

interface ConsentState {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
}

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
  const [expanded, setExpanded] = useState<{ terms: boolean; privacy: boolean }>({
    terms: false,
    privacy: false,
  });

  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // 가이드라인: 필수 항목과 선택 항목을 명확히 구분. terms/privacy는 필수, marketing은 선택.
  const allRequiredAgreed = consent.terms && consent.privacy;
  const allAgreed = consent.terms && consent.privacy && consent.marketing;

  const toggleAll = (checked: boolean) => {
    setConsent({ terms: checked, privacy: checked, marketing: checked });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId || !password || !name) {
      setError('아이디, 비밀번호, 이름은 필수 입력 항목입니다.');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
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
          <p className="mb-1 text-sm text-slate-500">KT Aivle School B2G 캡스톤</p>
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
              <p className="mt-1 text-xs text-slate-600">8자 이상 입력해주세요.</p>
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
                소속기관 <span className="text-slate-600">(선택)</span>
              </label>
              <input
                id="orgCode"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                placeholder="예: 망원시장 상인회"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
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
              <ConsentItem
                label="[필수] 서비스 이용약관 동의"
                checked={consent.terms}
                onChange={(checked) => setConsent((c) => ({ ...c, terms: checked }))}
                expanded={expanded.terms}
                onToggleExpand={() => setExpanded((s) => ({ ...s, terms: !s.terms }))}
                bodyText={TERMS_TEXT}
              />
              <ConsentItem
                label="[필수] 개인정보 수집 및 이용 동의"
                checked={consent.privacy}
                onChange={(checked) => setConsent((c) => ({ ...c, privacy: checked }))}
                expanded={expanded.privacy}
                onToggleExpand={() => setExpanded((s) => ({ ...s, privacy: !s.privacy }))}
                bodyText={PRIVACY_TEXT}
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
    </div>
  );
}

interface ConsentItemProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  bodyText: string;
}

// 가이드라인 - 동의 컴포넌트 구조: 컨테이너/제목/본문/동의 옵션.
// 본문(약관 전체 내용)은 기본적으로 접어두고, 필요할 때만 펼쳐서 읽을 수 있게 함.
function ConsentItem({ label, checked, onChange, expanded, onToggleExpand, bodyText }: ConsentItemProps) {
  return (
    <div>
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
          onClick={onToggleExpand}
          className="shrink-0 text-xs text-slate-500 underline hover:text-slate-300"
        >
          {expanded ? '내용 접기' : '내용 보기'}
        </button>
      </div>
      {expanded && (
        <p className="mt-2 rounded border border-slate-800 bg-slate-900 p-3 text-xs leading-relaxed text-slate-500">
          {bodyText}
        </p>
      )}
    </div>
  );
}
