// 2026-08-06 신규: 기존 public/mangwon 정적 대시보드를 React로 이관하면서 정리한
// CCTV 관제 관련 타입 모음.
//
// 출처가 서로 다른 두 계열이 섞여 있어 파일 안에서 구역을 나눠 둔다.
//   1) CCTV AI 파이프라인(FastAPI) WebSocket 메시지  - snake_case (Python 그대로)
//   2) Java BE(:8080) REST 응답 DTO                 - camelCase (Jackson 직렬화)

// ==========================================================================
// 1. CCTV AI 파이프라인 WebSocket 메시지 (ws://.../ws/cctv-stream)
// ==========================================================================
// 서버가 보내는 필드명이 snake_case라 여기서 굳이 camelCase로 바꾸지 않는다.
// 중간에 매핑 레이어를 두면 파이프라인 쪽에서 필드를 추가할 때마다 FE도 같이
// 고쳐야 해서, 수신 경계에서는 서버 스키마를 그대로 두고 화면에 넘길 때만 정리한다.

/** 연결 직후 서버가 현재 파이프라인 상태를 한 번 내려준다. */
export interface CctvInitStateMessage {
  type: 'INIT_STATE';
  pipeline_state: {
    is_analyzing?: boolean;
    status?: string;
    frame_id?: number;
    pedestrian_count?: number;
    cri_score?: number;
  };
}

/** 업로드한 영상의 AI 분석이 시작됨. */
export interface CctvAiStartMessage {
  type: 'CCTV_AI_START';
  filename: string;
  message: string;
}

/** 분석 진행률(0~100). 서버가 12프레임 간격으로 보낸다. */
export interface CctvAiProgressMessage {
  type: 'CCTV_AI_PROGRESS';
  filename: string;
  progress: number;
  step_name: string;
}

/** 분석 완료. 이 시점부터 비식별화된 결과 영상을 받아올 수 있다. */
export interface CctvAiCompletedMessage {
  type: 'CCTV_AI_COMPLETED';
  filename: string;
  message: string;
}

/** 분석 완료 후 프레임별 관제 지표를 약 5FPS로 연속 스트리밍. */
export interface CctvAiStreamMessage {
  type: 'CCTV_AI_STREAM';
  frame_id: number;
  filename: string;
  pedestrian_count: number;
  occupancy_rate: number;
  stagnation_sec: number;
  cri_score: number;
  risk_level: string;
  timestamp: number;
}

/** 연결 유지용 keepalive 응답. */
export interface CctvPongMessage {
  type: 'pong';
  time: number;
}

export type CctvStreamMessage =
    | CctvInitStateMessage
    | CctvAiStartMessage
    | CctvAiProgressMessage
    | CctvAiCompletedMessage
    | CctvAiStreamMessage
    | CctvPongMessage;

/**
 * 한 프레임의 관제 지표. WebSocket 스트림에서 뽑아내거나,
 * 분석 완료 후 데이터셋 JSON을 한 번에 받아올 때 채워진다.
 */
export interface CctvFrameMetrics {
  pedestrianCount: number;
  occupancyRate: number;
  stagnationSec: number;
  criScore: number;
  riskLevel: string;
}

/** frame_id -> 지표. 스트리밍이 도착한 프레임만 채워지는 성긴(sparse) 맵. */
export type CctvFrameDataMap = Record<number, CctvFrameMetrics>;

/** WebSocket 연결 상태. 화면 우상단 배지 표시에 쓴다. */
export type CctvConnectionStatus = 'connecting' | 'open' | 'closed' | 'disabled';

/** AI 분석 진행 오버레이 상태. */
export interface CctvAnalysisProgress {
  isAnalyzing: boolean;
  percent: number;
  title: string;
}

// ==========================================================================
// 2. Java BE REST 응답 DTO
// ==========================================================================

/** GET /api/ai/alerts/unresolved - EmergencyAlertDto */
export interface EmergencyAlert {
  alertId: number;
  zoneId: number;
  alertType: string;
  isResolved: boolean;
  alertedAt: string;
}

/**
 * GET /api/ai/coordinates-json, GET /api/simulation/coordinates/frame
 * - PedestrianCoordinateDto
 *
 * pixelsJson/bevXyzJson은 BE가 jsonb를 String으로 그대로 내려주므로
 * 쓰는 쪽에서 JSON.parse가 필요하다(파싱 헬퍼는 api/client.ts 참고).
 */
export interface PedestrianCoordinate {
  coordId: number;
  frameId: number;
  pixelsJson: string | null;
  bevXyzJson: string | null;
  capturedAt: string;
  videoId: number | null;
  clipId: number;
  zoneId: number;
}

/** pixelsJson을 파싱한 결과: { person_1: { x, y }, ... } */
export type PedestrianPixels = Record<string, { x: number; y: number }>;

/** bevXyzJson을 파싱한 결과: { person_1: { x, y, z }, ... } */
export type PedestrianBevXyz = Record<string, { x: number; y: number; z: number }>;

/** GET /api/v1/video-clips - VideoClipDto (s3ClipUrl은 1시간짜리 presigned URL) */
export interface VideoClip {
  clipId: number;
  zoneId: number;
  clipType: string;
  s3ClipUrl: string | null;
  startTime: string | null;
  endTime: string | null;
  isDownloaded: boolean;
  isDeleted: boolean;
  expiresAt: string | null;
  factorId: number | null;
}

/** GET /api/v1/external-factors - ExternalFactorDto */
export interface ExternalFactor {
  factorId: number;
  marketId: number;
  targetDate: string;
  weatherCondition: string | null;
  temperature: number | null;
  eventCategory: string | null;
  eventName: string | null;
  updatedAt: string;
  videoId: number | null;
}

// ==========================================================================
// 3. 관제 화면 자체 상태
// ==========================================================================

/** 기상 시나리오 4종. 슬라이더 0~3 인덱스와 순서가 일치한다. */
export type WeatherMode = 'SUNNY' | 'PREDICTIVE_RAIN' | 'RAINY' | 'HOT_SUMMER';

/** 관제 경보 3단계. */
export type ControlStatus = 'safe' | 'warning' | 'danger';

/** 우측 드로어에서 조절하는 실시간 튜닝 파라미터. */
export interface ControlParams {
  /** 대피 경보 기준치 (pt) */
  evacThreshold: number;
  /** 출동 알람 지연 시간 (초) */
  alarmDelaySec: number;
  /** 대인 밀집 가중치 (%) */
  densityWeightPercent: number;
  /** 수동 위험도 가산점 (pt) */
  manualScoreOffset: number;
}
