import { useState } from 'react';
import LegalDocModal from '../legal/LegalDocModal';
import PrivacyPolicyDocument from '../legal/PrivacyPolicyDocument';
import TermsOfServiceDocument from '../legal/TermsOfServiceDocument';

// 2026-07-24 추가
// 행안부 가이드라인 - Identity 영역 - 푸터 구조 반영:
// (1) 서비스 로고/팀명 (2) 연락처(GitHub 조직) (3) 저작권 정보
//
// 2026-08-07 추가: 개인정보처리방침/이용약관 전문을 푸터에서 팝업으로 열 수 있게 함.
// 별도 페이지(/privacy, /terms)를 만들지 않은 이유는 두 문서 모두 로그인 여부와
// 무관하게 어디서든 열려야 하는데, 라우트로 빼면 보던 화면을 벗어나야 하기 때문.
// 회원가입 화면의 동의용 팝업(TermsModal)과는 별개다 - 그쪽은 "끝까지 읽어야 동의
// 버튼이 켜지는" 동의 절차용이고, 이건 열람용이다.
type OpenDoc = 'privacy' | 'terms' | null;

export default function Footer() {
  const [openDoc, setOpenDoc] = useState<OpenDoc>(null);

  return (
    <footer className="flex flex-col gap-2 border-t border-slate-200 px-6 py-6 text-xs text-slate-500 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-4">
        <span>StrongestTeam10 (KT Aivle School 9기)</span>
        <a
          href="https://github.com/StrongestTeam10"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-900 dark:hover:text-slate-300"
        >
          GitHub 조직 바로가기
        </a>

        {/* 개인정보처리방침은 관계 법령상 다른 고지사항보다 눈에 띄어야 해서 굵게 표시 */}
        <button
          type="button"
          onClick={() => setOpenDoc('privacy')}
          className="font-semibold underline hover:text-slate-900 dark:hover:text-slate-300"
        >
          개인정보처리방침
        </button>
        <button
          type="button"
          onClick={() => setOpenDoc('terms')}
          className="underline hover:text-slate-900 dark:hover:text-slate-300"
        >
          이용약관
        </button>
      </div>
      <p>본 시스템은 빅프로젝트 데모 목적으로 운영되며, 실제 서비스 데이터가 아닙니다.</p>
      <p>© 2026 StrongestTeam10. All rights reserved.</p>

      {openDoc === 'privacy' && (
        <LegalDocModal title="개인정보처리방침" onClose={() => setOpenDoc(null)}>
          <PrivacyPolicyDocument />
        </LegalDocModal>
      )}

      {openDoc === 'terms' && (
        <LegalDocModal title="이용약관" onClose={() => setOpenDoc(null)}>
          <TermsOfServiceDocument />
        </LegalDocModal>
      )}
    </footer>
  );
}
