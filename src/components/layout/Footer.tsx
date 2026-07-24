// 2026-07-24 추가
// 행안부 가이드라인 - Identity 영역 - 푸터 구조 반영:
// (1) 서비스 로고/팀명 (2) 연락처(GitHub 조직) (3) 저작권 정보
export default function Footer() {
  return (
    <footer className="mt-12 flex flex-col gap-2 border-t border-slate-800 px-6 py-6 text-xs text-slate-500">
      <div className="flex flex-wrap gap-4">
        <span>StrongestTeam10 (KT Aivle School 9기)</span>
        <a
          href="https://github.com/StrongestTeam10"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-300"
        >
          GitHub 조직 바로가기
        </a>
      </div>
      <p>본 시스템은 캡스톤 프로젝트 데모 목적으로 운영되며, 실제 서비스 데이터가 아닙니다.</p>
      <p>© 2026 StrongestTeam10. All rights reserved.</p>
    </footer>
  );
}
