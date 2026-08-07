import axios from 'axios';
import type { CctvFrameDataMap, CctvFrameMetrics } from '../types/cctv';

// 2026-08-06 신규: CCTV AI 파이프라인(FastAPI) 전용 클라이언트.
//
// Java BE(:8080)와 완전히 별개의 서버라 api/client.ts의 apiClient를 재사용하지 않는다.
// 이유가 두 가지 있다.
//   1) baseURL이 다르다(VITE_CCTV_API_BASE_URL).
//   2) apiClient의 인터셉터가 401을 "세션 만료"로 보고 로그아웃시키는데, AI 서버는
//      JWT를 모르는 서버라 그 처리를 태우면 안 된다.
//
// 기존 public/mangwon/js/dashboard.js는 이 주소들을 'http://localhost:8000'으로
// 하드코딩해두고 `throw new Error('API 연동 임시 차단')`으로 막아둔 상태였다.
// 하드코딩을 환경변수로 빼고 차단을 풀었다.

// ⚠️ 포트 8088 주의. 8000은 SIM 서버(TDTC-AI-SIM)가 점유하고 있어서, 8000으로 두면
// CCTV WS 핸드셰이크가 SIM으로 간다. SIM엔 그 라우트가 없으니 Starlette가 accept
// 없이 닫고, uvicorn은 그걸 "403 Forbidden"으로 로깅한다(권한 문제로 오인하기 쉽다).
const CCTV_API_BASE_URL = import.meta.env.VITE_CCTV_API_BASE_URL ?? 'http://localhost:8088';

/** WebSocket 주소. useCctvStream에서 사용. */
export const CCTV_WS_URL =
    import.meta.env.VITE_CCTV_WS_URL ?? 'ws://localhost:8088/ws/cctv-stream';

const cctvApiClient = axios.create({
  baseURL: CCTV_API_BASE_URL,
  // 영상 업로드는 파일 크기에 따라 오래 걸릴 수 있어 Java BE(15초)보다 넉넉하게 잡는다.
  timeout: 120_000,
});

export interface CctvUploadResponse {
  status: string;
  message: string;
  filename: string;
  size_mb: number;
  saved_path: string;
}

/**
 * 관제 화면에서 고른 CCTV 영상을 AI 파이프라인 서버로 올린다.
 * 서버는 즉시 응답을 주고 분석은 백그라운드로 돌리며, 진행률과 결과는
 * WebSocket(CCTV_AI_START / PROGRESS / COMPLETED / STREAM)으로 따로 내려온다.
 *
 * 필드명 'cctv_video'는 서버 시그니처(cctv_video: UploadFile = File(...))와
 * 반드시 일치해야 한다.
 */
export async function uploadCctvVideo(file: File): Promise<CctvUploadResponse> {
  const formData = new FormData();
  formData.append('cctv_video', file);

  const { data } = await cctvApiClient.post<CctvUploadResponse>('/api/v1/cctv/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * 분석이 끝난 뒤 얼굴 블러 처리까지 완료된 결과 영상 주소.
 * 캐시된 이전 영상이 재생되지 않도록 타임스탬프를 붙인다.
 */
export function buildCctvResultVideoUrl(filename: string): string {
  return `${CCTV_API_BASE_URL}/api/v1/cctv/video/${encodeURIComponent(filename)}?t=${Date.now()}`;
}

/** 서버가 프레임별 지표를 담아 내려주는 데이터셋 JSON의 원본 형태(snake_case). */
interface RawDatasetRecord {
  pedestrian_count: number;
  occupancy_rate: number;
  stagnation_sec: number;
  cri_score: number;
  risk_level: string;
}

/**
 * 분석 완료 후 전체 프레임 데이터셋을 한 번에 받아온다.
 * WebSocket 스트림은 5FPS로 조금씩 오지만 이건 끝난 영상 전체를 담고 있어서,
 * 타임라인을 앞뒤로 드래그해도 모든 프레임의 지표를 즉시 볼 수 있다.
 */
export async function fetchCctvDataset(filename: string): Promise<CctvFrameDataMap> {
  const { data } = await cctvApiClient.get<Record<string, RawDatasetRecord>>(
      `/api/v1/cctv/dataset/${encodeURIComponent(filename)}`
  );

  const result: CctvFrameDataMap = {};
  for (const [frameId, record] of Object.entries(data)) {
    const frameNumber = Number(frameId);
    if (!Number.isFinite(frameNumber)) continue;
    result[frameNumber] = toFrameMetrics(record);
  }
  return result;
}

/** WebSocket/데이터셋의 snake_case 레코드를 화면에서 쓰는 camelCase로 정리. */
export function toFrameMetrics(record: RawDatasetRecord): CctvFrameMetrics {
  return {
    pedestrianCount: record.pedestrian_count,
    occupancyRate: record.occupancy_rate,
    stagnationSec: record.stagnation_sec,
    criScore: record.cri_score,
    riskLevel: record.risk_level,
  };
}

export default cctvApiClient;
