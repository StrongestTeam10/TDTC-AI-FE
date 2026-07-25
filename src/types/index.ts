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
// 2026-07-24: BE가 SIM /simulate/snapshot을 실제로 호출하도록 바뀌면서 구조 전면 교체.
// 기존 snapshotTime/crowdDensities/risks 구조는 폐기됨.
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

// 2026-07-25 추가: 오브젝트 배치. SIM PlacedObject / BE PlacedObjectDto와 1:1 매칭.
// latitude/longitude가 있으면 지도에서 클릭한 정밀 좌표, 없으면 zoneId 구역의
// 대표점으로 근사한다(하위 호환).
export interface PlacedObject {
  objectType: 'food_truck' | 'obstacle' | 'event_zone' | 'rest_area';
  zoneId: number;
  intensity: number; // 0.0 ~ 1.0
  latitude?: number;
  longitude?: number;
}

// 2026-07-25 추가: 통로 정책. SIM CorridorPolicy / BE CorridorPolicyDto와 1:1 매칭.
export interface CorridorPolicy {
  fromZoneId: number;
  toZoneId: number;
  action: 'close' | 'open' | 'one_way';
  allowedDirection?: 'from_to' | 'to_from'; // action이 one_way일 때만 사용
}

// 2026-07-25 추가: 지도에 그릴 통로(구역 간 연결) 원본 데이터. BE ZoneAdjacencyDto와 1:1 매칭.
// CorridorPolicy(사용자가 이번 시나리오에 적용하려는 정책)와는 다른 개념 —
// 이건 "시장에 실제로 어떤 통로가 있는지"를 그리기 위한 데이터.
export interface Corridor {
  adjacencyId: number;
  fromZoneId: number;
  toZoneId: number;
  pathCoordinates: string | null;
  isActive: boolean;
}

// 파이프라인 B: 사용자 지정 시뮬레이션 요청/응답
export interface ScenarioRequest {
  marketId: number;
  agentCount: number;
  scenarioType: 'none' | 'fire' | 'acoustic_anomaly' | 'corridor_block';
  eventZoneId: number;
  eventIntensity: number; // 0.0 ~ 1.0
  steps: number;
  objects: PlacedObject[];
  corridorPolicies: CorridorPolicy[];
}

export interface ScenarioResult {
  scenarioId: string;
  requestedAt: string;
  frames: AgentState[][]; // 스텝별 에이전트 상태 스냅샷
  evacuationTimeSeconds: number | null;
  finalRiskScore: RiskScore;
}

// 2026-07-24 추가: 실측 상태에서 출발한 예측 시뮬레이션(파이프라인 A 확장) 요청/응답.
// 화재 등 이벤트를 다루는 ScenarioRequest와 달리, 실제 관측값 + 매대 매력도 기반
// 자연스러운 이동 + 게이트 신규 유입만으로 "인구가 몰렸을 때"를 예측한다.
export interface PredictRequest {
  marketId: number;
  capturedAt?: string; // 미지정 시 최신 관측값을 예측 출발점으로 사용
  steps: number;
  totalInflow: number; // 전체 시뮬레이션 동안 유입될 총 인원 (스텝별로 무작위 분산됨)
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