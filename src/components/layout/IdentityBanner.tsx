// 2026-07-24 추가
// 행안부 「디지털 정부서비스 UI/UX 가이드라인」 - Identity 영역 - 운영기관 식별자 반영.
// 가이드라인 사용성 원칙: (1) 지나치게 주의를 끌지 않도록 표현, (2) 서비스 로고가 아닌
// 상위 운영기관 정보 안내, (3) 안내 텍스트/배치를 임의로 바꾸지 않음.
export default function IdentityBanner() {
  return (
    <div className="bg-slate-900 border-b border-slate-800 px-6 py-1.5 text-xs text-slate-500">
      이 시스템은 KT Aivle School 9기 B2G 빅프로젝트 과제로 개발되었으며, 전통시장 관리기관의 관제
      목적에 한해 운영됩니다.
    </div>
  );
}
