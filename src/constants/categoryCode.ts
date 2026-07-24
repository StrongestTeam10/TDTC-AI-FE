// 2026-07-24 추가 (게시판 - UI 설계서 카테고리 탭)
// BE comcode01m(공통코드) 시드 데이터(comcode-seed.sql)의 BCT 도메인 값과 동일하게
// 맞춘 상수. 목록/글쓰기 화면은 기본적으로 GET /api/common-codes?domain=BCT로 실제
// 값을 가져오고, 이 상수는 API 호출 실패 시 폴백으로만 사용됨.
// "전체" 탭은 필터 없음을 의미하는 UI 상태라 이 배열에는 포함하지 않음(화면에서 별도 처리).
export interface CategoryCodeOption {
  code: string;
  name: string;
}

// 2026-07-25 변경: 카테고리를 공지사항/자유게시판 2개로 축소(질문과 답변/제안 삭제)
export const CATEGORY_CODE_OPTIONS: CategoryCodeOption[] = [
  { code: 'BCTNT', name: '공지사항' },
  { code: 'BCTFR', name: '자유게시판' },
];

// 관리자만 작성 가능한 카테고리 (BE PostService.NOTICE_CATEGORY_CODE와 동일하게 유지)
export const ADMIN_ONLY_CATEGORY_CODE = 'BCTNT';
