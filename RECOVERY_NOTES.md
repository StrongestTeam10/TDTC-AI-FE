# FE 복구 안내 (2026-07-23)

## 왜 이 zip이 필요한가

현재 GitHub `TDTC-AI-FE` main 브랜치는 `SpatialNode` 기반의 예전 API 계약을 그대로 쓰고 있습니다
(`fetchSpatialLayout`, `spatialLayout`, `layout` prop 등). 인계 문서의 우선순위 3번
"프론트엔드 API 계약 재정렬(Market/Zone 분리)"에 해당하는 마이그레이션이 로컬에서는 이미
완료되어 있었지만, GitHub에는 한 번도 push되지 않은 상태였습니다. 이번에 컴퓨터가 바뀌면서
그 로컬 작업본이 유실되었고, 이 zip이 그 마이그레이션을 복구한 것입니다.

## 이 zip에 포함된 것

`src/` 전체 (이 대화 세션 시작 시점에 업로드해주신 FE 원본 = **이미 Market/Zone 마이그레이션이
끝난 버전**)에, 이번 세션에서 진행한 **파이프라인 B(BE/SIM 계약 정렬)** 관련 수정 3개 파일이
반영된 최종 상태입니다.

## 반드시 GitHub main과 함께 적용해야 하는 이유

GitHub main의 다른 파일들(`api/client.ts`, `store/simulationStore.ts`, `components/HeatmapView.tsx`,
`components/RiskScorePanel.tsx` 등)은 여전히 `SpatialNode` 구조를 기대합니다. 이번 zip의
`src/` 폴더로 **통째로 덮어써야** 빌드가 깨지지 않습니다. 일부 파일만 골라 옮기면 타입 불일치로
컴파일 에러가 납니다.

## 파이프라인 B 관련 이번 세션 변경분 (참고용)

| 파일 | 변경 내용 |
|---|---|
| `src/types/index.ts` | `AgentState.nodeId → zoneId` + `latitude`/`longitude` 추가, `ScenarioRequest`에 `marketId` 추가, `eventNodeId → eventZoneId` |
| `src/components/ScenarioForm.tsx` | `marketId` prop 추가, 제출 body에서 실제 필드명(`eventZoneId`)으로 정직하게 전송 |
| `src/pages/ScenarioPage.tsx` | `<ScenarioForm>`에 `marketId` 전달, 사소한 placeholder 코드 정리 |

## 적용 후 확인 방법

```bash
npm install
npx tsc -b --noEmit   # 타입 에러 없어야 정상
npm run dev
```

## 함께 확인해주셔야 할 것 (제가 판단할 수 없는 부분)

- BE/SIM 쪽도 이번 세션에서 함께 드린 zip이 아직 GitHub에 반영 안 되어 있었습니다. FE만 먼저
  push하면 파이프라인 B 통합 테스트가 다시 깨질 수 있으니, BE/SIM zip도 같이 적용 후 push
  권장드립니다.
- `git add -A && git commit`을 이번엔 꼭 로컬에 먼저 해두시길 다시 한 번 권해드립니다.
