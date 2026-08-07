# Changelog

이 파일은 Claude와의 작업 세션에서 변경된 내용을 기록합니다.
각 항목은 zip으로 전달된 시점 기준입니다.

### 2026-08-07 (푸터에 개인정보처리방침 / 이용약관 전문 팝업 추가)
- **요청**: KT AIVLE EDU 사이트의 개인정보처리방침·이용약관 HTML을 참고자료로 전달받고,
  "내 FE 소스에 맞게 수정해서" 푸터에 팝업으로 넣어달라는 요청
- ➕ `components/legal/LegalDocModal.tsx`: 열람 전용 팝업. Esc 닫기, 배경 스크롤 잠금,
  표가 들어가므로 `max-w-3xl`. 회원가입의 `TermsModal`과 분리한 이유는 그쪽이 "끝까지
  스크롤해야 동의 버튼 활성화 + onConfirm으로 체크박스 연동"이라는 동의 절차 전용이기 때문
- ➕ `components/legal/LegalDocParts.tsx`: 두 문서가 공유하는 조문/항/호/표 표시 요소.
  `ClauseList`는 조문 중간에 표가 끼어 목록이 갈릴 때 항 번호가 ①로 되돌아가지 않도록
  `start` prop을 받음
- ➕ `components/legal/PrivacyPolicyDocument.tsx` (제1~12조)
- ➕ `components/legal/TermsOfServiceDocument.tsx` (제1~6장, 제1~16조 + 부칙)
- ✏️ `components/layout/Footer.tsx`: "개인정보처리방침"/"이용약관" 버튼 추가
- **⚠️ 원문을 그대로 옮기지 않은 이유**: 전달받은 문서는 KT의 AIVLE EDU 교육 플랫폼용이라
  주체가 "KT(이하 회사)"이고, 주민등록번호 수집·대한상공회의소/고용노동부 등 6개사 제3자
  제공·케이티씨에스 등 5개 수탁사·실명 보호책임자(3인)와 실제 연락처가 적혀 있음. 이 중
  어느 것도 본 프로젝트에 해당하지 않아 그대로 넣으면 문서 전체가 사실과 다른 고지가 됨.
  **표준 목차 구조만 따르고 내용은 BE 코드에서 확인한 실제 처리 항목으로 채웠음**:
  - `User` 엔티티: `login_id` / `password`(해시) / `name` / `org_code` / `market_code` /
    `created_ip`·`updated_ip`(접속 IP) / `agree_*_at` / `approval_status`
  - `ExifGpsExtractor`: 시설 사진의 EXIF GPS 좌표 및 촬영일시 추출 → 제2조 다항에 명시
  - `S3FileStorageService` / `VideoS3Service`: S3 저장, 사전서명 URL 1시간
  - CCTV 파이프라인: 보행자 좌표(픽셀/BEV), 얼굴 블러 비식별화 → 제3조(영상정보) 신설
  - 수탁사는 실제로 쓰는 AWS / Supabase 2곳만 기재
- 미확정이던 항목을 데모용 값으로 확정(요청 반영). 두 문서가 함께 쓰는 값이라
  `constants/legalText.ts`에 상수로 모아둠 - 시행일이 두 문서에서 어긋나는 걸 막기 위함
  - `PRIVACY_OFFICER`: 개인정보 보호책임자 스트롱 / 02-1234-5678
  - `PRIVACY_REQUEST_OFFICER`: 열람청구 접수·처리 홍길동 / 02-1234-5678
  - `VIDEO_RETENTION_PERIOD`: 수집일로부터 24시간 (경과 시 지체 없이 파기)
  - `LEGAL_EFFECTIVE_DATE`: 2026년 8월 7일 (개인정보처리방침 제12조 + 이용약관 부칙)
  - ⚠️ 담당자 정보는 빅프로젝트 데모용 가상 값. 실제 담당자가 정해지면 이 상수만 교체
- 값을 다 채워서 미확정 표시용 `Placeholder` 컴포넌트는 제거하고, 두 문서 상단 배너의
  "노란색으로 표시된 항목은 확정 전 값입니다" 문구도 함께 삭제
- ⚠️ 법무 검토를 거치지 않은 초안이며, 문서 상단에도 그 사실을 배너로 표시함
- 검증: `npx tsc -b --force` / `npx oxlint` 통과. dev 서버에서 두 팝업 렌더, Esc 닫기,
  배경 스크롤 잠금/복구, 항 번호 연속성(④로 이어짐) 확인. 375px 모바일에서 표 6개가
  각자 가로 스크롤되고 페이지 자체는 가로로 넘치지 않음을 확인

### 2026-08-06 (CCTV 관제 대시보드 iframe 제거 + JS → React 이관 + WebSocket 연동)
- **요청**: 관제 대시보드가 `public/mangwon`에 iframe으로 이상하게 붙어 있고 BE는
  CCTV 모델링 쪽만 연결돼 있다 - 현상 파악 후 React로 이관. 실시간 스트리밍을
  전제로 설계했으니 WebSocket 방식으로 살리는 방향
- **파악된 현상**:
  - `DashboardPage.tsx`가 React 구현을 전부 주석 처리한 채 `<iframe src="/mangwon/index.html">`
    하나만 렌더링. iframe 안이라 `position:fixed` 오버레이(드로어/모달/비상 백드롭 8곳)가
    앱 뷰포트를 못 덮고, 로그인 JWT가 전달되지 않고, 앱 다크모드와 따로 놀았음
  - `<source src="../results/cctv_mangwon_raw_video.mp4">`가 항상 404 (`public/`에 해당 폴더 없음)
  - `dashboard.js`에 `throw new Error('API 연동 임시 차단')`과 WebSocket 초기화 `return`이
    박혀 있어 화면 숫자가 전부 `real_frame_data.js`의 정적 604프레임 배열이었음
  - 차단을 풀어도 안 붙는 상태였음: dashboard.js가 부르는 `localhost:8000`의
    `/api/v1/cctv/*`, `/ws/cctv-stream`은 현행 `ai_server.py`(8088)에 없고
    `legacy_archive/old_scripts/api_server.py`에만 있는 구버전 스펙
  - BE에 CCTV 읽기 API(`/api/ai/*`, `/api/v1/video-clips`, `/api/v1/external-factors`)가
    이미 있는데 `client.ts`에 대응 함수가 하나도 없었음 (쓰기만 연결, 읽기는 공백)
- 🗑️ `public/mangwon/` 전체 삭제 (index.html / css/styles.css / js/dashboard.js /
  js/real_frame_data.js). 내용은 아래로 전부 이관됨
- ✏️ `pages/DashboardPage.tsx`: iframe 제거, `CctvControlDashboard` 렌더로 교체
- ➕ `components/cctv/`: `CctvControlDashboard`(컨테이너) + `CctvHeaderBar` /
  `CctvVideoPanel` / `CctvMetricCards` / `CctvWeatherCard` / `CctvWeatherTimeline` /
  `CctvWeatherModeSlider` / `CctvSideDrawers` / `CctvRiskChartCard` /
  `CctvAlertLogModal` / `CctvEmergencyOverlay` + `CctvDashboard.module.css`
- ➕ `hooks/useCctvStream.ts`: WebSocket 연동 복구. 지수 백오프 재연결(3→6→12…초, 30초 상한),
  언마운트 시 타이머 정리, keepalive ping 추가 (원본은 3초 고정 무한 재시도 + ping 없음)
- ➕ `hooks/useCriScore.ts` / `hooks/useEmergencyTimer.ts` / `utils/criScore.ts`:
  EMA 스무딩·CRI 산출·경보 3단계 판정·15초/30초 비상 타이머를 순수 함수 + 훅으로 분리
- ➕ `api/cctvClient.ts`: FastAPI AI 서버 전용 axios 인스턴스(업로드/결과영상/데이터셋).
  Java BE용 `apiClient`와 분리한 이유는 baseURL이 다르고, 401을 세션 만료로 처리하는
  인터셉터를 AI 서버 응답에 태우면 안 되기 때문
- ✏️ `api/client.ts`: `fetchUnresolvedAlerts` / `fetchCoordinatesJson` /
  `fetchCoordinatesForFrame` / `fetchVideoClips` / `fetchExternalFactors` /
  `parseCoordinateJson` 추가 (BE에 있던 CCTV 읽기 API 연결)
- ➕ `types/cctv.ts` / `constants/weatherScenario.ts` / `data/realFrameData.ts`
- ✏️ `vite.config.ts`: `css.modules.localsConvention: 'camelCaseOnly'` 추가
  (kebab-case 클래스 39KB를 CSS Module로 들여오면서 `styles.metricCard` 형태로 접근)
- ✏️ `.env.development` / `.env.production`: `VITE_CCTV_API_BASE_URL`,
  `VITE_CCTV_WS_URL` 추가 (기존 `localhost:8000` 하드코딩 제거)
  - ⚠️ **포트 8088**. 처음에 dashboard.js의 하드코딩값 `8000`을 그대로 기본값으로
    옮겼는데, 8000은 SIM 서버(`TDTC-AI-SIM`, Dockerfile/README 기준)가 쓰는 포트라
    CCTV WS 핸드셰이크가 SIM으로 갔다. SIM엔 그 라우트가 없으니 Starlette가 accept
    없이 닫고 uvicorn이 `WebSocket /ws/cctv-stream 403` + `connection rejected
    (403 Forbidden)`으로 로깅 - 권한 문제로 오인하기 쉬운 형태였다. CCTV AI 서버는
    `ai_server.py`의 `uvicorn.run(..., port=8088)` 기준 8088이라 그쪽으로 정정
- **부수적으로 고친 원본 버그 2건**:
  - `alarmDelaySec` 슬라이더가 값만 표시되고 아무 데도 안 쓰였고, 짝인
    `dispatch-alert-overlay`(🚨 EMERGENCY DISPATCH ACTIVE)는 CSS에 `display:none`만
    있고 푸는 규칙이 없어 한 번도 표시되지 않는 죽은 DOM이었음 → 둘을 연결
  - 비상 카운트다운이 video의 `timeupdate`에 얹혀 있어 영상을 멈추면 같이 멈췄음
    → 독립 인터벌로 분리
- 외부 CDN 의존 제거: Chart.js(jsdelivr) → 이미 설치돼 있던 `recharts`로 교체
- 검증: `npx tsc -b --force` / `npx oxlint`(신규 코드 범위) / `npx vite build` 통과.
  dev 서버에서 실제 렌더 확인 - AI 서버 미실행 시 정적 폴백으로 정상 표시되고
  WebSocket은 백오프 재시도, 알람 API 401은 화면을 깨뜨리지 않음.
  ⚠️ `ScenarioPage.tsx(217)`의 `onSubmit` 타입 오류는 이전부터 있던 것으로 이번 작업과 무관
- **다음 작업 필요(FE 아님)**: 현행 `TDTC-AI-CCTV/ai_server.py`(8088)에는 WebSocket
  엔드포인트와 `/api/v1/cctv/*`가 없음. `legacy_archive/old_scripts/api_server.py`의
  `/ws/cctv-stream` + 업로드/결과영상/데이터셋 4종을 `ai_server.py`로 병합해야 실제로
  붙음. FE는 메시지 규격(`CCTV_AI_START`/`PROGRESS`/`COMPLETED`/`STREAM`)을 그대로 맞춰둠

### 2026-08-05 (4차 - 회원 승인을 별도 화면 대신 탭 하나로 통일 + 체크박스 일괄 승인/거부)
- **요청**: 지난 항목에서 발견한 "회원관리"/"회원 승인" 중복을 정리 - 별도 화면
  (`UserApprovalPage`, `/admin/approvals`)을 없애고 `UserAdminPage`의 "회원 승인"
  탭 하나로 통일. 체크박스로 승인 대상을 여러 명 선택해서 한 번에 처리할 수 있게
  스크린샷으로 UI 방향 지정해주심
- 🗑️ `pages/UserApprovalPage.tsx`, `components/RequireAdmin.tsx` 삭제
- ✏️ `pages/UserAdminPage.tsx`: "회원 승인" 탭을 `fetchAdminUsers(pendingOnly)`/
  `updateUserRole`(역할 드롭다운) 방식에서 `fetchPendingUsers`/`approveUser`/
  `rejectUser`(승인/거부 전용 API) 방식으로 교체. 체크박스 컬럼 + 상단 "선택 항목
  승인/거부" 일괄 처리 버튼 추가, 행별 개별 승인/거부 버튼도 유지. 시장 필터는 BE에
  파라미터가 없어서 프론트에서 한 번 더 걸러냄(대기자 수가 적어 성능 영향 없음).
  "사용자 관리" 탭(기존 회원 권한 변경)은 그대로 유지
- ✏️ `App.tsx`: `/admin/approvals` 라우트 제거
- ✏️ `components/layout/Header.tsx`: "회원 승인" 별도 메뉴 제거("회원관리" 메뉴 하나로 통일)
- `npx tsc -b`/`npx oxlint` 재검증: 신규 오류 없음(`BoardDetailPage.tsx` 기존 이슈는 그대로 남아있음)

### 2026-08-05 (3차 - 회원가입 관리자 승인 화면 연동 누락분 복구 + 정정)
- **정정**: 직전 항목에서 `UserApprovalPage.tsx`를 "팀원이 만든 것으로 보임"이라고
  잘못 적었습니다. 실제로는 이전 세션에서 만들어 드렸던 기능(BE `UserApprovalController`/
  `UserApprovalService`와 한 세트)인데, 새 대화창으로 넘어오면서 그 컨텍스트를 놓친
  채 "저와 무관한 이슈"로 잘못 분류했습니다
- **원인**: 2번째 사고(client.ts/App.tsx/Header.tsx 복구) 때 `PendingUser` 타입과
  `fetchPendingUsers`/`approveUser`/`rejectUser` 함수를 `client.ts`에 다시 추가하지
  않아서 `UserApprovalPage.tsx`의 import가 깨진 채로 남아있었음. 게다가 라우팅
  (`/admin/approvals`, `RequireAdmin` 가드)과 헤더 메뉴도 애초에 연결이 안 되어 있던
  상태였음(파일 자체 주석엔 "App.tsx 라우트에서 가드"라고 적혀있었는데 실제로는 누락)
- ✏️ `api/client.ts`: `PendingUser` 타입 + `fetchPendingUsers`/`approveUser`/
  `rejectUser` 추가
- ✏️ `App.tsx`: `/admin/approvals` 라우트 추가(`RequireAdmin` 가드, `RequireFacilityManager`와
  동일 패턴)
- ✏️ `components/layout/Header.tsx`: "회원 승인" 메뉴 추가(관리자 전용)
- `npx tsc -b`/`npx oxlint` 재검증: `UserApprovalPage.tsx` 관련 오류 해소 확인.
  `BoardDetailPage.tsx`의 `downloadAttachment` 인자 개수 오류는 여전히 남아있음(제가
  만들거나 건드린 파일이 아니라 확인 후 별도로 알려주시면 처리하겠습니다)
- **정리 필요 사항**: `UserAdminPage`(`/admin/users`)의 "회원 승인" 탭과
  `UserApprovalPage`(`/admin/approvals`)가 사실상 같은 기능(가입 승인 대기자 처리)을
  서로 다른 BE 엔드포인트(`UserAdminController` vs `UserApprovalController`)로 중복
  구현하고 있습니다. 지금은 둘 다 살려뒀는데, 하나로 합칠지 역할을 나눌지 결정해
  주시면 정리해드리겠습니다


- **원인**: BE 때와 같은 사고 - 직전 세션(회원관리 기능)에 드린 `client.ts`/`App.tsx`/
  `Header.tsx`가 구버전 스냅샷 기준이라, 그 사이 이미 구현돼 있던 비밀번호 찾기
  (`verifyIdentity`/`resetPassword`), 시설(상점 위치) 관리 API 전체, 다크모드
  (`ThemeToggle`), "상점 위치 등록" 메뉴, `/forgot-password`·`/reset-password`·
  `/facilities` 라우트를 전부 덮어써서 날려버림 → `authStore.ts`가 더 이상 존재하지
  않는 `resetPassword` export를 import하면서 흰 화면 + 콘솔 SyntaxError 발생
- **복구 방법**: GitHub에 이미 올라와있던 온전한 버전을 기준으로 삼고, 그 위에 제
  회원관리 기능(`fetchAdminUsers`/`updateUserRole`, `/admin/users` 라우트, 헤더
  "회원관리" 메뉴)만 다시 얹는 방식으로 재작업(지난번처럼 임의 재구성 아님)
- ✏️ `api/client.ts`: `verifyIdentity`/`resetPassword`/시설 관리 API 전체 복원 +
  `fetchAdminUsers`/`updateUserRole` 유지
- ✏️ `App.tsx`: `/forgot-password`/`/reset-password`/`/facilities` 라우트 복원 +
  `/admin/users` 라우트 유지
- ✏️ `components/layout/Header.tsx`: 다크모드(`ThemeToggle`), "상점 위치 등록" 메뉴
  복원 + "회원관리" 메뉴 유지
- `components/RequireAuth.tsx`는 이번엔 유실 없었음(변경 없음)
- 병합 후 `npx tsc -b`로 검증: 제가 건드린 3개 파일 관련 오류는 없음. 다만 검증
  과정에서 **저와 무관한 기존 이슈 2건**을 발견함(고치지 않고 그대로 둠):
  1. `pages/BoardDetailPage.tsx`의 `handleDownload`가 `downloadAttachment`를 인자
     2개로 호출하는데 실제 함수는 3개(postId, attachmentId, originalName) 필요 -
     지금 이 상태로는 전체 빌드가 안 됨
  2. `pages/UserApprovalPage.tsx`(→ 이전 세션에서 만든 기능으로 확인됨, 아래 3차
     항목 참고)가
     `fetchPendingUsers`/`approveUser`/`rejectUser`/`PendingUser`를 `api/client.ts`에서
     import하는데, 그 함수/타입 자체가 어느 버전에도 없음(페이지는 만들어졌는데
     API 연동이 아직 안 된 상태로 보임). 참고로 제가 만든 `UserAdminPage.tsx`의
     "회원 승인" 탭과 기능이 겹치는 것 같아, 정리가 필요할 수 있습니다

### 2026-08-04 (3차 - 상점 위치 등록 화면 신규, 게시판 왼쪽 탭)
- **요청**: 업로드해주신 `store-location-prototype.html`(손그림 와이어프레임)을 실제
  사이트 톤으로 재구현, 게시판 탭 왼쪽에 새 탭으로 추가. 사진 첨부 기능도 포함(지난
  세션에 만들어두고 보류했던 기능 편입). 3D 구현은 이번 범위 아님. "층/위치 메모"는
  별도 입력칸을 만들지 않고 비고 하나로 합쳐서 BE `rmk` 컬럼에 저장
- **접근 권한**: 관리자(ROL01) 또는 상인회(orgCode='ORGMA')만 탭이 보이고 화면에
  들어갈 수 있음. 나머지 역할은 탭 자체가 안 보이고, 주소를 직접 입력해도
  `RequireFacilityManager`가 `/dashboard`로 돌려보냄(실제 차단은 BE가 담당)
- 🆕 `utils/kakaoLoader.ts`: `KakaoMapView.tsx`에 있던 카카오맵 SDK 로더를 공용
  유틸로 분리(중복 제거, 이 화면도 실제 지도가 필요해서)
- 🆕 `components/FacilityLocationPicker.tsx`: 프로토타입의 손그림 SVG 지도를 대체하는
  실제 카카오맵. 클릭하면 위경도 자동 입력, 기존 등록 시설은 파란 마커, 지금 선택한
  위치는 빨간 마커로 구분. `KakaoMapView`는 시뮬레이션 구역(zones)에 강하게 엮여
  있어 재사용 대신 가벼운 전용 컴포넌트로 새로 만듦
- 🆕 `components/RequireFacilityManager.tsx`: 역할 기반 라우트 가드
- 🆕 `pages/FacilityManagePage.tsx`: 지도 + 등록/수정 폼(상점명/업종/좌표/비고/영업상태)
  + 등록 목록 테이블 + 사진 관리 패널(파일 선택 → EXIF 자동 미리보기 → 좌표 보정 →
  방향(동서남북) 선택 → 저장, 등록된 사진 썸네일 그리드 + 삭제). 관리자는 대시보드와
  동일한 시장 전환 탭, 상인회는 본인 담당 시장으로 자동 고정
- ✏️ `api/client.ts`: `fetchFacilities`/`createFacility`/`updateFacility`/
  `deleteFacility` + 사진 관련 5개 함수(`previewFacilityPhotoExif`, `saveFacilityPhoto`,
  `fetchFacilityPhotos`, `deleteFacilityPhoto`) 및 관련 타입 추가
- ✏️ `components/layout/Header.tsx`: "관제 대시보드"와 "게시판" 사이에 "상점 위치 등록"
  탭 추가(관리자/상인회에게만 노출)
- ✏️ `App.tsx`: `/facilities` 라우트 추가(`RequireAuth` + `RequireFacilityManager` +
  `AppLayout`으로 감쌈)
- ✏️ `components/KakaoMapView.tsx`: SDK 로더 부분을 `utils/kakaoLoader.ts` import로
  교체(동작 변화 없음, 순수 리팩터링)

**업종/시설유형 값**: 프로토타입은 "상점"/"출입구" 등 한글 값을 썼지만, 실제 시드
데이터와 `MarketService.getGates()`(게이트 판별 로직)는 `GATE`/`STALL` 같은 영문
대문자 코드를 쓰고 있어서 그대로 맞춤(선택지: STALL/RESTAURANT/RESTROOM/GATE/OTHER,
Korean 라벨만 화면에 표시)

**검증**: `npx tsc -b`(무관한 기존 오류 1건 외 통과), `npx oxlint`(0 errors), `npx vite build`(성공)

**참고 (사진 업로드 단계 좌표 보정)**: 이번 화면에서는 지도를 하나 더 띄우는 대신
숫자 입력 필드로 좌표를 직접 보정하도록 단순화했습니다(시설 등록 자체는 실제 지도
클릭 방식). 필요하면 다음에 사진 보정에도 지도 클릭 방식을 추가할 수 있습니다.

### 2026-08-04 (2차 - 다크모드/라이트모드 전체 적용)
- **범위**: 공통 레이아웃 + 전체 페이지/컴포넌트 한 번에 적용(요청 범위). 기본 테마는
  시스템 설정(OS `prefers-color-scheme`)을 따르고, 사용자가 수동으로 바꾸면 그
  이후로는 OS 설정 변경과 무관하게 선택한 테마 유지(다시 "시스템 설정"으로 돌아가는
  것도 가능 - 3단계 순환)
- 🆕 `store/themeStore.ts`: `mode`(`system`/`light`/`dark`) 상태 관리. `<html>`
  태그에 `dark` 클래스를 붙였다 뗐다 하는 방식(Tailwind v4 `@custom-variant dark`).
  localStorage(`tdtc-ai-theme`)에 사용자가 명시적으로 고른 테마만 저장, OS 설정
  변경은 `matchMedia` 리스너로 실시간 반영(모드가 `system`일 때만)
- 🆕 `components/ui/ThemeToggle.tsx`: 시스템 설정 → 라이트 → 다크 → 시스템 설정
  순으로 순환하는 아이콘 버튼. 아이콘 라이브러리가 프로젝트에 없어 인라인 SVG로 직접
  그림(새 의존성 추가 안 함)
- ✏️ `index.css`: `@custom-variant dark (&:where(.dark, .dark *));` 추가(Tailwind
  v4는 `tailwind.config.js` 없이 CSS에서 직접 정의). 기본 OS 미디어쿼리 방식 대신
  클래스 기반으로 바꿔야 수동 토글이 가능함. 라이트/다크 각각의 기본 배경색 지정
- ✏️ `index.html`: React 마운트 전에 저장된 테마를 먼저 적용하는 인라인 스크립트
  추가(FOUC 방지 - "다크로 잠깐 보였다가 라이트로 바뀌는" 깜빡임 없이 처음부터
  올바른 테마로 로드됨)
- ✏️ **28개 파일**: 하드코딩된 다크 전용 색상(`bg-slate-900`, `text-slate-400` 등)을
  `라이트클래스 dark:다크클래스` 쌍으로 일괄 변환(자동화 스크립트 + 수동 검수).
  구조색(배경/테두리)은 라이트 모드에서 대응하는 밝은 톤으로, 빨강/파랑/호박/주황/
  에메랄드 계열의 옅은 텍스트 색상(다크 배경 기준으로 고른 톤)은 흰 배경에서도 대비가
  확보되도록 더 진한 톤을 짝지음. 경고/에러 패널(진한 배경+테두리 조합)도 동일하게
  라이트 대응 톤 추가
- **의도적으로 제외한 3개 파일**: `HeatmapView.tsx`, `KakaoMapView.tsx`,
  `FramePlayer.tsx` - 지도/히트맵/영상 프레임 위에 겹쳐지는 범례·툴팁·컨트롤 바는
  그 아래 실제 콘텐츠(지도 타일, 히트맵 색상, 영상 프레임)가 테마와 무관하게 계속
  존재하므로, 영상 편집기 컨트롤 바처럼 앱 테마와 상관없이 항상 어둡게 고정해야
  가독성이 유지됨. 같은 이유로 `ScenarioPage.tsx`의 히트맵 위 오버레이 배지 1곳도
  개별적으로 고정 다크 유지
- ✏️ `components/layout/Header.tsx`: 로그인 여부와 무관하게 유틸리티 영역에
  `ThemeToggle` 노출(대시보드/시나리오/게시판/랜딩/404 등 `AppLayout`을 쓰는 모든
  화면에 적용됨)
- ✏️ `pages/LoginPage.tsx`, `SignupPage.tsx`, `ForgotPasswordPage.tsx`,
  `ResetPasswordPage.tsx`: `AppLayout`을 쓰지 않는 독립 화면들이라 각각 우측 상단에
  개별적으로 `ThemeToggle` 배치(회원가입/비밀번호 찾기 등 여러 화면 상태가 있는
  페이지는 모든 상태에 빠짐없이 추가)

**검증**: `npx tsc -b`(`HeatmapView.tsx`의 기존 미사용 변수 오류 1건 외 통과 - 이번
변경과 무관), `npx oxlint`(0 errors, 기존 `KakaoMapView.tsx` warning 3건 외 없음),
`npx vite build`(성공)

### 2026-08-04 (로그인 화면 - 비밀번호 찾기 신규, 회원가입 버튼 우상단으로 이동)
- **요청**: 회원가입 링크를 눈에 덜 띄는 하단에서 화면 우측 상단 버튼으로 옮기고,
  그 자리(하단)에 비밀번호 찾기를 넣어줄 것. 상점 외관 사진 업로드 기능은 이번
  세션에서 보류(BE는 이미 구현돼 있으나 이번 딜리버리에는 미포함)
- **본인확인 방식**: `usrusrs01m`에 이메일/휴대폰 컬럼이 없어 이메일 인증코드
  방식은 불가 → 재재님 결정으로 회원가입 때 입력한 필드(아이디+이름+소속기관+
  담당시장) 일치 여부만으로 확인. BE에 `/api/auth/verify-identity`,
  `/api/auth/reset-password` 두 엔드포인트가 아직 없음 - 다음 세션에 BE 쪽 구현 필요
- 🆕 `pages/ForgotPasswordPage.tsx`: 아이디/이름/소속기관/담당시장 입력 → 본인확인 →
  성공 시 `/reset-password`로 이동(입력값을 `location.state`로 함께 전달)
- 🆕 `pages/ResetPasswordPage.tsx`: 새 비밀번호 입력(회원가입과 동일한 비밀번호 규칙
  체크리스트 재사용) → 재설정 API 호출. `location.state`에 본인확인 결과가 없으면
  (URL 직접 접근 등) 비밀번호 찾기 화면으로 돌려보냄. 재설정 API 호출 시에도
  본인확인 4개 필드를 함께 보내 서버가 다시 검증하도록 함(브라우저 state 조작으로
  본인확인 단계를 우회하는 것에 대한 최소한의 방어 - 실제 방어는 BE가 필드 일치를
  다시 검사해야 완성됨)
- ✏️ `pages/LoginPage.tsx`: 하단 "계정이 없으신가요? 회원가입" 링크를 "비밀번호를
  잊으셨나요? 비밀번호 찾기"로 교체(`/forgot-password`로 이동). 회원가입은 화면
  우측 상단 버튼으로 분리
- ✏️ `api/client.ts`: `verifyIdentity`/`resetPassword` 함수 및 요청/응답 타입 추가
  (`/api/auth/verify-identity`, `/api/auth/reset-password`). 401 응답 시 자동
  로그아웃 처리 예외 목록에도 두 엔드포인트 추가(로그인 전 상태에서 쓰는 흐름이라
  로그인/회원가입과 동일하게 취급)
- ✏️ `store/authStore.ts`: `verifyIdentity`/`resetPassword` 액션 추가(기존
  `signup`과 동일한 try/catch + 에러 메시지 변환 패턴)
- ✏️ `App.tsx`: `/forgot-password`, `/reset-password` 라우트 추가(둘 다 로그인
  화면과 동일하게 `RequireAuth` 밖 - 비로그인 상태에서 접근하는 흐름)

**검증**: `npx oxlint`(0 errors) / `npx vite build`(성공) 통과. `npx tsc -b`는
`HeatmapView.tsx`(104행, `renderWidth` 미사용 변수)에서 기존부터 있던 오류 1건이
있음 - 이번 세션에서 손대지 않은 파일이며 이번 변경과 무관.

**다음에 할 일**: BE에 `POST /api/auth/verify-identity`, `POST /api/auth/reset-password`
구현 필요(둘 다 `permitAll`, 아이디+이름+소속기관+담당시장 일치 여부로 본인확인 후
비밀번호 변경). 구현 전까지는 이 화면들이 실제로 동작하지 않음(BE 라우트 없음).

### 2026-07-27 (파이프라인 A 대시보드 - 관리자 전용 시장 전환 탭, 폴링 주기 2초 반영)
- **요청**: 상인회/지자체는 본인 담당 구역만, 관리자는 전체 + 페이지(시장) 전환
  가능하게(게시판과 동일한 패턴) - BE 권한 분리에 대응하는 FE 작업
- 🆕 `components/ui/TabButton.tsx`: `BoardListPage.tsx` 안에만 있던 지역 컴포넌트를
  공용 컴포넌트로 분리(게시판/대시보드가 동일한 탭 스타일 공유)
- ✏️ `pages/BoardListPage.tsx`: 지역 `TabButton` 정의 제거, 공용 컴포넌트 import로 교체
  (동작 변화 없음, 순수 리팩터링)
- ✏️ `pages/DashboardPage.tsx`:
  - `useAuthStore`에서 `user.rulesCode === 'ROL01'`으로 관리자 여부 판정
  - 관리자에게만 게시판과 동일한 스타일의 시장 전환 탭 노출(`markets` 배열을 순회).
    비관리자는 BE `/markets` 응답 자체가 본인 담당 시장 1개로 이미 필터링되어
    내려오므로 탭이 필요 없음(게시판의 "관리자 시장 탭 결정"과 동일한 판단)
  - `selectedMarketId` 상태 추가, 시장 목록 로드 후 아직 선택 전이면 첫 번째 시장을
    기본값으로 확정(탭 active 표시와 실제 조회 중인 시장을 항상 일치시키기 위함)
  - 자동 갱신 표시 문구 "10초마다" → "2초마다"로 수정(`DASHBOARD_POLL_INTERVAL_MS`를
    2초로 바꾸신 것과 동기화)
- ✏️ `hooks/useSimulationData.ts`:
  - `DASHBOARD_POLL_INTERVAL_MS`: 10초 → 2초
  - `marketIdOverride` 파라미터 추가: 관리자가 탭으로 선택한 시장을 우선 사용하고,
    없으면(비관리자, 또는 관리자가 아직 선택 전) 로드된 시장 목록의 첫 번째를 사용
  - 기존엔 "시장 목록 로드" 안에서 곧바로 markets[0]의 구역까지 함께 불러왔는데
    (단일 시장 가정), 관리자가 탭으로 시장을 전환할 때마다 새로 선택된 시장의 구역을
    다시 불러와야 해서 "시장 목록 로드"와 "구역 로드"를 별도 effect로 분리
- `npx tsc -b && npx oxlint && npx vite build` 전부 통과 확인 완료

### 2026-07-27 (파이프라인 A 대시보드 레이아웃 - 트윈 반응형 확장 + 알림 이력 테이블 우측 컬럼 이동)
- **요청**: 트윈(HeatmapView) 우측의 빈 공간을 채우고, 하단에 별도로 있던 "구역별
  위험 알림 이력" 테이블을 "최고 위험 구역" 패널 아래로 이동
- ✏️ `components/HeatmapView.tsx`:
  - `width` prop을 고정 기본값(640) 없이 옵셔널로 변경. `width`를 명시적으로 넘기지
    않으면 컨테이너를 `ResizeObserver`로 관찰해 실제 렌더링 너비(`measuredWidth`)를
    구해 좌표 투영/뷰포트 계산에 사용
  - 컨테이너 `style.width`를 고정 픽셀 대신 `width ?? '100%'`로 변경해 부모(그리드
    셀) 너비를 그대로 채우도록 함(기존엔 항상 640px로 고정돼 넓은 화면에서 우측에
    빈 공간이 남았음)
  - 확대/축소·투영 계산에 쓰이던 `width` 참조를 전부 `renderWidth`(= 명시적 width
    ?? measuredWidth)로 교체. `height`(기본 480)는 기존과 동일하게 고정
- ✏️ `pages/DashboardPage.tsx`:
  - 우측 컬럼을 `RiskScorePanel` + "구역별 위험 알림 이력"(`AlertLogTable`) 세로
    스택으로 재구성. 기존에 그리드 하단에 전체 폭으로 따로 있던 테이블 섹션을
    제거하고 우측 컬럼 안으로 이동
  - `HeatmapView` 호출부에서 `width`를 넘기지 않으므로 좌측 컬럼(`lg:col-span-2`)
    폭에 맞춰 자동으로 채워짐
- `npx tsc -b && npx oxlint && npx vite build` 전부 통과 확인 완료

### 2026-07-26 (파이프라인 A 대시보드 실시간 자동 갱신(폴링) 추가)
- **배경**: "전통시장 실시간 위험도 관제" 화면이지만 지금까지는 최초 진입 시 또는
  수동 새로고침 버튼을 눌러야만 데이터가 갱신됐음(자동 갱신 없음)
- ✏️ `hooks/useSimulationData.ts`:
  - `DASHBOARD_POLL_INTERVAL_MS`(10초) 주기로 `loadSnapshot()`을 자동 재호출하는
    폴링 `useEffect` 추가
  - 폴링은 `capturedAt`이 없는 "최신(실시간)" 모드에서만 동작. 과거 특정 시점을
    선택했을 때는 고정된 스냅샷을 보는 것이므로 폴링하지 않음
  - `isFetchingRef`로 이전 요청이 끝나기 전 겹쳐서 호출되는 것을 방지(네트워크
    지연 시 폴링 주기보다 응답이 늦게 오는 경우 대비)
  - `document.visibilitychange` 이벤트로 탭이 백그라운드로 가면 폴링을 멈추고,
    다시 포그라운드로 돌아오면 즉시 1회 갱신 후 폴링 재개(불필요한 API 호출 절감)
  - 훅 반환값에 `isPolling` 추가
- ✏️ `pages/DashboardPage.tsx`: `isPolling`이 `true`일 때 제목 옆에 "10초마다 자동
  갱신 중" 표시(pulse 애니메이션 점) 추가해 사용자가 자동 갱신 여부를 알 수 있게 함
- `npx tsc -b && npx oxlint && npx vite build` 전부 통과 확인 완료

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

