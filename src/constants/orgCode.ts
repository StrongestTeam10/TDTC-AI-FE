// 2026-07-24 추가, 같은 날 2차 변경
// BE comcode01m(공통코드) 시드 데이터(comcode-seed.sql)의 ORG 도메인 값과 동일하게
// 맞춘 상수.
//
// 2차 변경: BE에 GET /api/common-codes?domain=ORG 조회 API가 생기면서, SignupPage는
// 이제 그 API로 실제 값을 가져옴. 이 상수는 API 호출 실패(BE 장애/네트워크 오류) 시
// 폴백용으로만 사용됨. comcode01m에 ORG 값이 추가/변경되면 이 배열도 참고용으로
// 같이 갱신해두면 좋음(폴백이 최신 상태를 유지하도록).
export interface OrgCodeOption {
  code: string;
  name: string;
}

export const ORG_CODE_OPTIONS: OrgCodeOption[] = [
  { code: 'ORGKT', name: 'KT' },
  { code: 'ORGGV', name: '지자체' },
  { code: 'ORGMA', name: '상인회' },
];
