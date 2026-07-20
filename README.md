# market-digital-twin-frontend

전통시장 AI 안전탐지 관제 솔루션 - 프론트엔드 (React + Vite + TypeScript + Tailwind v4)

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
- CORS: Spring Boot 쪽에서 이 프론트엔드의 CloudFront 도메인을 allowed origin으로 등록 필요
