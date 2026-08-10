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

// 2026-08-10 추가: ngrok 무료 플랜의 브라우저 경고 페이지를 건너뛴다.
//
// ngrok은 User-Agent가 브라우저로 보이는 요청을 가로채 "You are about to visit..."
// 안내 페이지(ERR_NGROK_6024)를 대신 돌려준다. 그 응답에는 CORS 헤더가 없어서
// 브라우저가 차단하고, 콘솔에는 서버가 CORS를 안 걸어둔 것처럼 보인다.
// 실제로는 AI 서버의 CORS 설정이 정상이며, ngrok이 응답을 가로챈 것이다.
//
// 이 헤더를 붙이면 값과 무관하게 안내 페이지를 건너뛴다.
// 커스텀 헤더라 프리플라이트(OPTIONS)가 발생하지만, AI 서버가 allow_headers=["*"]라
// 통과한다(2026-08-10 실측 확인).
const NGROK_SKIP_WARNING = { 'ngrok-skip-browser-warning': 'true' } as const;

const cctvApiClient = axios.create({
  baseURL: CCTV_API_BASE_URL,
  // 영상 업로드는 파일 크기에 따라 오래 걸릴 수 있어 Java BE(15초)보다 넉넉하게 잡는다.
  timeout: 120_000,
  headers: { ...NGROK_SKIP_WARNING },
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
 * 분석이 끝난 뒤 얼굴 블러 처리까지 완료된 결과 영상을 받아 재생 가능한 URL로 만든다.
 *
 * 2026-08-10 변경: 예전에는 서버 주소를 그대로 <video src>에 넣었는데,
 * <video>/<img> 같은 태그에는 커스텀 헤더를 붙일 수 없어서 ngrok 안내 페이지에
 * 걸려 영상이 재생되지 않았다. axios로 blob을 받아 objectURL로 바꾼다.
 *
 * 반환된 URL은 다 쓰고 나면 반드시 URL.revokeObjectURL 로 해제할 것.
 */
export async function fetchCctvResultVideoUrl(filename: string): Promise<string> {
  const { data } = await cctvApiClient.get<Blob>(
      `/api/v1/cctv/video/${encodeURIComponent(filename)}`,
      { responseType: 'blob' }
  );
  return URL.createObjectURL(data);
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
