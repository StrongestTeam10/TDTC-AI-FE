import axios from 'axios';
import type {
  DashboardSnapshot,
  ScenarioRequest,
  ScenarioResult,
  PredictRequest,
  PredictResult,
  Market,
  Zone,
} from '../types';
import { getToken, notifyUnauthorized } from '../auth/tokenStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 2026-07-24 추가: BE가 로그인/회원가입 외 대부분의 API에 인증을 요구하도록 바뀌면서
// 모든 요청에 로그인 시 발급받은 JWT를 자동으로 붙여줌.
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 공통 에러 로깅
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      console.error('[API Error]', error?.response?.status, error?.message);

      // 2026-07-24 추가: 로그인/회원가입 자체의 401(예: 비밀번호 오류)은 "세션 만료"가
      // 아니므로 제외하고, 그 외 API가 401을 주면(토큰 만료/위조) 로그인 상태를 정리함.
      const url: string = error?.config?.url ?? '';
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/signup');
      if (error?.response?.status === 401 && !isAuthEndpoint) {
        notifyUnauthorized();
      }

      return Promise.reject(error);
    }
);

// 시장 목록 조회
export async function fetchMarkets(): Promise<Market[]> {
  const { data } = await apiClient.get<Market[]>('/markets');
  return data;
}

// 특정 시장의 구역(Zone) 목록 조회
export async function fetchZones(marketId: number): Promise<Zone[]> {
  const { data } = await apiClient.get<Zone[]>(`/markets/${marketId}/zones`);
  return data;
}

// 파이프라인 A: 관제 대시보드 - 실시간(또는 특정 시점) 스냅샷 조회
export async function fetchDashboardSnapshot(
    marketId: number,
    options?: { capturedAt?: string; persistRisk?: boolean; includeAgents?: boolean }
): Promise<DashboardSnapshot> {
  const { data } = await apiClient.get<DashboardSnapshot>('/dashboard/snapshot', {
    params: { marketId, ...options },
  });
  return data;
}

// 파이프라인 A: 조회 가능한 시점 목록
export async function fetchAvailableTimestamps(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>('/dashboard/timestamps');
  return data;
}

// 파이프라인 B: 사용자 지정 시나리오 시뮬레이션 실행
export async function runScenarioSimulation(
    request: ScenarioRequest
): Promise<ScenarioResult> {
  const { data } = await apiClient.post<ScenarioResult>('/simulation/run', request);
  return data;
}

// 2026-07-24 추가: 예측 시뮬레이션 (실측 상태 + 게이트 신규 유입 기반)
export async function runPredictSimulation(
    request: PredictRequest
): Promise<PredictResult> {
  const { data } = await apiClient.post<PredictResult>('/simulation/predict', request);
  return data;
}

// ===== 인증 (2026-07-24 추가) =====
// BE AuthController(/api/auth/**)와 대응. 이 두 엔드포인트는 BE에서 permitAll이라
// 토큰 없이도 호출 가능함(당연히 로그인 전이니까).

export interface LoginRequest {
  loginId: string;
  password: string;
}

export interface UserSummary {
  userId: number;
  loginId: string;
  name: string;
  rulesCode: string;
  orgCode: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: UserSummary;
}

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', request);
  return data;
}

export interface SignupRequest {
  loginId: string;
  password: string;
  name: string;
  orgCode: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
}

export interface SignupResponse {
  userId: number;
  loginId: string;
  name: string;
}

export async function signup(request: SignupRequest): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>('/auth/signup', request);
  return data;
}

// ===== 공통코드 (2026-07-24 추가) =====
// BE CommonCodeController(/api/common-codes?domain=)와 대응. 회원가입 화면의
// 소속기관 select 등에서 사용. 이 엔드포인트도 BE에서 permitAll(로그인 전에도 호출 가능).

export interface CommonCodeOption {
  code: string;
  codeName: string;
}

export async function fetchCommonCodes(domain: string): Promise<CommonCodeOption[]> {
  const { data } = await apiClient.get<CommonCodeOption[]>('/common-codes', {
    params: { domain },
  });
  return data;
}

export default apiClient;