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
    acoustic: number;
    flowRate: number;
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
  snapshotTime: string;
  crowdDensities: CrowdDensity[];
  risks: Risk[];
  agents: AgentState[];
}

// 파이프라인 B: 사용자 지정 시뮬레이션 요청/응답
export interface ScenarioRequest {
  marketId: number;
  agentCount: number;
  scenarioType: 'none' | 'fire' | 'acoustic_anomaly' | 'corridor_block';
  eventZoneId: number;
  eventIntensity: number; // 0.0 ~ 1.0
  steps: number;
}

export interface ScenarioResult {
  scenarioId: string;
  requestedAt: string;
  frames: AgentState[][]; // 스텝별 에이전트 상태 스냅샷
  evacuationTimeSeconds: number | null;
  finalRiskScore: RiskScore;
}