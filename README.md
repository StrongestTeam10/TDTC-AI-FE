# TDTC-AI-FE

전통시장 AI 안전탐지 관제 솔루션 — 프론트엔드

React 19 · Vite · TypeScript · Tailwind CSS v4 · zustand · Recharts

> 변경 이력은 [CHANGELOG.md](./CHANGELOG.md) 참고

---

## 빠른 시작

```bash
npm install
cp .env.example .env.development   # 값을 채운 뒤
npm run dev                        # http://localhost:5173
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사(`tsc -b`) 후 `dist/` 생성 |
| `npm run preview` | 빌드 결과 로컬 확인 |
| `npm run lint` | oxlint |

> `npm run build`는 타입 오류가 하나라도 있으면 실패합니다. PR 전에 꼭 돌려주세요.

---

## 아키텍처 상 위치

FE는 **서버 두 곳**을 직접 호출합니다. 시뮬레이션 엔진(SIM)은 BE를 거쳐서만 닿습니다.

```text
                    ┌──────────────► [Java BE :8080] ──► [SIM :8000]  FastAPI + Mesa
[TDTC-AI-FE]  ──────┤                  Spring Boot     └► [PostgreSQL] Supabase
  React / Vite      │
                    └──────────────► [CCTV AI :8088]  FastAPI (REST + WebSocket)
```

| 대상 | 클라이언트 | 인증 | 비고 |
|---|---|---|---|
| Java BE | `src/api/client.ts` | JWT (`Authorization` 헤더 자동 첨부) | 401이면 자동 로그아웃 |
| CCTV AI | `src/api/cctvClient.ts` | 없음 | 로컬 GPU + ngrok. **JWT를 붙이면 안 됨** |

---

## 환경변수

`.env.development`(로컬) / CodeBuild 환경변수(운영). 자세한 설명은 [`.env.example`](./.env.example) 참고.

| 변수 | 설명 |
|---|---|
| `VITE_API_BASE_URL` | Java BE 주소. **끝에 `/api` 필수** |
| `VITE_KAKAO_JS_KEY` | 카카오 지도 JS 키 (도메인 제한 필수) |
| `VITE_CCTV_API_BASE_URL` | CCTV AI 서버 (REST) |
| `VITE_CCTV_WS_URL` | CCTV AI 서버 (WebSocket). HTTPS 페이지에서는 `wss://` |

> ⚠️ CCTV AI는 **8088**입니다. 8000은 SIM이 쓰므로 잘못 넣으면 WS 핸드셰이크가 SIM으로 가서 403으로 보입니다.

---

## 화면 구성

권한 코드는 `ROL01` 관리자 · `ROL02` 관제요원 · `ROL03` 조회자, 소속은 `ORGKT` KT · `ORGGV` 지자체 · `ORGMA` 상인회입니다.

| 경로 | 화면 | 접근 권한 |
|---|---|---|
| `/` | 랜딩 (서비스 소개) | 누구나 |
| `/login` `/signup` `/forgot-password` `/reset-password` | 인증 | 누구나 |
| `/compare` | **시뮬레이션 비교** — 개입 전/후 듀얼 맵 + 정책 보고서 | ROL01 · ROL02 |
| `/scenario-history` | 시나리오 이력 · 보고서 다운로드 | ROL01 · ROL02 |
| `/dashboard` | 관제 대시보드 — 실시간 CCTV AI | ROL01 · ROL02 |
| `/facilities` | 시장 구조 등록 — 상점 · CCTV 구역 · 시장 오브젝트 | ROL01 · ORGMA |
| `/board/**` | 게시판 | 로그인한 모든 사용자 |
| `/admin/users` | 회원관리 · 회원 승인 | ROL01 |

**권한 판정은 [`src/auth/permissions.ts`](./src/auth/permissions.ts) 한 곳에서만 합니다.** 헤더 메뉴 노출과 라우트 가드가 같은 함수를 쓰므로 조건이 어긋나지 않습니다.

```ts
homePathFor(user)   // 로그인 직후·가드 거부 시 돌아갈 화면
  관제 권한          → /compare
  시장 구조 등록 권한 → /facilities
  그 외              → /board
```

> ⚠️ `homePathFor`는 **그 사용자가 실제로 들어갈 수 있는 경로만** 돌려줘야 합니다. 가드 3개가 모두 이 함수로 되돌려 보내기 때문에, 못 가는 경로를 주면 무한 리다이렉트가 납니다.

화면 노출을 정리하는 용도일 뿐이고, **최종 차단은 BE**가 합니다(`SecurityConfig`의 `/api/dashboard/**`, `/api/simulation/**` 규칙).

---

## 두 개의 시뮬레이션 파이프라인

`/compare` 한 화면에서 둘을 **동시에 실행해 나란히 비교**합니다.

| | 개입 전 (Before) | 개입 후 (After) |
|---|---|---|
| API | `POST /api/simulation/predict` | `POST /api/simulation/run` |
| 성격 | 비교 기준 (현행 유지) | 사용자가 건 개입 반영 |
| 공통 | 유입 인원 · 스텝 수 · 화재 이벤트 · 시장 구조 등록의 현행 오브젝트 | |
| After 전용 | | 오브젝트 추가·삭제, 통로 정책, 게이트 개폐 |

- 두 요청은 `Promise.allSettled`로 **동시에** 나가고, 한쪽이 실패해도 성공한 쪽은 그립니다.
- 시뮬레이션은 오래 걸려 **타임아웃이 5분**입니다(공용 15초와 별도).
- 실행 결과로 정책 보고서(DOCX)를 만들 수 있습니다. 생성에 1~3분 걸립니다.

---

## 프로젝트 구조

```text
src/
├─ pages/          화면 단위 컴포넌트 (라우트와 1:1)
├─ components/
│  ├─ cctv/        관제 대시보드 (CCTV AI 실시간 스트림)
│  ├─ layout/      AppLayout · Header · Footer · IdentityBanner
│  ├─ legal/       이용약관 · 개인정보처리방침
│  ├─ ui/          Spinner · ErrorBanner · TabButton · InfoTooltip · ThemeToggle
│  ├─ Require*.tsx 라우트 접근 가드
│  ├─ HeatmapView.tsx        시뮬레이션 지도 (SVG 직접 렌더)
│  └─ FacilityLocationPicker.tsx  시장 구조 등록 지도 (카카오맵)
├─ api/
│  ├─ client.ts       Java BE (axios + JWT 인터셉터)
│  └─ cctvClient.ts   CCTV AI (별도 인스턴스 — 인증 체계가 다름)
├─ auth/           권한 판정 · 토큰 보관
├─ hooks/          useCommonCodes · useCctvStream · useReportGeneration 등
├─ store/          zustand (auth · simulation · theme)
├─ constants/      공통코드 폴백 · 약관 문구
├─ types/          BE DTO와 필드명을 맞춘 공통 타입
└─ utils/          좌표 계산 · 에러 메시지 변환 등
```

### 지도가 두 종류인 이유

| | 쓰는 곳 | 방식 |
|---|---|---|
| `HeatmapView` | 시뮬레이션 비교 | SVG 직접 렌더 — 수백 명의 에이전트를 매 프레임 다시 그려야 해서 지도 SDK로는 느립니다 |
| `FacilityLocationPicker` | 시장 구조 등록 | 카카오맵 — 실제 지번·건물을 보며 좌표를 찍어야 합니다 |

---

## 개발할 때 알아둘 것

### 공통코드는 반드시 API에서

권한·소속기관·시장·게시판 카테고리 같은 코드값은 DB(`comcode01m`)가 유일한 출처입니다. 화면에 표를 만들어 두지 마세요.

```ts
const { options, labelOf } = useCommonCodes('MKT');   // ROL · ORG · LVL · POL · MKT · BCT
labelOf('MKTMW')   // '망원시장'
```

도메인별 캐시가 훅 안에 있어 **같은 도메인은 앱 전체에서 요청이 한 번**입니다. `constants/*.ts`의 상수는 네트워크 실패 시 폴백일 뿐입니다.

### 타입은 BE DTO와 맞춥니다

`src/types/index.ts`의 필드명은 Spring Boot DTO와 정확히 일치해야 합니다(camelCase). 어긋나면 컴파일은 통과하고 런타임에 `undefined`로 조용히 깨집니다.

### 다크 모드

Tailwind v4는 `.dark` 클래스 기반입니다(`src/index.css`의 `@custom-variant`). **새 색을 넣을 때 `dark:` 짝을 같이 넣어주세요** — 한쪽만 넣으면 반대 테마에서 글자가 배경에 묻힙니다.

---

## 배포

**AWS CodePipeline (`FE-ST10-github`)** 이 유일한 배포 경로입니다.

```text
GitHub push → CodeBuild (buildspec.yml → npm ci && npm run build) → S3 → CloudFront
```

`VITE_*` 환경변수는 **빌드 시점에 번들로 들어가므로** CodeBuild 프로젝트 설정의 "환경 변수"에 등록해야 합니다. 소스에 커밋하지 않습니다.

<details>
<summary>다른 배포 경로 (사용하지 않음)</summary>

- `deploy.sh` — 수동 `aws s3 sync` 스크립트. `CLOUDFRONT_DISTRIBUTION_ID`가 비어 있습니다.
- `.github/workflows/build-check-manual.yml` — 자동 실행을 끄고 수동(`workflow_dispatch`) 빌드 검증용으로만 남겨둔 워크플로입니다.

두 경로를 함께 살려두면 어느 쪽이 실제 배포인지 헷갈려서 CodePipeline으로 통일했습니다.
</details>

---

## 관련 저장소

| 저장소 | 역할 |
|---|---|
| [TDTC-AI-BE](https://github.com/StrongestTeam10) | Spring Boot API · 인증 · 게시판 · 보고서 |
| [TDTC-AI-SIM](https://github.com/StrongestTeam10) | FastAPI + Mesa 시뮬레이션 엔진 · 보고서 생성 |
| [TDTC-AI-CCTV](https://github.com/StrongestTeam10) | CCTV 영상 AI 파이프라인 (YOLO · CSRNet · 3D BEV) |
| [TDTC-AI-INFRA](https://github.com/StrongestTeam10) | Terraform 인프라 |
