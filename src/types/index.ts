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
// 2026-07-25: UI에서는 뺐지만(폼/지도 조작 제거), 백엔드/SIM 로직은 그대로 두고
// 타입과 요청 필드만 유지한다(항상 빈 배열로 보냄).
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
// 오브젝트 배치와 같은 방식(지도 클릭 -> zoneId + 위경도 + intensity)으로 배치한다.
export interface EventTrigger {
  eventType: 'fire' | 'acoustic_anomaly';
  zoneId: number;
  intensity: number; // 0.0 ~ 1.0
  latitude?: number;
  longitude?: number;
}

// 파이프라인 B: 사용자 지정 시뮬레이션 요청/응답
// 2026-07-25: scenarioType/eventZoneId/eventIntensity 삭제 - 화면에 입력창만 있고
// 실제로는 아무 효과가 없던 죽은 필드였다. events로 대체해 실제 효과를 낸다.
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
  scenarioId: string;
  requestedAt: string;
  frames: AgentState[][];
  evacuationTimeSeconds: number | null;
  finalRiskScore: RiskScore;
}

// 2026-07-24 추가: 실측 상태에서 출발한 예측 시뮬레이션(파이프라인 A 확장) 요청/응답.
export interface PredictRequest {
  marketId: number;
  capturedAt?: string;
  steps: number;
  totalInflow: number;
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
}