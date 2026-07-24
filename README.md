# market-digital-twin-frontend

전통시장 AI 안전탐지 관제 솔루션 - 프론트엔드 (React + Vite + TypeScript + Tailwind v4)

## 변경 이력

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
  금융인증서/생체인증/로그인 방식 선택 화면은 외부 인증기관 연동이 필요해 이번 캡스톤
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

## 구조
- `src/pages/DashboardPage.tsx` : 파이프라인 A (실측 기반 관제 대시보드)
- `src/pages/ScenarioPage.tsx` : 파이프라인 B (사용자 지정 시나리오 시뮬레이션)
- `src/components/` : 재사용 UI 컴포넌트 (히트맵, 위험도 패널, 폼, 알림 테이블)
- `src/api/client.ts` : Spring Boot 백엔드 API 클라이언트 (axios)
- `src/store/simulationStore.ts` : zustand 전역 상태
- `src/types/index.ts` : 백엔드 DTO와 필드명을 일치시켜야 하는 공통 타입

## 로컬 개발
```bash
npm install
npm run dev
```

## 빌드
```bash
npm run build   # dist/ 에 정적 산출물 생성
npm run preview # 빌드 결과 로컬 확인
```

## 배포 (수동)
```bash
./deploy.sh
```
`deploy.sh` 내 `CLOUDFRONT_DISTRIBUTION_ID`는 CloudFront 배포 생성 후 채워야 캐시 무효화가 동작합니다.
현재는 CloudFront 기본 URL(`*.cloudfront.net`)로 배포하고, 도메인은 추후 ACM(us-east-1) + Route53 연결 예정입니다.

## 배포 (GitHub Actions 자동화)
`.github/workflows/deploy.yml`이 main 브랜치 push 시 자동 배포합니다.
아래 GitHub Secrets 등록이 필요합니다:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID` (CloudFront 배포 생성 후 등록)
- `VITE_API_BASE_URL` (Spring Boot API 배포 후 실제 주소로 등록)

## 백엔드 연동 주의사항
- `src/types/index.ts`의 타입은 Spring Boot DTO와 필드명을 반드시 일치시킬 것 (camelCase 기준)
- 파이프라인 B 요청 시 `marketId`(필수), `eventZoneId`(선택, `scenarioType`이 `none`이면 생략 가능)를 정확한 필드명으로 보낼 것 — 예전 `eventNodeId`는 더 이상 유효하지 않음
- CORS: Spring Boot 쪽에서 이 프론트엔드의 CloudFront 도메인을 allowed origin으로 등록 필요
