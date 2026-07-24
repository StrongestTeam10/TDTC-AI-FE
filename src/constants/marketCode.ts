// 2026-07-24 추가 (게시판 - 회원가입 시장 선택)
// BE comcode01m(공통코드) 시드 데이터(comcode-seed.sql)의 MKT 도메인 값과 동일하게
// 맞춘 상수. SignupPage는 기본적으로 GET /api/common-codes?domain=MKT로 실제 값을
// 가져오고, 이 상수는 API 호출 실패(BE 장애/네트워크 오류) 시 폴백용으로만 사용됨.
// 시장이 추가되면(comcode-seed.sql에 MKT 행 추가) 이 배열도 참고용으로 같이
// 갱신해두면 좋음(폴백이 최신 상태를 유지하도록).
export interface MarketCodeOption {
  code: string;
  name: string;
}

export const MARKET_CODE_OPTIONS: MarketCodeOption[] = [{ code: 'MKTMW', name: '망원시장' }];
