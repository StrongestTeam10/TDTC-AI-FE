# Changelog

이 파일은 Claude와의 작업 세션에서 변경된 내용을 기록합니다.
각 항목은 zip으로 전달된 시점 기준입니다.

### 2026-07-26 (게시글 수정 화면을 열면 조회수가 올라가던 버그 수정 + BoardWritePage StrictMode 가드 추가)
- **증상**: `BoardWritePage`(수정 화면)가 기존 값을 프리필할 때 `fetchPostDetail`(상세 조회 API)을
  그대로 재사용하고 있었는데, 이 API가 호출될 때마다 서버 조회수를 올리는 API라서 수정 화면을
  열기만 해도 조회수가 증가했음(BE `CHANGELOG.md` 2026-07-26 항목과 세트)
- ✏️ `api/client.ts`: `fetchPostDetail(postId, countView = true)` — `countView` 파라미터를
  쿼리 파라미터로 서버에 전달하도록 변경
- ✏️ `BoardWritePage.tsx`: 수정 화면 프리필 호출을 `fetchPostDetail(Number(postId), false)`로
  변경해 조회수 증가를 막음
- ✏️ `BoardWritePage.tsx`: `BoardListPage`에 적용했던 것과 동일한 `useRef` 가드를 공통코드 조회
  effect와 상세 프리필 effect에 추가해, StrictMode 이중 실행으로 인한 중복 호출 자체도 제거
- `npx tsc -b && npx oxlint && npx vite build` 전부 통과 확인 완료

- **증상**: 서버 로그(Hibernate SQL)를 직접 확인한 결과, 게시판 목록 진입 시
  공통코드(BCT/MKT) 조회 + 목록 조회(공지/페이징/첨부파일 배치/작성자 배치) 쿼리 세트
  전체가 항상 2번씩 나가고 있었음
- **원인**: `BoardDetailPage`는 이전 세션(2026-07-25, 조회수 중복 증가 버그 수정)에서
  React 18/19 StrictMode(`main.tsx`)의 개발 모드 useEffect 이중 실행에 대비해 `useRef` 가드를
  넣었는데, 같은 시점에 만든 `BoardListPage`에는 이 가드가 빠져 있었음. StrictMode가 마운트 시
  effect를 두 번 실행하면서 공통코드 조회 effect와 목록 조회(`load`) effect가 각각 중복 호출됨
- ✏️ `BoardListPage.tsx`:
  - 공통코드(BCT/MKT) 조회 effect에 `commonCodesLoadedRef`(useRef) 가드 추가 - 마운트당 1회만 실행
  - 목록 조회 effect에 `lastLoadedKeyRef`(useRef) 가드 추가 - 검색어/카테고리/시장/관리자여부/페이지
    조합이 실제로 바뀔 때만 `load()` 호출, StrictMode가 동일 조합으로 재실행해도 건너뜀
  - `load()` 호출 지점이 이 effect 1곳뿐이라 다른 갱신 로직과의 충돌 없음을 확인
- `npx tsc -b && npx oxlint && npx vite build` 전부 통과 확인 완료

### 2026-07-25 (18차 - 목록 테이블 레이아웃 근본 수정 + Tiptap 중복 확장 경고 수정)
- **증상 1**: "시장" 컬럼의 "망원시장"이 "망원..."으로 계속 잘려서 보임(이전 컬럼 폭
  조정으로는 해결이 반복적으로 안 됨)
- **원인**: `table-fixed` + 컬럼마다 수동으로 픽셀 폭을 지정하는 방식 자체가 한글
  콘텐츠 폭을 정확히 예측하기 어려워서 컬럼이 늘어날 때마다(카테고리, 시장 추가 등)
  계속 잘리는 문제가 반복됐음
- ✏️ `pages/BoardListPage.tsx`: 테이블 레이아웃을 근본적으로 교체
  - `table-fixed` 제거, 브라우저가 내용에 맞게 컬럼 폭을 자동으로 늘리는 기본
    테이블 레이아웃으로 변경
  - 제목을 제외한 모든 셀에 `whitespace-nowrap` 적용 - 줄바꿈으로 인한 잘림을
    구조적으로 차단(더 이상 폭 계산에 의존하지 않음)
  - 화면보다 테이블이 넓어지는 경우(좁은 화면 등)에는 컬럼을 억지로 줄이는 대신
    테이블 래퍼에 `overflow-x-auto`를 적용해 가로 스크롤로 대응
  - 제목 컬럼만 `min-w-[240px]`로 최소 폭 보장, 나머지는 내용 크기에 맡김
  - 기존에 컬럼별로 넣었던 `truncate`/`title` 툴팁 처리는 더 이상 필요 없어져서 제거
- **증상 2**: 브라우저 콘솔에 `[tiptap warn]: Duplicate extension names found:
  ['link', 'underline']` 경고 반복 출력
- **원인**: Tiptap v3의 `@tiptap/starter-kit`가 `Link`/`Underline`을 기본 내장하게
  바뀌었는데(v2 대비 변경점), `RichTextEditor.tsx`가 이걸 모르고 별도로 또
  `@tiptap/extension-link`/`@tiptap/extension-underline`을 추가해서 중복 등록됨
- ✏️ `components/RichTextEditor.tsx`: 별도 `Underline`/`Link` 확장 제거, 링크 클릭
  동작(`openOnClick: false, autolink: true`)은 `StarterKit.configure({ link: {...} })`
  옵션으로 대신 설정. `@tiptap/extension-underline`/`@tiptap/extension-link` 패키지
  의존성도 제거(더 이상 직접 사용 안 함, `@tiptap/starter-kit`가 내부적으로 계속 사용)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-25 (17차 - 작성일 컬럼 잘림 수정 + 카테고리 2개로 축소)
- **증상**: 목록 테이블 "작성일" 컬럼이 `table-fixed` 고정폭 안에서 텍스트가 잘려 보임
- **원인**: `toLocaleString('ko-KR', {...})`로 만든 "2026. 07. 25. 오전 12:36" 포맷이
  한글 "오전/오후" 때문에 고정폭 컬럼(`w-36`)보다 길어짐
- ✏️ `pages/BoardListPage.tsx`:
  - `formatDate()`를 "오전/오후" 없는 24시간제 짧은 포맷("2026-07-25 12:36")으로 교체
  - 컬럼 폭 재조정(시장/카테고리/작성자 살짝 줄이고 작성일 확보)
- ✏️ `constants/categoryCode.ts`: BE 변경(카테고리 공지사항/자유게시판 2개로 축소)에
  맞춰 폴백 옵션도 `BCTQA`(질문과 답변)/`BCTSG`(제안) 제거, `BCTFR`(자유게시판) 추가
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인
- ⚠️ 화면에 떴던 "유효하지 않은 게시판 카테고리 코드입니다: BCTNT" 오류는 FE 버그가
  아니라 BE DB 마이그레이션(comcode-seed.sql BCT 도메인) 미반영 문제였음 - BE
  README/CHANGELOG 참고

### 2026-07-25 (16차 - 목록/상세 화면 레이아웃 수정)
- 사용자 확인 사항: 스크린샷 기준 3가지 레이아웃 이슈 지적받고 수정
  1. 목록 "구분" 컬럼의 "공지" 배지가 "공"/"지"로 줄바꿈되는 문제
  2. 상세 화면 하단 버튼 순서를 "목록은 아래로, 수정/삭제는 조회·좋아요 오른쪽으로" 재배치
  3. 목록 테이블에 어느 시장 글인지 구분하는 컬럼 추가
- ✏️ `pages/BoardListPage.tsx`:
  - `<table>`에 `table-fixed` 적용 + 각 컬럼 `w-*` 명시적 지정, "공지" 배지에
    `whitespace-nowrap` 추가 — 컬럼이 좁아져도 텍스트가 줄바꿈되지 않도록 고정
  - "구분" 컬럼 오른쪽에 **"시장" 컬럼 신규 추가** — `marketCode`를 라벨로 표시
    (공지처럼 `marketCode`가 없는 글은 "전체"로 표시). 시장 옵션은 이제 관리자
    여부와 무관하게 항상 로드(목록 컬럼 표시용으로 전체 사용자에게 필요해짐 -
    기존엔 관리자 시장 탭에서만 썼음)
  - 제목/작성자 등 긴 텍스트 컬럼은 `truncate` 처리(고정 폭 레이아웃에서 넘치는
    텍스트를 ...으로 축약, `title` 속성으로 전체 텍스트는 hover 시 확인 가능)
- ✏️ `pages/BoardDetailPage.tsx`:
  - 수정/삭제 버튼을 하단 액션 영역에서 **상단 메타 정보 영역(조회/좋아요 표시
    오른쪽)**으로 이동 — 구분선(`border-l`)으로 시각적으로 묶음
  - 하단 영역을 2단으로 분리: 1단(좋아요 버튼만), 2단(구분선 아래 "← 목록" 버튼을
    중앙 정렬로 별도 배치)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-25 (15차 - 조회수 중복 증가 버그 수정)
- **증상**: 게시글 상세 화면 진입 시 조회수가 한 번에 2씩 올라감
- **원인 1**: `GET /api/posts/{id}`는 호출될 때마다 서버 조회수를 1 증가시키는데,
  `main.tsx`의 `<StrictMode>`가 **개발 모드에서만** 마운트 시 `useEffect`를 의도적으로
  두 번 실행함(부작용 버그 조기 발견 목적, React 공식 동작) - `BoardDetailPage`의
  최초 조회 effect가 이 영향으로 `fetchPostDetail`을 두 번 호출해 조회수가 2씩 오름
- **원인 2**: 좋아요 버튼을 누르면 `togglePostLike()` 후 상세를 통째로 다시
  `load()`해서 좋아요 상태를 갱신했는데, 이 재조회도 `GET /api/posts/{id}`라 그때마다
  조회수가 또 올라감(좋아요만 눌렀는데 조회수까지 같이 오르는 부작용)
- ✏️ `pages/BoardDetailPage.tsx`:
  - `viewCountedPostIdRef`(useRef)로 postId별 "이미 조회수 반영용 조회를 했는지"
    기억해서, StrictMode가 effect를 다시 실행해도 같은 postId에 대해
    `fetchPostDetail`을 중복 호출하지 않도록 막음(다른 postId로 이동하면 정상적으로
    다시 조회 - ref가 postId 값 자체를 키로 사용하므로 정상 케이스는 그대로 동작)
  - `handleLike()`: 좋아요 토글 후 `load()`로 전체 재조회하는 대신, 서버 응답(`liked`)만으로
    로컬 상태(`liked`/`likeCount`)를 직접 갱신하도록 변경 - 조회수에 영향 없음
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인
- ⚠️ 참고: 프로덕션 빌드(`vite build`로 배포된 결과물)에서는 StrictMode의 개발 모드
  이중 호출 자체가 발생하지 않으므로 원인 1은 원래 배포본에는 영향이 없었을 가능성이
  높지만, 원인 2(좋아요 재조회)는 개발/배포 환경 무관하게 항상 발생하던 버그라 이번에
  같이 잡았음

### 2026-07-25 (14차 - UI 설계서 반영: 카테고리/시장 탭 + 리치 텍스트 에디터 + 드래그앤드롭 업로드)
- BE `category_code`/관리자 전용 `marketCode` 필터 API 추가에 맞춰 게시판 화면 3개
  전면 개편
- 🆕 `constants/categoryCode.ts`: `orgCode.ts`/`marketCode.ts`와 동일 패턴(BCT 도메인
  폴백), 관리자 전용 카테고리 코드(`BCTNT`) 상수 포함
- 🆕 `components/RichTextEditor.tsx`: Tiptap 기반 리치 텍스트 에디터. 굵게/기울임/
  밑줄/정렬(좌·가운데·우)/글머리·번호 목록/이미지 삽입/링크/글자 색 툴바 제공.
  이미지는 별도 업로드 API 없이 base64 data URL로 콘텐츠(HTML)에 직접 내장(구현
  단순화 목적, 이미지 많으면 게시글 용량이 커질 수 있음 - 참고용). 동영상 삽입은
  이번 범위에서 제외(임의 iframe 삽입은 XSS 표면을 넓히는 선택이라 별도 논의 필요
  판단)
- 🆕 `components/FileDropzone.tsx`: 드래그앤드롭 파일 첨부 + 제출 시 업로드 진행률
  표시(스피너 → 진행바). `api/client.ts`의 `createPost`/`updatePost`에 추가한
  `onUploadProgress` 콜백(axios)과 연결
- ✏️ `pages/BoardListPage.tsx`: 상단 카테고리 탭(전체/공지사항/질문과 답변/제안)
  추가, 목록 테이블에 카테고리 컬럼 추가. 관리자 계정에는 시장 전환 탭도 추가로
  노출(일반 사용자는 기존처럼 자동으로 본인 담당 시장 글만 보임 - 탭 자체가 없음)
- ✏️ `pages/BoardWritePage.tsx`: 본문 입력을 `textarea` → `RichTextEditor`로, 첨부는
  단순 `<input type="file">` → `FileDropzone`으로 교체. 카테고리 select 추가
  (공지사항 카테고리는 관리자가 아니면 비활성화 처리, BE 검증과 동일 규칙).
  **임시저장(이탈 시 저장 확인 팝업)은 이번 범위에서 제외**(사용자 확인 사항)
- ✏️ `pages/BoardDetailPage.tsx`: 카테고리 배지 표시. 본문이 이제 Tiptap이 만든
  HTML 문자열이라, **DOMPurify로 sanitize한 뒤에만 `dangerouslySetInnerHTML`로
  렌더링**(저장된 HTML을 그대로 신뢰하지 않음 - 저장형 XSS 방지)
- ✏️ `types/board.ts`/`api/client.ts`: `categoryCode` 필드, `fetchPosts`의
  `categoryCode`/`marketCode` 파라미터, `createPost`/`updatePost`의 업로드 진행률
  콜백 추가
- 🆕 패키지 설치: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`,
  `@tiptap/extension-underline`, `@tiptap/extension-text-align`,
  `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-link`,
  `@tiptap/extension-image`, `dompurify`, `@tailwindcss/typography`(에디터/렌더링
  영역 `prose` 스타일용)
- ✏️ `index.css`: `@plugin "@tailwindcss/typography";` 등록 (Tailwind v4 CSS-first
  플러그인 방식)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인 (빌드 산출물이
  Tiptap 추가로 커져서 500KB 청크 경고가 뜨지만 기능상 문제는 없음 - 필요하면 추후
  코드 스플리팅 고려 가능)

### 2026-07-24 (13차 - 회원가입 화면에 담당 시장 select 추가)
- BE `SignupRequestDto.marketCode` 필수 필드 추가에 맞춰 회원가입 화면에 반영
- 🆕 `constants/marketCode.ts`: `orgCode.ts`와 동일한 패턴 - BE `GET
  /api/common-codes?domain=MKT` 조회 실패 시 폴백용 상수(현재 망원시장 1건)
- ✏️ `pages/SignupPage.tsx`: 소속기관 select 아래에 "담당 시장" select 추가.
  옵션은 BE 공통코드(MKT 도메인) API로 조회하고 실패 시 로컬 폴백 사용(소속기관과
  동일한 방식). 필수 입력 검증에 `marketCode` 추가, 제출 payload에 포함
- ✏️ `api/client.ts`(`SignupRequest`): `marketCode: string` 필드 추가
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (12차 - 게시판 화면 신규 추가)
- BE `POST /api/posts/**` 신규 구현에 맞춰 게시판 화면 3개 추가
- 🆕 `types/board.ts`: `PostSummary`/`PostDetail`/`Attachment`/`PageResponse<T>`/
  `PostListResponse` - BE DTO와 필드명 그대로 일치
- ✏️ `api/client.ts`: `fetchPosts`/`fetchPostDetail`/`createPost`/`updatePost`/
  `deletePost`/`togglePostLike`/`downloadAttachment` 추가. 작성/수정은 파일 업로드를
  함께 보내야 해서 JSON이 아니라 `FormData`(multipart/form-data)로 전송
- 🆕 `pages/BoardListPage.tsx`: 검색(제목/내용/작성자) + 페이징 + 공지 상단 고정 목록.
  목록 API가 이미 "관리자는 전체 시장 / 그 외는 본인 담당 시장 + 공지"로 필터링해서
  내려주므로 화면에서는 응답을 그대로 렌더링만 함
- 🆕 `pages/BoardWritePage.tsx`: 작성(`/board/write`)/수정(`/board/:postId/edit`)을 같은
  컴포넌트로 처리. 공지 고정 체크박스는 관리자(`ROL01`)에게만 노출. 수정 화면에서는
  기존 첨부파일을 체크해서 삭제 표시하고, 새 파일을 추가로 첨부할 수 있음
- 🆕 `pages/BoardDetailPage.tsx`: 상세 조회, 좋아요 토글, 첨부파일 다운로드, 수정/삭제
  버튼(`canEdit`/`canDelete`는 BE가 이미 계산해서 내려주므로 FE는 role/writerId 비교
  로직을 따로 두지 않음)
- ✏️ `App.tsx`: `/board`, `/board/write`, `/board/:postId`, `/board/:postId/edit` 라우트
  추가(전부 `RequireAuth`로 보호)
- ✏️ `components/layout/Header.tsx`: 메인 메뉴에 "게시판" 링크 추가
- ✏️ `types/auth.ts`/`api/client.ts`(`UserSummary`)/`store/authStore.ts`: BE
  `usrusrs01m.market_code` 추가에 맞춰 `AuthUser.marketCode`(optional) 추가
- ⚠️ 첨부파일 다운로드는 BE가 302로 S3 presigned URL을 응답하는데, axios가 리다이렉트를
  그대로 따라가 파일을 blob으로 받은 뒤 브라우저 다운로드를 트리거하는 방식으로 구현함
  (Authorization 헤더는 최초 우리 서버 요청에만 붙고, 리다이렉트되는 S3 요청에는 브라우저가
  자동으로 제외하므로 별도 처리 불필요)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (11차 - BE 로그인/회원가입 실제 연동 + 기존 API 인증 필수화)
- 사용자 확인 사항: 권한 표현은 FE도 BE와 동일하게 `ROL01/02/03`로 통일, 기존 API
  (대시보드/시뮬레이션 등)도 이번에 토큰 인증을 필수로 만들기로 함
- 🆕 `auth/tokenStore.ts`: 현재 액세스 토큰을 보관하는 최소 모듈. `api/client.ts`
  (axios 인터셉터, 읽기 전용)와 `store/authStore.ts`(zustand, 로그인/로그아웃 시
  쓰기) 사이에서 순환 참조를 피하려고 둠. API가 401을 주면 이 모듈이
  `authStore.logout()`을 호출하는 콜백도 여기서 관리
- ✏️ `api/client.ts`:
  - 모든 요청에 토큰이 있으면 `Authorization: Bearer` 헤더 자동 첨부하는 요청
    인터셉터 추가
  - 응답이 401이면(로그인/회원가입 자체의 401은 제외) 로그인 상태를 자동 정리하도록
    `notifyUnauthorized()` 호출 추가
  - `login`/`signup`/`fetchCommonCodes` API 함수 추가 (BE `AuthController`/
    `CommonCodeController`와 대응)
- ✏️ `types/auth.ts`: `UserRole`을 `'ADMIN' | 'VIEWER'` 2단계에서 BE와 동일한
  `'ROL01' | 'ROL02' | 'ROL03'`(comcode01m 기준: 관리자/관제요원/조회자) 3단계로
  변경. 화면 표시용 `ROLE_LABELS` 맵 추가
- ✏️ `store/authStore.ts`: mock 계정을 완전히 제거하고 `login`/`signup`을 실제 BE
  API 호출(비동기)로 교체. 로그인 성공 시 토큰을 `tokenStore`에 저장, 새로고침 후
  복원(`onRehydrateStorage`)도 처리
- ✏️ `pages/LoginPage.tsx`: `login()`이 비동기라 `handleSubmit`도 async로 변경,
  제출 중 로딩 상태 표시. mock 시절 "테스트 계정으로 채우기" 버튼은 실제 계정이
  없으면 로그인이 실패하므로 제거(전체 화면 확인용 관리자 계정이 필요하면 `/signup`으로
  가입 후 BE에서 해당 계정의 `rules_code`를 `ROL01`로 한 번 수동 변경 필요 - BE
  README 참고)
- ✏️ `pages/SignupPage.tsx`: `handleSubmit`을 실제 회원가입 API 호출로 교체, 제출
  중 로딩 상태 및 실패 시 오류 배너 표시. 소속기관 옵션은 이제 BE
  `GET /api/common-codes?domain=ORG`에서 가져오되, 실패 시 `constants/orgCode.ts`
  값으로 폴백
- ✏️ `components/layout/Header.tsx`: 사용자 정보에 권한 코드 대신 `ROLE_LABELS`로
  변환한 읽기 쉬운 라벨(관리자/관제요원/조회자) 표시
- ✏️ `constants/orgCode.ts`: 이제 BE 공통코드 API 실패 시에만 쓰는 폴백 용도로
  주석 갱신
- ✏️ "캡스톤" → "빅프로젝트" 표현 일괄 정리 (`Footer.tsx`, `IdentityBanner.tsx`,
  `constants/legalText.ts`, `pages/LandingPage.tsx`, `pages/SignupPage.tsx`, 이
  README)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인
- ⚠️ BE도 같은 날 기존 API를 `authenticated()`로 잠갔으므로(BE README 참고), 이제
  로그인하지 않은 상태로는 대시보드/시나리오/예측 어떤 API도 호출되지 않음 -
  RequireAuth가 애초에 로그인 안 하면 그 화면들을 렌더링 자체를 안 하므로 실사용
  흐름에서는 문제 없지만, 혹시 토큰 만료 중 API 호출이 발생하면 401 → 자동 로그아웃
  → `/login`으로 이동됨

### 2026-07-24 (10차 - 소속기관 필수화 + 공통코드 select로 변경)
- 🆕 `constants/orgCode.ts`: BE `comcode01m`(공통코드) 시드 데이터(`comcode-seed.sql`)의
  `ORG` 도메인 값(ORGKT/KT, ORGGV/지자체, ORGMA/상인회)과 동일하게 맞춘 상수.
  **BE에 공통코드 조회 API가 아직 없어서 FE에 하드코딩**해둠. BE에 조회 API(예:
  `GET /api/common-codes?domain=ORG`)가 생기면 이 상수 대신 API 응답으로 옵션을
  채우도록 교체 필요. `comcode01m`에 ORG 값이 추가/변경되면 지금은 이 배열도 수동으로
  같이 갱신해야 함
- ✏️ `pages/SignupPage.tsx`: 소속기관을 자유 입력(선택)에서 `ORG_CODE_OPTIONS`
  기반 select(필수)로 변경, 미선택 시 제출 검증에서 걸러지도록 처리
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (9차 - 회원가입 화면 강화: 약관 팝업 + 비밀번호 조합 규칙)
- 🆕 `constants/legalText.ts`: 서비스 이용약관/개인정보 수집·이용 동의/안내사항
  수신 동의 문구를 표준 양식 기반 초안으로 작성. **⚠️ 실제 법무 검토를 거친 문구가
  아님** — 개인정보보호법이 요구하는 항목 구성(수집목적/항목/보유기간/거부권리 및
  불이익 고지 등)을 참고해서 채운 초안이므로, 실서비스 배포 전 반드시 학교/기관의
  법무 검토가 필요함(파일 상단 주석에도 명시)
- 🆕 `utils/password.ts`: 통상적인 비밀번호 조합 규칙(8자 이상 + 영문 대문자·
  소문자·숫자·특수문자 모두 포함) 검증 로직 + 규칙 목록
- 🆕 `components/TermsModal.tsx`: 약관/개인정보 동의 팝업. 내용을 끝까지 스크롤해야
  "확인하고 동의" 버튼이 활성화됨(내용이 짧아 스크롤이 필요 없는 경우는 예외)
- ✏️ `pages/SignupPage.tsx`:
  - 비밀번호 필드에 실시간 조합 규칙 체크리스트 표시, 제출 시 검증도 동일 규칙 적용
  - 서비스 이용약관/개인정보 수집·이용 동의를 인라인 펼침 → 팝업(`TermsModal`)으로
    변경. **체크박스를 직접 클릭해서 켤 수 없고, 팝업에서 "확인하고 동의"를 눌러야만
    체크됨** (체크 해제=철회는 체크박스로 바로 가능)
  - "전체 동의" 클릭 시 아직 안 읽은 필수 항목 팝업을 순서대로(약관 → 개인정보)
    이어서 띄움
  - 안내사항 수신 동의(선택)는 기존처럼 체크박스로 바로 동의/철회 가능(팝업 없음)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (8차 - 회원가입 화면 추가: 개인 식별 정보 입력 + 동의 패턴, FE만 구현)
- 사용자 확인 사항: DB 컬럼 추가(동의 이력 등)는 나중에 BE 작업 때 반영하기로 하고,
  이번엔 화면(UI/검증/인터랙션)만 구현
- 🆕 `pages/SignupPage.tsx`: 가이드라인 기본패턴 영역의 "개인 식별 정보 입력" +
  "동의" 패턴을 결합한 회원가입 화면
  - 입력: 아이디/비밀번호/비밀번호 확인/이름(필수), 소속기관(선택)
  - 동의: 전체 동의 체크박스 + 필수 2개(서비스 이용약관, 개인정보 수집·이용) +
    선택 1개(안내사항 수신). 각 항목 "내용 보기"로 약관 본문 펼침/접기
  - 검증: 필수 입력 누락, 비밀번호 8자 미만, 비밀번호 불일치, 필수 동의 누락을
    화면 내 오류 문구로 안내(`alert()` 미사용)
  - 제출 시 실제 BE 호출 없이 "가입 신청이 접수되었습니다" 접수 화면만 표시
    (BE 연동 전까지 화면 흐름 확인용)
  - **BE 작업 시 반영 필요 (코드 내 TODO 주석으로도 남겨둠)**:
    1) `usrusrs01m`에 동의 이력 컬럼 추가 필요 (예: `agree_terms_at`,
       `agree_privacy_at`, `agree_marketing` 등 - 컬럼명/타입은 BE 담당자와 협의)
    2) 회원가입 API 연동 후 `handleSubmit`의 mock 처리 부분만 axios 호출로 교체
    3) 약관/개인정보처리방침 본문은 지금 자리표시용 문구라 법무 검토된 실제
       조항으로 교체 필요
- ✏️ `pages/LoginPage.tsx`: "계정이 없으신가요? 회원가입" 링크 추가(`/signup`)
- ✏️ `App.tsx`: `/signup` 공개 라우트 추가(`/login`과 동일하게 `RequireAuth` 없음)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (7차 - 헤더 서비스명을 홈 링크로 변경)
- ✏️ `components/layout/Header.tsx`: 왼쪽 서비스명("전통시장 안전탐지 디지털
  트윈")이 클릭해도 반응 없는 텍스트였던 것을 `/`(랜딩페이지)로 이동하는
  `Link`로 변경
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (6차 - 404 페이지 추가)
- 점검 결과: `App.tsx`에 정의된 경로 외에는 catch-all 라우트가 없어서, 잘못된 URL로
  들어오면 빈 화면만 보이던 문제 발견
- 🆕 `pages/NotFoundPage.tsx`: 404 안내 화면. "홈으로 가기"(`/`), "관제 대시보드로
  가기"(`/dashboard`) 버튼 제공. 로그인 여부와 무관하게 접근 가능해야 해서
  `RequireAuth` 없이 `AppLayout`만 적용
- ✏️ `App.tsx`: `path="*"` catch-all 라우트 추가 (라우트 목록 맨 마지막)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (5차 - 대시보드/시나리오/예측 화면 사용성 패턴 점검: 로딩/오류/빈화면)
- 사용자 확인 사항: 다음 작업으로 "각 화면 내부에 가이드라인 적용 점검(로딩/오류/빈화면 등
  사용성 패턴)"을 선택
- 점검 결과 발견한 문제:
  - `ScenarioPage`/`PredictionPage`가 오류를 `window.alert()`로 띄움 → 화면 흐름을
    강제로 막고 모바일 UX가 나쁨, 가이드라인의 "오류 메시지는 명확하고 간결하게"에도
    안 맞음
  - `useSimulationData`/각 페이지의 초기 데이터 로드 실패 시 `console.error`만 찍고
    화면엔 아무 표시가 없어서, 로드가 실패하면 사용자가 원인을 알 방법이 없었음
  - `DashboardPage` 최초 로딩 시 스피너 없이 빈 레이아웃만 잠깐 보임(버튼 텍스트만
    "갱신 중..."으로 바뀜)
  - `RiskScorePanel`/`AlertLogTable`/`FramePlayer`는 이미 빈 데이터 상태 문구가
    있어서 그대로 둠(수정 없음)
- 🆕 `components/ui/Spinner.tsx`: 가이드라인 피드백 영역 - 스피너 패턴 반영
- 🆕 `components/ui/ErrorBanner.tsx`: `alert()`를 대체하는 화면 내 오류 배너
  (필요 시 "다시 시도" 버튼 포함)
- 🆕 `utils/errorMessage.ts`: axios 에러에서 사용자에게 보여줄 문구를 뽑는 공통 헬퍼
  (서버 메시지 우선, 타임아웃/네트워크 단절/기타 HTTP 오류를 구분해서 안내)
- ✏️ `hooks/useSimulationData.ts`: `loadError` 상태 추가 반환
- ✏️ `pages/DashboardPage.tsx`: 최초 로딩 중 `Spinner` 표시, `loadError` 발생 시
  `ErrorBanner`(다시 시도 버튼 포함) 표시
- ✏️ `pages/ScenarioPage.tsx`, `pages/PredictionPage.tsx`: 레이아웃(시장/구역) 로딩
  중 `Spinner` 표시, 로딩 실패 시 `ErrorBanner`(다시 시도), 시뮬레이션 실행 실패 시
  `alert()` 대신 폼 위에 `ErrorBanner` 표시로 교체
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (4차 - 로그아웃 이동 위치 재수정: 랜딩페이지 → 로그인 페이지)
- 사용자 확인 사항: 3차에서 랜딩페이지(`/`)로 정했던 로그아웃 이동 위치를
  로그인 페이지(`/login`)로 다시 변경
- ✏️ `components/layout/Header.tsx`: `handleLogout`의 `navigate('/')` → `navigate('/login')`
- `npx tsc -b`, `npx oxlint` 통과 확인

### 2026-07-24 (3차 - 로그아웃 시 랜딩페이지로 이동)
- 사용자 확인 사항: 로그아웃 버튼 클릭 시 이동 위치는 랜딩페이지(`/`)로 확정
- ✏️ `components/layout/Header.tsx`: 로그아웃 버튼 클릭 시 `logout()` 호출 후
  `navigate('/')`로 이동하도록 변경(기존엔 로그아웃만 하고 현재 화면에 그대로
  머물러 있다가 `RequireAuth`에 의해 `/login`으로 튕기는 방식이었음)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (2차 - 공개 랜딩페이지 분리, 라우트 구조 확정)
- 사용자 확인 사항: 로그인 전 첫 진입 화면은 "서비스 소개 랜딩페이지 → 버튼 눌러야
  로그인 화면"으로, 랜딩페이지를 제외한 모든 화면은 비로그인 접근 시 `/login`으로
  리다이렉트하는 것으로 확정
- 🆕 `pages/LandingPage.tsx`: `/` 에서 보여주는 공개 랜딩페이지(로그인 불필요). 서비스
  소개 + "로그인하고 관제 시작하기" 버튼(`/login`으로 이동)만 제공
- ✏️ `App.tsx`: 기존 `/`에 있던 관제 대시보드를 `/dashboard`로 이동(로그인 필요).
  `/`는 `RequireAuth` 없이 `LandingPage`를 렌더링
- ✏️ `components/layout/Header.tsx`: 메인 메뉴의 "관제 대시보드" 링크를 `/dashboard`로
  변경. 비로그인 상태에서는 유틸리티 영역에 "사용자명+로그아웃" 대신 "로그인" 버튼 노출
  (메인 메뉴는 로그인 여부와 관계없이 항상 노출하며, 비로그인 상태로 클릭하면
  `RequireAuth`가 알아서 `/login`으로 보냄)
- ✏️ `pages/LoginPage.tsx`: 로그인 성공 후 기본 이동 경로를 `/`(기존) → `/dashboard`로
  변경(사용자 확인: "로그인 성공 후 기본 화면은 관제 대시보드"). `RequireAuth`를 거쳐
  로그인한 경우엔 원래 가려던 경로로 정상적으로 돌아감
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인

### 2026-07-24 (1차 - 행안부 UI/UX 가이드라인 - 공통 레이아웃 + 로그인 화면 추가)
- 🆕 `types/auth.ts`: `AuthUser`, `UserRole` 타입 (BE `usrusrs01m` 필드명과 대응)
- 🆕 `store/authStore.ts`: 로그인 상태 zustand 스토어. BE 로그인 API가 아직 없어서
  당분간 FE 단독 mock 계정(`admin`/`viewer`)으로 동작. `sessionStorage`에 로그인 상태
  persist(새로고침해도 로그인 유지, 탭 닫으면 초기화)
- 🆕 `components/layout/IdentityBanner.tsx`: 가이드라인 Identity 영역 - 운영기관 식별자
- 🆕 `components/layout/Header.tsx`: 가이드라인 Identity 영역 - 헤더(건너뛰기 링크, 메인 메뉴,
  유틸리티 영역=로그인 사용자명/로그아웃). 기존 `App.tsx` 안에 있던 인라인 Layout에서 분리
- 🆕 `components/layout/Footer.tsx`: 가이드라인 Identity 영역 - 푸터
- 🆕 `components/layout/AppLayout.tsx`: 위 3개를 조합한 공통 레이아웃
- 🆕 `components/RequireAuth.tsx`: 로그인 안 하면 `/login`으로 리다이렉트하는 라우트 가드
- 🆕 `pages/LoginPage.tsx`: 가이드라인 로그인 영역 - 로그인 정보입력 화면. **간편인증/공동인증서/
  금융인증서/생체인증/로그인 방식 선택 화면은 외부 인증기관 연동이 필요해 이번 빅프로젝트
  범위에서 제외**하고 아이디/비밀번호 로그인만 구현. "전체 관리자로 채우기" 버튼으로
  심사/데모 시 모든 화면에 바로 접근 가능한 테스트 계정 입력 지원
- ✏️ `App.tsx`: 인라인 Layout 제거 → `AppLayout` 사용, `/login` 라우트 추가, 기존
  3개 라우트(`/`, `/scenario`, `/prediction`) 전부 `RequireAuth`로 감쌈
- 테스트 계정: `admin`/`admin1234`(전체 화면 접근), `viewer`/`viewer1234`(추후 화면별
  권한 분리 시 사용 예정, 현재는 admin과 동일하게 전체 화면 접근됨 — 권한별 화면 제한은
  아직 미구현)
- `npx tsc -b`, `npx oxlint`, `npx vite build` 모두 통과 확인
- **주의**: 이 로그인은 BE와 연동되지 않은 FE 전용 임시 mock입니다. BE에 `usrusrs01m`
  기반 실제 로그인 API가 만들어지면 `authStore.ts`의 `login()` 구현부만 axios 호출로
  교체하면 되도록 `AuthUser` 타입을 BE 엔티티 필드명에 맞춰뒀습니다.

### 2026-07-24 (지도 확대/축소·드래그 이동 추가 — 향후 구글맵 전환 대비 설계)
- 🆕 `components/HeatmapView.tsx`: 마우스 휠로 확대/축소(커서 위치 기준), 드래그로
  이동, +/−/초기화 버튼 추가
- **설계 포인트**: 상태를 `{ zoom, panX, panY }`(확대 배율 + 보이는 영역 좌상단
  좌표)로 관리하고, 지금은 이 값을 SVG `viewBox`에 반영하는 방식. 나중에 실제
  지도 API(구글맵 등)로 교체할 때는 "확대 배율 + 중심 좌표"라는 지도 API 공통
  개념에 그대로 대응되므로, 조작 로직(휠/드래그 이벤트, 버튼)은 그대로 두고
  `<svg>` 렌더링 부분만 `<GoogleMap zoom={} center={}>` 같은 컴포넌트로 교체하면
  된다는 게 핵심 아이디어. 좌표 데이터(위경도)도 안 바뀌므로 이중 변경 최소화
- React 합성 `onWheel`은 기본적으로 passive라 `preventDefault()`가 안 먹혀서(콘솔
  경고 발생), `useEffect`로 네이티브 `wheel` 리스너를 직접 등록해서 우회함
- `npx tsc -b` 통과 확인
- 참고: 에이전트 점(`circle`)의 반지름/테두리는 원본 좌표계 기준이라 확대할수록
  화면상 커짐 (지도를 확대하면 마커도 커지는 방식). 확대해도 항상 같은 픽셀
  크기를 유지하게 하려면 추후 별도 보정 필요

### 2026-07-24 (시뮬레이션 API 클라이언트 타임아웃 15초 -> 60초)
- **증상**: 예측 시뮬레이션 실행 시 `AxiosError: timeout of 15000ms exceeded`
- **원인**: `apiClient`의 전역 타임아웃(15초)이 스텝 수/유입 인원이 많은 시뮬레이션
  계산 시간보다 짧았음. BE `SimulationEngineClient.predict()`는 이미 60초까지
  기다리도록 되어 있는데 FE가 먼저 포기해버림
- ✏️ `api/client.ts`: 전역 타임아웃은 그대로 두고, `runScenarioSimulation`/
  `runPredictSimulation` 호출에만 개별적으로 60초 타임아웃 적용 (BE predict
  타임아웃과 맞춤). 시장/구역/대시보드 등 가벼운 조회는 여전히 15초

### 2026-07-24 (예측 폼 totalInflow로 변경 + FramePlayer 자동재생으로 단순화)
- ✏️ `types/index.ts`: `PredictRequest.inflowPerStep` → `totalInflow`
- ✏️ `components/PredictForm.tsx`: "스텝당 신규 유입 인원" 입력을 "총 유입 인원(전체
  스텝에 무작위 분산)"으로 변경
- ✏️ `components/FramePlayer.tsx` 전면 단순화: 재생/일시정지/이전·다음/슬라이더
  컨트롤 바를 제거하고, 결과가 들어오면 즉시 자동 재생 시작. 끝까지 재생되면
  처음부터 반복 재생. 배속 선택(0.5x~4x)만 지도 우측 상단에 작은 오버레이로 남김
  (`HeatmapView`의 좌측 상단 정보 박스/우측 하단 범례와 안 겹치게 배치)
- `npx tsc -b` 통과 확인

### 2026-07-24 (프레임 재생을 부드러운 이동 애니메이션으로 개선)
- **요청**: 프레임이 바뀔 때마다 점이 순간이동하듯 뚝뚝 끊겨서 사람이 실제로 걷는
  것처럼 안 보임
- ✏️ `HeatmapView.tsx`: `transitionMs` prop 추가. 0보다 크면 에이전트 원(`<circle>`)의
  `cx`/`cy`/`fill`에 CSS `transition`을 걸어서 다음 프레임 위치로 부드럽게 미끄러지듯
  이동하게 함. 에이전트는 이미 `agentId`로 React key가 고정돼 있어서(DOM 요소 재사용)
  트랜지션이 정상 동작함. 신규 유입 에이전트는 새 key로 마운트되니 트랜지션 없이
  스폰 위치에 바로 나타남(의도된 동작 — "이동"이 아니라 "등장"이므로)
- ✏️ `FramePlayer.tsx`: 재생 중일 때 `intervalMs`(현재 배속 기준 프레임 전환 간격)를
  그대로 `transitionMs`로 넘겨서, 다음 프레임 데이터가 반영되는 시점과 이동 애니메이션이
  끝나는 시점이 맞아떨어지도록 동기화. 일시정지/스텝 이동/슬라이더 조작 시에는
  `transitionMs=0`이라 트랜지션 없이 즉시 반영됨 (수동 탐색할 땐 안 끊기고 바로 보여야 하니까)
- `npx tsc -b` 통과 확인

### 2026-07-24 (인구 유입 예측 시뮬레이션 페이지 신규 추가)
- BE `/api/simulation/predict`(SIM `/simulate/predict` 연동)를 붙이는 새 페이지
- 🆕 `types/index.ts`: `PredictRequest`/`PredictResult`/`RiskTrendPoint`/`ZoneRiskPoint` 추가
- 🆕 `api/client.ts`: `runPredictSimulation()` 추가
- 🆕 `store/simulationStore.ts`: `predictResult`/`isPredicting` 상태 추가
- 🆕 `components/RiskTrendChart.tsx`: recharts 기반 스텝별 위험도 추이 라인 차트
- 🆕 `components/PredictForm.tsx`: 예측 스텝 수 / 스텝당 신규 유입 인원 입력 폼
- 🆕 `pages/PredictionPage.tsx`: `FramePlayer`(지도 재생) + `RiskTrendChart`(위험도 추이)를
  함께 보여줌. `FramePlayer`는 파이프라인 B 때 만든 걸 그대로 재사용
- ✏️ `App.tsx`: `/prediction` 라우트 및 네비게이션(`인구 유입 예측`) 추가
- `npx tsc -b` 통과 확인 (recharts `Tooltip formatter` 타입 이슈 한 번 겪고 수정함)
- 게이트/매대 가중치는 서버(BE/SIM)에서 DB 값으로 처리하므로 FE 폼에는 노출하지 않음
  (steps/inflowPerStep만 입력받음)

### 2026-07-24 (프레임 재생 플레이어 추가)
- 🆕 `components/FramePlayer.tsx` 추가 — `AgentState[][]`(스텝별 프레임)를 받아 재생/일시정지,
  이전·다음 스텝 이동, 슬라이더로 임의 스텝 이동, 배속(0.5x/1x/2x/4x) 조절 지원. 내부적으로
  현재 스텝의 `agents`만 `HeatmapView`에 넘기는 방식이라 `HeatmapView` 자체는 수정 없음
- ✏️ `pages/ScenarioPage.tsx`: 기존엔 `scenarioResult.frames`의 **마지막 프레임만** 정적으로
  보여줬는데(`frames[frames.length - 1]`), 이제 `FramePlayer`로 전체 시뮬레이션 과정을
  재생해서 볼 수 있음
- 표시되는 경과 시간은 SIM `simulate.py`의 `STEP_DURATION_SECONDS`(현재 10초, 임시
  캘리브레이션 값)와 맞춰뒀음 — SIM 쪽 값이 바뀌면 `FramePlayer`의 `stepDurationSeconds`
  prop도 같이 맞춰야 함
- 향후 예측 시뮬레이션(관측 기반 미래 예측) 기능이 추가되면 동일 컴포넌트를 그대로
  재사용할 수 있도록 범용적으로 설계함
- `npx tsc -b` 통과 확인

### 2026-07-24 (HeatmapView 실제 렌더링 구현)
- 기존 `HeatmapView`는 구역/에이전트 개수만 텍스트로 보여주는 placeholder였음 → 실제
  SVG 기반 지도 렌더링으로 교체
- `Zone.polygonCoordinates`(GeoJSON `Polygon` 문자열, `[경도, 위도]` 순서)를 파싱해 구역을
  다각형으로 그리고, 전체 구역 폴리곤 + 에이전트 좌표를 모두 포함하는 경계 상자 기준으로
  위도/경도를 SVG 좌표계로 투영(정북 위쪽 정렬, 종횡비 유지)
- 🆕 `zoneRisks?: ZoneRisk[]` 선택적 prop 추가 — 구역별 `riskLevel`을 넘기면 위험 등급에
  따라 채우기 색상이 달라짐(low/medium/high/critical). 넘기지 않으면(파이프라인 B
  `ScenarioPage`처럼) 중립색으로 표시
- 에이전트는 `state`(normal/congested/evacuating)에 따라 색상이 다른 점으로 표시, 범례 추가
- `pages/DashboardPage.tsx`에서 `dashboardSnapshot.zones`로부터 `zoneRisks` 배열을 만들어
  전달하도록 연결
- `npx tsc -b` 통과 확인, 폴리곤 파싱/좌표 투영 로직 별도 스크립트로 실행 검증 완료
- 여전히 미구현: 애니메이션(시나리오 프레임 재생), 인터랙션(구역 클릭 시 상세 정보 등)

### 2026-07-24 (파이프라인 A FE 정렬 — SIM 실시간 스냅샷 계약에 맞춤)
- BE `/dashboard/snapshot`이 SIM `/simulate/snapshot`을 실제로 호출하도록 바뀌면서
  `marketId`를 필수 쿼리 파라미터로 요구하게 됨. FE가 여전히 구계약(`snapshotTime`만
  전달)으로 되어 있어 정렬 필요했음
- ✏️ `types/index.ts`: `ZoneResult` 타입 추가, `DashboardSnapshot`을 기존
  `snapshotTime/crowdDensities/risks/agents` 구조에서
  `marketId/marketName/mode/step/overallRiskScore/zones/agents/persistedRiskRows`로 전면 교체
- ✏️ `api/client.ts`: `fetchDashboardSnapshot(marketId, { capturedAt, persistRisk, includeAgents })`
  로 시그니처 변경 (기존 `snapshotTime?: string` 단일 인자 → marketId 필수)
- ✏️ `hooks/useSimulationData.ts`: 시장 목록이 로드되어 `marketId`를 알 수 있을 때까지
  스냅샷 조회를 미루도록 재작성 (`markets[0]?.marketId` 사용)
- ✏️ `pages/DashboardPage.tsx`: `RiskScorePanel`/`AlertLogTable`은 그대로 두고, SIM이 내려주는
  `zones`(구역별 위험도)를 기존 `Risk[]` 형태로 임시 변환해서 넘기는 방식 적용 (파이프라인 B
  `ScenarioPage`의 `finalRiskScore` → `Risk[]` 변환과 동일 패턴)
  - ⚠️ SIM 스냅샷은 구역별 `riskId`/`detectedAt`을 따로 안 줘서 `zoneId`를 `riskId`로 대체,
    `detectedAt`은 조회 시각으로 근사함. 정확한 이력 추적 필요해지면 재검토 필요
- `npx tsc -b` 통과 확인 (에러 0건)
- 여전히 미구현: `HeatmapView`는 placeholder 그대로 (구역/에이전트 개수만 텍스트로 표시,
  실제 지도/애니메이션 렌더링 없음)

### 2026-07-23 (레이더/음향 센서 완전 제거)
- `types/index.ts`의 `RiskScore.contributingFactors`에서 `acoustic`/`flowRate` 필드 제거
  (`density`/`bottleneck`만 남음) — BE/SIM에서 레이더/음향 센서를 완전히 제거하면서 응답에
  더 이상 해당 필드가 오지 않기 때문. 이 필드를 화면에 직접 표시하는 컴포넌트는 없어서
  런타임 영향은 없었음
- 타입체크(`npx tsc -b --noEmit`) 통과 확인

### 2026-07-23 (Market/Zone 마이그레이션 + 파이프라인 B)
- **⚠️ Market/Zone 마이그레이션 복구**: 이 저장소는 한때 `SpatialNode` 기반 구계약으로 되돌아간 적이 있었음
  (로컬 작업본이 GitHub에 push되지 않은 채 유실됨). 현재는 `Market`/`Zone`/`CrowdDensity`/`Risk` 기반의
  새 계약으로 복구된 상태 — `src/` 전체가 이 계약을 일관되게 쓰고 있는지 항상 함께 확인할 것
- **파이프라인 B(BE 계약) 정렬**
  - `types/index.ts`: `AgentState.nodeId` → `zoneId`로 명명 정정 + `latitude`/`longitude` 추가,
    `ScenarioRequest`에 `marketId` 추가, `eventNodeId` → `eventZoneId`로 이름 변경
  - `ScenarioForm.tsx`: `marketId` prop 추가, 제출 body에 포함 (기존에는 `eventZoneId` 값을
    `eventNodeId` 필드명으로 우회 전송하던 임시 코드였음 — 실제 필드명으로 정정)
  - `ScenarioPage.tsx`: `<ScenarioForm>`에 `marketId` 전달
  - BE ↔ SIM 통합 테스트까지 완료된 계약을 그대로 따름 (`frames`/`evacuationTimeSeconds`/`finalRiskScore`)

