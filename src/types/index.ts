// 공통 도메인 타입 정의
// Spring Boot 백엔드의 DTO와 필드명을 반드시 일치시킬 것

export interface AgentState {
  agentId: number;
  zoneId: number;
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  state: 'normal' | 'congested' | 'evacuating';
  agentType: string;
  actionState: string;
  // 2026-08-XX 추가: 현재 구역 위험도(0~100). 지도에서 빨강/노랑/파랑 색 구분에 사용.
  dangerLevel?: number;
}

export interface CrowdDensity {
  crowdDensityId: number;
  marketId: number;
  zoneId: number;
  visitorCount: number;
  densityScore: number;
  statusLevel: string;
  capturedAt: string;
}

export interface Risk {
  riskId: number;
  marketId: number;
  zoneId: number;
  riskScore: number;
  riskLevel: string;
  reasonCode: string;
  detectedAt: string;
}

export interface RiskScore {
  timestamp: string;
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  contributingFactors: {
    density: number;
    bottleneck: number;
  };
}

// 파이프라인 A 스냅샷의 구역별 위험도 결과. BE ZoneResultDto / SIM ZoneResult와 1:1 매칭.
export interface ZoneResult {
  zoneId: number;
  zoneName: string;
  areaM2: number;
  pathWidthM: number;
  visitorCount: number;
  density: number;
  personalSpace: number;
  riskScore: number;
  riskLevel: string;
  reason: string;
  breakdown: {
    density: number;
    bottleneck: number;
  };
}

export interface Market {
  marketId: number;
  marketName: string;
  latitude: number;
  longitude: number;
}

export interface Zone {
  zoneId: number;
  marketId: number;
  zoneName: string;
  polygonCoordinates: string;
}

// 2026-08-XX 추가: 상가/건물 폴리곤. BE BuildingDto와 1:1 매칭.
// polygonCoordinates는 Zone과 동일하게 GeoJSON [경도,위도] 문자열이라,
// 같은 파싱 함수를 그대로 재사용한다.
export interface Building {
  buildingId: number;
  marketId: number;
  pnuCode: string;
  polygonCoordinates: string;
  heightM: number;
  heightEstimated: boolean;
  floors: number;
}

// 파이프라인 A: 관제 대시보드 조회 응답
export interface DashboardSnapshot {
  marketId: number;
  marketName: string;
  mode: string;
  step: number;
  overallRiskScore: number;
  zones: ZoneResult[];
  agents: AgentState[];
  persistedRiskRows: number;
}

// 오브젝트 배치. SIM PlacedObject / BE PlacedObjectDto와 1:1 매칭.
// latitude/longitude가 있으면 지도에서 클릭한 정밀 좌표, 없으면 zoneId 구역의
// 대표점으로 근사한다(하위 호환).
export interface PlacedObject {
  objectType: 'food_truck' | 'obstacle' | 'event_zone' | 'rest_area';
  zoneId: number;
  intensity: number; // 0.0 ~ 1.0
  latitude?: number;
  longitude?: number;
}

// 통로 정책. SIM CorridorPolicy / BE CorridorPolicyDto와 1:1 매칭.
export interface CorridorPolicy {
  fromZoneId: number;
  toZoneId: number;
  action: 'close' | 'open' | 'one_way';
  allowedDirection?: 'from_to' | 'to_from';
}

// 지도에 그릴 통로(구역 간 연결) 원본 데이터. BE ZoneAdjacencyDto와 1:1 매칭.
export interface Corridor {
  adjacencyId: number;
  fromZoneId: number;
  toZoneId: number;
  pathCoordinates: string | null;
  isActive: boolean;
}

// 게이트(출입구). BE GateDto와 1:1 매칭.
export interface Gate {
  facilityId: number;
  name: string;
  latitude: number;
  longitude: number;
  weight: number;
}

// 2026-07-25 추가: 화재/음향 이상 이벤트. SIM EventTrigger / BE EventTriggerDto와 1:1 매칭.
export interface EventTrigger {
  // 2026-08-XX: 음향 이상(acoustic_anomaly)은 백엔드에서 완전히 제거되어(무효)
  // FE에서도 삭제. 이벤트는 화재(fire) 하나뿐이다.
  eventType: 'fire';
  zoneId: number;
  intensity: number; // 0.0 ~ 1.0
  latitude?: number;
  longitude?: number;
  triggerStep?: number;
  // 2026-08-XX 추가: 화재 생애주기. burnSteps 동안 연소 후 진압, recoverySteps 동안 복구.
  burnSteps?: number;
  recoverySteps?: number;
  // 2026-08-XX 추가(FE 내부용): 진압 스텝(절대값). 발생~진압이 연소 기간.
  // 실행 시 burnSteps = max(1, extinguishStep - triggerStep)로 변환해 SIM에 보낸다.
  // (발생 스텝을 나중에 바꿔도 진압 시점이 안 어긋나게 하기 위함)
  extinguishStep?: number;
}

// 파이프라인 B: 사용자 지정 시뮬레이션 요청/응답
export interface ScenarioRequest {
  marketId: number;
  agentCount: number;
  steps: number;
  objects: PlacedObject[];
  corridorPolicies: CorridorPolicy[];
  events: EventTrigger[];
  closedGateIds: number[];
}

export interface ScenarioResult {
  // SIM이 실행마다 만드는 UUID. 보고서 생성에는 쓸 수 없다(아래 persistedScenarioId 참고).
  scenarioId: string;
  requestedAt: string;
  frames: AgentState[][];
  // 2026-08-XX 추가: 개입 후 스텝별 위험도 추이(개입 전과 겹쳐 비교).
  riskTrend?: RiskTrendPoint[];
  evacuationTimeSeconds: number | null;
  finalRiskScore: RiskScore;
  averageDensity?: number;
  maxDensity?: number;
  maxDensityZoneId?: number | null;
  maxDensityZoneName?: string | null;
  evacuatedCount?: number;
  // 2026-08-06 추가: 이 실행이 저장된 DB 시나리오 번호(simscnr01m.scenario_id).
  // 보고서 생성(POST /api/simulation/reports)이 요구하는 식별자이며 위 scenarioId로는
  // 대체할 수 없다. BE ScenarioResultDto.persistedScenarioId와 1:1 매칭.
  // BE가 이 필드를 내려주기 전 버전과 섞여 돌 수 있어 optional로 둔다.
  persistedScenarioId?: number | null;
}

// 2026-07-24 추가: 실측 상태에서 출발한 예측 시뮬레이션(파이프라인 A 확장) 요청/응답.
export interface PredictRequest {
  marketId: number;
  capturedAt?: string;
  steps: number;
  totalInflow: number;
  // 2026-08-XX 추가: 이벤트(화재/음향이상)만 Before/After 공통으로 반영.
  events?: EventTrigger[];
  // 2026-08-XX 추가: 게이트 개폐를 개입 전/후 독립적으로 조절(개입 전도 닫힌 게이트 반영).
  closedGateIds?: number[];
  seed?: number;
}

export interface ZoneRiskPoint {
  zoneId: number;
  riskScore: number;
  riskLevel: string;
}

export interface RiskTrendPoint {
  step: number;
  overallRiskScore: number;
  zones: ZoneRiskPoint[];
}

export interface PredictResult {
  predictionId: string;
  requestedAt: string;
  frames: AgentState[][];
  riskTrend: RiskTrendPoint[];
  finalOverallRiskScore: number;
  agentCount?: number;
  averageDensity?: number;
  maxDensity?: number;
  maxDensityZoneId?: number | null;
  maxDensityZoneName?: string | null;
  evacuatedCount?: number;
  // 2026-08-XX 추가: 개입 전 대피 완료 시간(개입 후와 비교).
  evacuationTimeSeconds?: number | null;
}