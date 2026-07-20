// 공통 도메인 타입 정의
// Spring Boot 백엔드의 DTO와 필드명을 반드시 일치시킬 것

export interface SpatialNode {
  nodeId: number;
  nodeType: 'stall' | 'corridor' | 'entrance';
  xCoord: number;
  yCoord: number;
  connectedNodes: number[];
}

export interface AgentState {
  agentId: number;
  nodeId: number;
  x: number;
  y: number;
  state: 'normal' | 'congested' | 'evacuating';
}

export interface RiskScore {
  timestamp: string;
  score: number; // 0 ~ 100
  level: 'low' | 'medium' | 'high' | 'critical';
  contributingFactors: {
    density: number;
    acoustic: number;
    flowRate: number;
  };
}

export interface AlertLogEntry {
  alertId: number;
  timestamp: string;
  nodeId: number;
  alertType: string;
  message: string;
  resolved: boolean;
}

// 파이프라인 A: 관제 대시보드 조회 응답
export interface DashboardSnapshot {
  snapshotTime: string;
  agents: AgentState[];
  riskScore: RiskScore;
  alerts: AlertLogEntry[];
}

// 파이프라인 B: 사용자 지정 시뮬레이션 요청/응답
export interface ScenarioRequest {
  agentCount: number;
  scenarioType: 'none' | 'fire' | 'acoustic_anomaly' | 'corridor_block';
  eventNodeId: number;
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
