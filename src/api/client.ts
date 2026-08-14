import axios from 'axios';
import type {
  DashboardSnapshot,
  ScenarioRequest,
  ScenarioResult,
  PredictRequest,
  PredictResult,
  Market,
  Zone,
  Corridor,
  Gate,
  Building,
  CorridorPolicy,
  PlacedObject,
} from '../types';
import type { PostListResponse, PostDetail, PageResponse } from '../types/board';
import type {
  EmergencyAlert,
  ExternalFactor,
  PedestrianCoordinate,
  VideoClip,
} from '../types/cctv';
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
    if (config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
      // 2026-08-04 추가: 비밀번호 찾기(본인확인/재설정)도 로그인 전 상태에서 쓰는
      // 흐름이라 같은 이유로 제외.
      const url: string = error?.config?.url ?? '';
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/signup')
        || url.includes('/auth/verify-identity') || url.includes('/auth/reset-password');
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

// 2026-07-25 추가: 특정 시장의 통로(구역 간 연결) 목록 조회.
export async function fetchCorridors(marketId: number): Promise<Corridor[]> {
  const { data } = await apiClient.get<Corridor[]>(`/markets/${marketId}/corridors`);
  return data;
}

// 2026-07-25 추가: 특정 시장의 게이트(출입구) 목록 조회.
// 지도에 아이콘으로 표시하고 클릭으로 열림/닫힘을 토글하는 데 사용.
export async function fetchGates(marketId: number): Promise<Gate[]> {
  const { data } = await apiClient.get<Gate[]>(`/markets/${marketId}/gates`);
  return data;
}

// 2026-08-XX 추가: 특정 시장의 상가/건물 폴리곤 목록 조회 (지도에 건물 형태 표시용).
export async function fetchBuildings(marketId: number): Promise<Building[]> {
  const { data } = await apiClient.get<Building[]>(`/markets/${marketId}/buildings`);
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

// 2026-08-XX 추가: 시뮬레이션(특히 화재 등 이벤트로 시장 전체가 대피하는 큰
// 규모)은 계산량이 많아 공용 15초 타임아웃(apiClient 기본값)을 넘기기 쉽다.
// 넘기면 브라우저가 먼저 연결을 끊어버리고 BE에 ClientAbortException이 찍히는데,
// 실제로는 BE/SIM이 계속 계산 중이었을 뿐이다. 이 두 호출만 훨씬 긴 타임아웃을
// 따로 준다(다른 API는 그대로 15초 유지 - 로그인/게시판 등은 오래 걸릴 이유가 없음).
const SIMULATION_TIMEOUT_MS = 300_000; // 5분 (2026-08-XX: 무거운 시나리오 대비 상향)

// 파이프라인 B: 사용자 지정 시나리오 시뮬레이션 실행
export async function runScenarioSimulation(
    request: ScenarioRequest
): Promise<ScenarioResult> {
  const { data } = await apiClient.post<ScenarioResult>('/simulation/run', request, {
    timeout: SIMULATION_TIMEOUT_MS,
  });
  return data;
}

// 2026-07-24 추가: 예측 시뮬레이션 (실측 상태 + 게이트 신규 유입 기반)
export async function runPredictSimulation(
    request: PredictRequest
): Promise<PredictResult> {
  const { data } = await apiClient.post<PredictResult>('/simulation/predict', request, {
    timeout: SIMULATION_TIMEOUT_MS,
  });
  return data;
}

// 2026-08-06 추가: 정책안(공문) 텍스트를 LLM으로 분석하여 시나리오 파라미터로 자동 변환
export interface PolicyAnalysisResult {
  agentCount?: number;
  objectsToRemove: Array<{ objectType: string; zoneId: number; action: string }>;
  corridorPolicies: CorridorPolicy[];
  closedGateIds: number[];
}

export async function analyzePolicy(policyText: string, file?: File | null): Promise<PolicyAnalysisResult> {
  const formData = new FormData();
  formData.append('policyText', policyText);
  if (file) {
    formData.append('file', file);
  }
  const { data } = await apiClient.post<PolicyAnalysisResult>('/policy/analyze', formData, {
    timeout: 60000, // LLM 분석 지연 대비 60초 타임아웃
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

// ===== 시나리오 이력 · 정책 보고서 (2026-08-06 추가) =====
// BE ScenarioHistoryController(/api/simulation/scenarios), ReportController
// (/api/simulation/reports)와 대응. 이 경로는 BE SecurityConfig에서 ROL01·ROL02만
// 허용하므로 조회자(ROL03)가 호출하면 403이 온다.

// BE ScenarioHistoryDto와 1:1 매칭. 보고서가 있는 실행과 없는 실행이 함께 나온다.
export interface ScenarioHistoryItem {
  scenarioId: number;
  scenarioName: string;
  marketId: number;
  marketName: string | null;
  agentCount: number | null;
  policyTypeCode: string | null;
  executedAt: string | null;
  hasReport: boolean;
  // hasReport가 false면 아래 두 필드는 null이다.
  reportTitle: string | null;
  downloadPath: string | null;
  // 실행자 이름. 관리자 전체 목록에서 실행자를 구분하는 데 쓴다.
  // user_id를 채우기 전에 만들어진 옛 데이터는 null.
  ownerName: string | null;
  // 종합 위험 점수(0~100). 위험도 계산 이전 데이터는 null.
  // 등급(안전/주의/위험/심각) 구분은 화면이 RISK_BUCKETS로 정한다 - BE는 점수만 준다.
  predictedRiskScore: number | null;
}

/**
 * 검색어를 어느 항목에서 찾을지. BE ReportService.normalizeSearchField와 값이 같아야 하며,
 * 알 수 없는 값을 보내면 BE가 'all'로 되돌린다.
 *
 * 'owner'(실행자)는 관리자 전체 조회에서만 의미가 있다 - 본인 목록은 전부 자기 실행이다.
 * 시나리오명은 대상에 없다: DB에 저장된 원본과 화면에 보이는 표시명이 달라(BE
 * ScenarioDisplayNameResolver가 조립) 보이는 대로 입력하면 걸리지 않는다.
 */
export type ScenarioSearchField = 'all' | 'market' | 'policy' | 'reportTitle' | 'owner';

export interface ScenarioHistoryQuery {
  keyword?: string;
  searchField?: ScenarioSearchField;
  withReportOnly?: boolean;
  // 위험 점수 범위(둘 다 생략하면 위험도로 거르지 않음). 등급 경계는 화면이 정한다.
  // 범위를 지정하면 점수가 없는(null) 옛 이력은 결과에서 빠진다 - 어느 등급에도
  // 속한다고 볼 수 없기 때문이다.
  minRiskScore?: number;
  maxRiskScore?: number;
  page?: number;
  size?: number;
}

/**
 * 시나리오 한 건의 실행 설정. BE ScenarioDetailDto와 1:1 매칭.
 *
 * 목록의 이름은 같은 시장·같은 정책유형이면 구분되지 않아, 어느 실행인지 알려면
 * 이 설정을 봐야 한다. zoneName/name은 해당 구역·게이트가 지워졌으면 null이다.
 */
export interface ScenarioDetail {
  scenarioId: number;
  scenarioName: string;
  marketId: number;
  marketName: string | null;
  agentCount: number | null;
  // 실행 요청 JSON에만 있는 값이라, 옛 데이터는 null일 수 있다.
  steps: number | null;
  policyTypeCode: string | null;
  regDatetime: string | null;
  objects: {
    objectType: string; zoneId: number | null; zoneName: string | null; intensity: number | null;
  }[];
  events: {
    eventType: string; zoneId: number | null; zoneName: string | null; intensity: number | null;
    triggerStep: number | null; burnSteps: number | null; recoverySteps: number | null;
  }[];
  corridorPolicies: {
    fromZoneId: number | null; fromZoneName: string | null;
    toZoneId: number | null; toZoneName: string | null;
    action: string; allowedDirection: string | null;
  }[];
  closedGates: { facilityId: number; name: string | null }[];
}

export async function fetchScenarioDetail(scenarioId: number): Promise<ScenarioDetail> {
  const { data } = await apiClient.get<ScenarioDetail>(`/simulation/scenarios/${scenarioId}`);
  return data;
}

/** 로그인한 사용자가 실행한 시뮬레이션 이력(최신순). */
export async function fetchMyScenarios(
    params: ScenarioHistoryQuery = {}
): Promise<PageResponse<ScenarioHistoryItem>> {
  const { data } = await apiClient.get<PageResponse<ScenarioHistoryItem>>(
      '/simulation/scenarios/my', { params });
  return data;
}

/**
 * 실행자와 무관한 전체 시뮬레이션 이력(최신순). 관리자(ROL01) 전용 - 그 외 권한이
 * 호출하면 BE ReportService.assertAdmin이 403으로 거절한다.
 * marketId를 주면 그 시장만 거른다.
 */
export async function fetchAllScenarios(
    marketId?: number,
    query: ScenarioHistoryQuery = {}
): Promise<PageResponse<ScenarioHistoryItem>> {
  const { data } = await apiClient.get<PageResponse<ScenarioHistoryItem>>(
      '/simulation/scenarios', {
    params: { ...query, ...(marketId !== undefined ? { marketId } : {}) },
  });
  return data;
}

/**
 * 보고서 생성은 RAG 검색 + LLM 생성 + 차트 렌더까지 도는 작업이라 1~3분이 걸린다.
 * BE도 SIM 호출에 3분 타임아웃을 두므로(SimulationEngineClient.generateReportDocx)
 * 그보다 넉넉하게 잡는다. 공용 15초로는 매번 브라우저가 먼저 끊어버리고, 그러면
 * BE/SIM은 계속 만들던 보고서를 사용자만 실패로 보게 된다.
 */
const REPORT_TIMEOUT_MS = 300_000; // 5분

export interface ReportGenerateRequest {
  scenarioId: number;
  // 비우면 SIM이 "OO시장 ... 결과 보고서" 형태로 자동 생성한다. BE가 200자로 제한한다.
  reportTitle?: string;
  // 보고서가 답해야 할 질문. 비우면 SIM 기본 문구가 쓰인다.
  decisionQuestion?: string;
}

export interface ReportGenerateResponse {
  reportId: string;
  scenarioId: number;
  // 만료 시간이 있는 presigned URL. 만료되면 fetchReportDownloadUrl로 재발급하면 되고
  // 보고서를 다시 만들 필요는 없다.
  downloadUrl: string;
  storageKey: string;
}

export async function generateReport(
    request: ReportGenerateRequest
): Promise<ReportGenerateResponse> {
  const { data } = await apiClient.post<ReportGenerateResponse>('/simulation/reports', request, {
    timeout: REPORT_TIMEOUT_MS,
  });
  return data;
}

export interface ReportDownload {
  scenarioId: number;
  downloadUrl: string;
  expiresInSeconds: number;
}

/**
 * 이미 만들어 둔 보고서의 다운로드 주소를 새로 발급받는다(보고서 재생성 아님).
 *
 * BE가 302 리다이렉트 대신 JSON으로 URL을 주는 이유는, 이 API에 JWT가 필요한데
 * 브라우저가 단순 이동하면 Authorization 헤더가 실리지 않고 fetch로 부르면
 * S3로 리다이렉트될 때 CORS에 막히기 때문이다. 받은 URL로 직접 이동하면 된다.
 */
export async function fetchReportDownloadUrl(scenarioId: number): Promise<ReportDownload> {
  const { data } = await apiClient.get<ReportDownload>(
      `/simulation/reports/${scenarioId}/download`);
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
  // 2026-07-24 추가(게시판)
  marketCode?: string;
  isDuty?: boolean;
  phoneNumber?: string;
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

// 2026-07-26 추가: 앱 부팅 시 저장된 토큰이 아직 유효한지 서버에 확인하는 용도.
// 로그인 API처럼 자체적으로 401을 401로 두면 api/client.ts 응답 인터셉터가 자동으로
// notifyUnauthorized()를 호출해 로그아웃 처리를 해주므로, 여기선 별도 에러 처리를
// 하지 않고 호출만 해도 됨(App.tsx 참고).
export async function fetchMe(): Promise<UserSummary> {
  const { data } = await apiClient.get<UserSummary>('/auth/me');
  return data;
}

export interface SignupRequest {
  loginId: string;
  password: string;
  name: string;
  phoneNumber: string;
  orgCode: string;
  // 2026-07-24 추가(게시판): 담당 시장 코드. 게시판 목록에서 "본인 담당 시장 글만
  // 노출"하는 기준이 되므로 회원가입 시점에 반드시 선택해야 함.
  marketCode: string;
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

// 2026-08-04 추가 (비밀번호 찾기)
// 본인확인은 이메일/SMS 없이 가입 시 입력한 필드(아이디+이름+소속기관+담당시장)
// 일치 여부만으로 판단함(usrusrs01m에 이메일/휴대폰 컬럼이 없어 선택한 방식).
// BE는 아직 이 두 엔드포인트가 없음 - /api/auth/verify-identity, /api/auth/reset-password
// 추가 필요(둘 다 permitAll이어야 함 - 로그인 전 상태에서 쓰는 흐름이므로).
export interface VerifyIdentityRequest {
  loginId: string;
  name: string;
  orgCode: string;
  marketCode: string;
}

export interface VerifyIdentityResponse {
  verified: boolean;
}

export async function verifyIdentity(request: VerifyIdentityRequest): Promise<VerifyIdentityResponse> {
  const { data } = await apiClient.post<VerifyIdentityResponse>('/auth/verify-identity', request);
  return data;
}

// 재설정 시점에도 verify-identity와 동일한 4개 필드를 함께 보내 서버가 다시 한 번
// 본인확인을 하도록 함(브라우저에서 state를 조작해 verify 단계를 건너뛰고 곧바로
// reset-password를 호출하는 걸 막기 위한 방어적 설계 - FE 라우터 상태만 믿지 않음).
export interface ResetPasswordRequest {
  loginId: string;
  name: string;
  orgCode: string;
  marketCode: string;
  newPassword: string;
}

export async function resetPassword(request: ResetPasswordRequest): Promise<void> {
  await apiClient.post('/auth/reset-password', request);
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

// ===== 게시판 (2026-07-24 추가) =====
// BE PostController(/api/posts/**)와 대응.
// 작성/수정은 파일 업로드를 함께 보내야 해서 JSON이 아니라 multipart/form-data(FormData)로 전송함.

export async function fetchPosts(
    params: { keyword?: string; categoryCode?: string; marketCode?: string; page?: number; size?: number } = {}
): Promise<PostListResponse> {
  const { data } = await apiClient.get<PostListResponse>('/posts', { params });
  return data;
}

// 2026-07-26 변경: countView=false로 호출하면 서버에 조회수를 올리지 않도록 요청함.
// (BoardDetailPage처럼 실제로 "글을 읽는" 상황에서만 true로 호출하고,
// BoardWritePage의 수정 화면 프리필처럼 "편집 준비" 목적일 땐 false로 호출)
export async function fetchPostDetail(postId: number, countView = true): Promise<PostDetail> {
  const { data } = await apiClient.get<PostDetail>(`/posts/${postId}`, { params: { countView } });
  return data;
}

export interface PostWritePayload {
  title: string;
  content: string;
  notice: boolean;
  categoryCode: string;
  /**
   * 2026-08-12 추가: 글이 올라갈 시장.
   *
   * 관리자(ROL01)만 지정할 수 있고, 빈 문자열은 "전체"(모든 시장에 노출)를 뜻한다.
   * 그 외 권한이 보내면 BE가 무시하고 작성자의 담당 시장을 쓴다 - 화면 값을 믿지
   * 않는다(BE PostService). 생략하면 예전처럼 작성자 담당 시장으로 정해진다.
   */
  marketCode?: string;
  files: File[];
}

export async function createPost(
    payload: PostWritePayload,
    onUploadProgress?: (percent: number) => void
): Promise<number> {
  const formData = new FormData();
  formData.append('title', payload.title);
  formData.append('content', payload.content);
  formData.append('notice', String(payload.notice));
  formData.append('categoryCode', payload.categoryCode);
  // undefined면 아예 보내지 않는다(관리자가 아닌 경우). 빈 문자열은 "전체"라는 뜻이라
  // 보내야 하므로 undefined와 구분한다.
  if (payload.marketCode !== undefined) {
    formData.append('marketCode', payload.marketCode);
  }
  payload.files.forEach((file) => formData.append('files', file));

  const { data } = await apiClient.post<{ postId: number }>('/posts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onUploadProgress && e.total) onUploadProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data.postId;
}

export interface PostUpdatePayload {
  title: string;
  content: string;
  notice?: boolean; // 관리자가 아니면 이 값을 보내도 BE에서 거부되므로, 관리자 화면에서만 채워서 보낼 것
  categoryCode: string;
  /** 2026-08-12 추가. 규칙은 PostWritePayload.marketCode와 같다(관리자만, ''=전체). */
  marketCode?: string;
  deleteAttachmentIds: number[];
  files: File[];
}

export async function updatePost(
    postId: number,
    payload: PostUpdatePayload,
    onUploadProgress?: (percent: number) => void
): Promise<void> {
  const formData = new FormData();
  formData.append('title', payload.title);
  formData.append('content', payload.content);
  if (payload.notice !== undefined) {
    formData.append('notice', String(payload.notice));
  }
  formData.append('categoryCode', payload.categoryCode);
  if (payload.marketCode !== undefined) {
    formData.append('marketCode', payload.marketCode);
  }
  payload.deleteAttachmentIds.forEach((id) => formData.append('deleteAttachmentIds', String(id)));
  payload.files.forEach((file) => formData.append('files', file));

  await apiClient.put(`/posts/${postId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onUploadProgress && e.total) onUploadProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
}

export async function deletePost(postId: number): Promise<void> {
  await apiClient.delete(`/posts/${postId}`);
}

export async function togglePostLike(postId: number): Promise<{ liked: boolean }> {
  const { data } = await apiClient.post<{ liked: boolean }>(`/posts/${postId}/like`);
  return data;
}

// BE가 302로 S3 presigned URL을 돌려주므로, axios가 리다이렉트를 그대로 따라가
// 파일 바이너리를 blob으로 받은 뒤 브라우저 다운로드를 트리거함
// (Authorization 헤더는 최초 우리 서버 요청에만 붙고, 리다이렉트되는 S3 쪽 요청에는
// 브라우저가 자동으로 제외하므로 별도 처리가 필요 없음).
export async function downloadAttachment(
    postId: number,
    attachmentId: number,
    originalName: string
): Promise<void> {
  const response = await apiClient.get(`/posts/${postId}/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  });
  const blobUrl = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = originalName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// ---------------------------------------------------------------------------
// 2026-08-04 추가 (시설 관리 화면 - 상점 위치 등록)
// 관리자(ROL01)/상인회(ORGMA)만 호출 가능(그 외 역할은 BE가 403). 사진은 previewExif로
// EXIF 미리보기만 받은 뒤(저장 없음), 사용자가 지도에서 보정 + 방향 라벨링을 마치면
// save로 실제 저장하는 2단계 흐름 - FacilityPhotoService 설계와 동일.
// ---------------------------------------------------------------------------

export interface Facility {
  facilityId: number;
  marketId: number;
  facilityType: string;
  name: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  rmk: string | null;
  photoCount: number;
  updatedAt: string | null;
}

export interface FacilityCreateRequest {
  marketId: number;
  facilityType: string;
  name: string;
  latitude: number;
  longitude: number;
  isActive?: boolean;
  rmk?: string;
}

export interface FacilityUpdateRequest {
  facilityType: string;
  name: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  rmk?: string;
}

export async function fetchFacilities(marketId: number): Promise<Facility[]> {
  const { data } = await apiClient.get<Facility[]>('/facilities', { params: { marketId } });
  return data;
}

export async function createFacility(request: FacilityCreateRequest): Promise<Facility> {
  const { data } = await apiClient.post<Facility>('/facilities', request);
  return data;
}

export async function updateFacility(facilityId: number, request: FacilityUpdateRequest): Promise<Facility> {
  const { data } = await apiClient.put<Facility>(`/facilities/${facilityId}`, request);
  return data;
}

export async function deleteFacility(facilityId: number): Promise<void> {
  await apiClient.delete(`/facilities/${facilityId}`);
}

export interface PhotoExifPreview {
  hasGps: boolean;
  exifLatitude: number | null;
  exifLongitude: number | null;
  capturedAt: string | null;
}

export interface FacilityPhoto {
  photoId: number;
  facilityId: number;
  directionCode: string;
  originalName: string;
  downloadUrl: string;
  exifLatitude: number | null;
  exifLongitude: number | null;
  correctedLatitude: number;
  correctedLongitude: number;
  capturedAt: string | null;
  createdAt: string;
}

export async function previewFacilityPhotoExif(facilityId: number, file: File): Promise<PhotoExifPreview> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<PhotoExifPreview>(
    `/facilities/${facilityId}/photos/exif`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

export async function saveFacilityPhoto(
  facilityId: number,
  file: File,
  directionCode: string,
  correctedLatitude: number,
  correctedLongitude: number
): Promise<FacilityPhoto> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('directionCode', directionCode);
  formData.append('correctedLatitude', String(correctedLatitude));
  formData.append('correctedLongitude', String(correctedLongitude));
  const { data } = await apiClient.post<FacilityPhoto>(
    `/facilities/${facilityId}/photos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

export async function fetchFacilityPhotos(facilityId: number): Promise<FacilityPhoto[]> {
  const { data } = await apiClient.get<FacilityPhoto[]>(`/facilities/${facilityId}/photos`);
  return data;
}

export async function deleteFacilityPhoto(facilityId: number, photoId: number): Promise<void> {
  await apiClient.delete(`/facilities/${facilityId}/photos/${photoId}`);
}

// ===== CCTV 관제 구역 (2026-08-11 추가, 08-11 2차 재설계) =====
// BE CctvZoneController(/api/cctv-zones)와 대응.
//
// ⚠️ 시뮬레이션 구역(fetchZones, /api/markets/{id}/zones)과는 완전히 별개의 테이블
// (mrkcctv01m)이다. 여기서 구역을 저장해도 시뮬레이션 비교 화면의 구역 폴리곤이나
// SIM의 위험도 계산에는 영향이 없다 - 섞이면 SIM이 CCTV 구역까지 에이전트 배치
// 대상으로 잡아버려서 일부러 분리했다.
//
// 2차 재설계: 고정 슬롯(1~4)을 버리고 소속 시뮬레이션 구역(zoneId)에 붙는 행을 등록마다
// 추가한다. 저장은 신규 POST / 수정 PUT(id) / 삭제 DELETE(id), 목록은 게시판식 페이징.

export interface CctvZone {
  cctvZoneId: number;
  marketId: number;
  /** 소속 시뮬레이션 구역 zone_id */
  zoneId: number;
  /** 소속 시뮬레이션 구역명(BE가 zone 조인해 채워줌) */
  zoneName: string;
  /** CCTV 사용/미사용 */
  isActive: boolean;
  /** GeoJSON Polygon 문자열. 시뮬레이션 구역과 같은 형식이라 파싱 코드를 공유할 수 있다. */
  polygonCoordinates: string;
  rmk: string | null;
  updatedAt: string | null;
}

export interface CctvZoneSaveRequest {
  marketId: number;
  zoneId: number;
  polygonCoordinates: string;
  isActive?: boolean;
  rmk?: string;
}

export async function fetchCctvZones(
    marketId: number,
    page = 0,
    size = 10
): Promise<PageResponse<CctvZone>> {
  const { data } = await apiClient.get<PageResponse<CctvZone>>('/cctv-zones', {
    params: { marketId, page, size },
  });
  return data;
}

export async function createCctvZone(request: CctvZoneSaveRequest): Promise<CctvZone> {
  const { data } = await apiClient.post<CctvZone>('/cctv-zones', request);
  return data;
}

export async function updateCctvZone(
    cctvZoneId: number,
    request: CctvZoneSaveRequest
): Promise<CctvZone> {
  const { data } = await apiClient.put<CctvZone>(`/cctv-zones/${cctvZoneId}`, request);
  return data;
}

export async function deleteCctvZone(cctvZoneId: number): Promise<void> {
  await apiClient.delete(`/cctv-zones/${cctvZoneId}`);
}

// ===== 시장 오브젝트/구조 설정 (2026-08-11 추가) =====
// BE MarketObjectConfigController(/api/market-objects)와 대응.
//
// 시뮬레이션 비교(파이프라인 B)의 초기 배치로 쓸 "오브젝트 배치 + 통로 제어 정책"을
// 시장 구조 등록 화면에서 미리 등록해두는 곳. 시장당 1세트(통째로 덮어쓰기).
// objects/corridorPolicies는 시뮬레이션 요청(ScenarioRequest)과 같은 형식이라,
// 불러온 그대로 시뮬레이션 비교의 초기값으로 넘길 수 있다.

export interface MarketObjectConfig {
  marketId: number;
  objects: PlacedObject[];
  corridorPolicies: CorridorPolicy[];
  updatedAt: string | null;
}

export interface MarketObjectConfigSaveRequest {
  marketId: number;
  objects: PlacedObject[];
  corridorPolicies: CorridorPolicy[];
}

export async function fetchMarketObjects(marketId: number): Promise<MarketObjectConfig> {
  const { data } = await apiClient.get<MarketObjectConfig>('/market-objects', {
    params: { marketId },
  });
  return data;
}

export async function saveMarketObjects(
    request: MarketObjectConfigSaveRequest
): Promise<MarketObjectConfig> {
  const { data } = await apiClient.put<MarketObjectConfig>('/market-objects', request);
  return data;
}

// ===== 회원관리 (2026-08-05 추가) =====
// BE UserAdminController(/api/admin/users/**)와 대응. 관리자(ROL01) 전용 - BE가
// 403을 내려주므로 여기서는 별도 권한 체크 없이 그대로 요청함(화면 자체는
// RequireAuth의 requireRole 가드로 관리자가 아니면 아예 못 들어옴).

export async function fetchAdminUsers(
    params: { marketCode?: string; pendingOnly?: boolean } = {}
): Promise<UserSummary[]> {
  const { data } = await apiClient.get<UserSummary[]>('/admin/users', { params });
  return data;
}

// 2026-08-10 변경: 회원관리 화면이 권한과 소속 시장을 한 행에서 같이 고친 뒤 저장
// 버튼으로 일괄 전송하는 방식이 되면서, 한 회원당 요청이 두 번 나가지 않도록 두 값을
// 같이 보낸다. marketCode를 생략하면 BE는 소속 시장을 건드리지 않고, 빈 문자열을
// 보내면 "소속 시장 없음"으로 지운다(관리자는 시장이 NULL인 것이 정상이라 필요함).
export async function updateUserRole(
    userId: number,
    rulesCode: string,
    marketCode?: string
): Promise<UserSummary> {
  const { data } = await apiClient.patch<UserSummary>(`/admin/users/${userId}/role`, {
    rulesCode,
    ...(marketCode === undefined ? {} : { marketCode }),
  });
  return data;
}

export async function updateUserDuty(userId: number, isDuty: boolean): Promise<UserSummary> {
  const { data } = await apiClient.patch<UserSummary>(`/admin/users/${userId}/duty`, {
    isDuty,
    duty: isDuty, // Jackson 맵핑 문제(isDuty vs duty)를 모두 커버하기 위해 두 필드 다 전송
  });
  return data;
}

// ===== 회원가입 관리자 승인 (2026-08-04 추가) =====
// BE UserApprovalController(/api/admin/users/pending, /approve, /reject)와 대응.
// UserAdminPage(/admin/users)의 "회원 승인" 탭에서 사용.
export interface PendingUser {
  userId: number;
  loginId: string;
  name: string;
  orgCode: string;
  marketCode: string | null;
  approvalStatus: string;
  createdAt: string;
}

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const { data } = await apiClient.get<PendingUser[]>('/admin/users/pending');
  return data;
}

export async function approveUser(userId: number): Promise<void> {
  await apiClient.post(`/admin/users/${userId}/approve`);
}

export async function rejectUser(userId: number): Promise<void> {
  await apiClient.post(`/admin/users/${userId}/reject`);
}

// ===== CCTV 관제 (2026-08-06 추가) =====
// BE에는 CCTV 파이프라인이 적재한 데이터를 읽는 API가 이미 있었는데(AiIntegrationController,
// SimulationIntegrationController, VideoClipController, ExternalFactorController) 여기에
// 대응하는 FE 함수가 하나도 없어서, 관제 화면이 정적 더미 데이터만 보고 있었다.
// 그 "읽기" 통로를 뚫는 부분.
//
// ⚠️ 아래 API는 모두 인증이 필요하다(SecurityConfig의 anyRequest().authenticated()).
// 특히 /simulation/** 은 관리자(ROL01)/관제요원(ROL02) 전용이라 상인회(ROL03)는 403을 받는다.

/** 미해결 긴급 알람 목록. 헤더의 알람 카운트 배지 및 알람 로그 모달에서 사용. */
export async function fetchUnresolvedAlerts(): Promise<EmergencyAlert[]> {
  const { data } = await apiClient.get<EmergencyAlert[]>('/ai/alerts/unresolved');
  return data;
}

export async function resolveAlert(alertId: number): Promise<void> {
  await apiClient.patch(`/ai/alerts/${alertId}/resolve`);
}

/**
 * 특정 프레임의 보행자 좌표(2D 픽셀 + 3D BEV) 목록.
 * videoId를 안 넘기면 BE가 clipId/frameId만으로 조회한다.
 */
export async function fetchCoordinatesJson(
    clipId: number,
    frameId: number,
    videoId?: number
): Promise<PedestrianCoordinate[]> {
  const { data } = await apiClient.get<PedestrianCoordinate[]>('/ai/coordinates-json', {
    params: { clipId, frameId, videoId },
  });
  return data;
}

/**
 * 위와 같은 데이터를 단건으로 받는 관제 전용 엔드포인트.
 * 해당 프레임에 좌표가 없으면 BE가 404를 주므로 null로 바꿔서 돌려준다
 * (관제 화면에서 "아직 안 온 프레임"은 오류가 아니라 정상 상황이라서).
 */
export async function fetchCoordinatesForFrame(
    clipId: number,
    frameId: number,
    videoId?: number
): Promise<PedestrianCoordinate | null> {
  try {
    const { data } = await apiClient.get<PedestrianCoordinate>('/simulation/coordinates/frame', {
      params: { clipId, frameId, videoId },
    });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

/** CCTV 영상 클립 목록. s3ClipUrl은 BE가 만들어준 1시간짜리 presigned URL이다. */
export async function fetchVideoClips(zoneId?: number): Promise<VideoClip[]> {
  const { data } = await apiClient.get<VideoClip[]>('/v1/video-clips', {
    params: zoneId ? { zoneId } : undefined
  });
  return data;
}

/** CCTV 긴급 상황 PDF 명세서 목록. s3PdfUrl은 BE가 만들어준 1시간짜리 presigned URL이다. */
export async function fetchPostReports(zoneId?: number): Promise<any[]> {
  const { data } = await apiClient.get<any[]>('/v1/post-reports', {
    params: zoneId ? { zoneId } : undefined
  });
  return data;
}

/** 외부 요인(날씨/행사) 이력. 하드코딩된 기상 시나리오를 실데이터로 바꿀 때 사용. */
export async function fetchExternalFactors(): Promise<ExternalFactor[]> {
  const { data } = await apiClient.get<ExternalFactor[]>('/v1/external-factors');
  return data;
}

/**
 * BE가 jsonb 컬럼을 String으로 그대로 내려주기 때문에 쓰는 쪽에서 파싱이 필요하다.
 * 파이프라인이 빈 문자열이나 깨진 JSON을 넣어둔 프레임이 섞여 있어도 화면 전체가
 * 죽지 않도록 실패 시 빈 객체를 돌려준다.
 */
export function parseCoordinateJson<T extends object>(raw: string | null): T | Record<string, never> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('[CCTV] 좌표 JSON 파싱 실패', raw.slice(0, 80));
    return {};
  }
}

export default apiClient;
