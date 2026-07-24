// 2026-07-24 추가
// BE comcode01m(공통코드) 시드 데이터(comcode-seed.sql)의 ORG 도메인 값과 동일하게
// 맞춘 상수. 지금은 CommonCodeRepository만 있고 이걸 조회하는 API가 BE에 없어서
// FE에 하드코딩해둠.
//
// TODO(BE 연동 시): BE에 공통코드 조회 API(예: GET /api/common-codes?domain=ORG)가
// 생기면, 이 상수 배열 대신 그 API 응답으로 옵션을 채우도록 교체할 것. comcode01m에
// ORG 값이 추가/변경되면 이 배열도 같이 갱신해야 함(당장은 수동 동기화).
export interface OrgCodeOption {
  code: string;
  name: string;
}

export const ORG_CODE_OPTIONS: OrgCodeOption[] = [
  { code: 'ORGKT', name: 'KT' },
  { code: 'ORGGV', name: '지자체' },
  { code: 'ORGMA', name: '상인회' },
];
