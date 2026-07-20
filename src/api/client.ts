import axios from 'axios';
import type {
  DashboardSnapshot,
  ScenarioRequest,
  ScenarioResult,
  SpatialNode,
} from '../types';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 공통 에러 로깅 (추후 Sentry 등 연동 지점)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]', error?.response?.status, error?.message);
    return Promise.reject(error);
  }
);

// 정적 레이아웃 조회 (spatial_nodes 테이블 참조)
export async function fetchSpatialLayout(): Promise<SpatialNode[]> {
  const { data } = await apiClient.get<SpatialNode[]>('/spatial/layout');
  return data;
}

// 파이프라인 A: 관제 대시보드 - 특정 시점 스냅샷 조회
export async function fetchDashboardSnapshot(
  snapshotTime?: string
): Promise<DashboardSnapshot> {
  const { data } = await apiClient.get<DashboardSnapshot>('/dashboard/snapshot', {
    params: snapshotTime ? { snapshotTime } : undefined,
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

export default apiClient;
