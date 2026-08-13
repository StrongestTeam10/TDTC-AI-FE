import { useCallback, useEffect, useRef, useState } from 'react';
import { CCTV_WS_URL, fetchCctvDataset, toFrameMetrics } from '../api/cctvClient';
import type {
  CctvAnalysisProgress,
  CctvConnectionStatus,
  CctvFrameDataMap,
  CctvStreamMessage,
} from '../types/cctv';

// 2026-08-06 신규: 기존 public/mangwon/js/dashboard.js의 initCCTVWebSocket()을 훅으로 이식.
//
// 원본은 함수 첫 줄에 `return`이 박혀 있어서 연결 자체가 되지 않았고("백엔드 웹소켓
// 연결 임시 차단"), 주소도 'ws://localhost:8000/ws/cctv-stream'로 하드코딩돼 있었다.
// 차단을 풀고 주소는 VITE_CCTV_WS_URL로 뺐다.
//
// 원본 대비 달라진 점:
//   - onclose에서 setTimeout(initCCTVWebSocket, 3000)으로 무한 재연결하던 것을,
//     지수 백오프 + 언마운트 시 타이머 정리로 바꿨다. 원본 방식은 페이지를 떠난 뒤에도
//     3초마다 연결을 계속 시도해서 서버가 꺼져 있으면 콘솔이 에러로 가득 찼다.
//   - keepalive용 ping을 주기적으로 보낸다. 서버가 receive_text() 루프로 대기하며
//     "ping"에 pong을 돌려주게 돼 있는데, 원본은 한 번도 보내지 않아서 프록시가
//     유휴 연결을 끊으면 그대로 죽었다.

/** 재연결 대기 시간. 시도할수록 늘어나되 30초를 넘기지 않는다. */
const RECONNECT_BASE_DELAY_MS = 3_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
/** keepalive ping 주기. */
const PING_INTERVAL_MS = 25_000;

export interface CctvStreamState {
  /** 연결 상태(우상단 배지 표시용) */
  status: CctvConnectionStatus;
  /** 구역별로 수신한 프레임별 지표 (zoneId -> frameId -> metrics) */
  multiZoneFrameData: Record<number, CctvFrameDataMap>;
  /** AI 분석 진행 오버레이 상태 */
  analysis: CctvAnalysisProgress;
  /** 분석 완료 후 교체할 결과 영상의 파일명. 아직 없으면 null. */
  completedFilename: string | null;
  /** 스트림으로 방금 도착한 프레임 번호(영상 재생과 무관하게 서버가 밀어주는 값) */
  liveFrameId: number | null;
  /** 업로드 시작 시 화면 쪽에서 오버레이를 먼저 띄우기 위한 수동 트리거 */
  beginAnalysis: (title: string) => void;
  /** 업로드 실패 등으로 오버레이를 강제로 닫을 때 */
  endAnalysis: () => void;
  /** 새 영상을 올릴 때 이전 영상의 프레임 데이터를 비운다. */
  resetFrameData: () => void;
}

const IDLE_ANALYSIS: CctvAnalysisProgress = {
  isAnalyzing: false,
  percent: 0,
  title: 'CCTV AI 파이프라인 모델링 분석 중...',
};

export function useCctvStream(): CctvStreamState {
  const [status, setStatus] = useState<CctvConnectionStatus>('connecting');
  const [multiZoneFrameData, setMultiZoneFrameData] = useState<Record<number, CctvFrameDataMap>>({ 1: {}, 2: {}, 3: {} });
  const [analysis, setAnalysis] = useState<CctvAnalysisProgress>(IDLE_ANALYSIS);
  const [completedFilename, setCompletedFilename] = useState<string | null>(null);
  const [liveFrameId, setLiveFrameId] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  // 언마운트 이후 도착하는 onclose가 재연결을 다시 걸지 않도록 하는 가드
  const isUnmountedRef = useRef(false);

  const handleMessage = useCallback((raw: string) => {
    let message: CctvStreamMessage;
    try {
      message = JSON.parse(raw) as CctvStreamMessage;
    } catch {
      console.error('[CCTV WebSocket] 메시지 파싱 실패', raw.slice(0, 120));
      return;
    }

    switch (message.type) {
      case 'INIT_STATE':
        // 이미 분석이 돌고 있는 중에 화면에 들어온 경우(새로고침 등) 오버레이를 띄워준다.
        if (message.pipeline_state?.is_analyzing) {
          setAnalysis({
            isAnalyzing: true,
            percent: 0,
            title: '🤖 진행 중인 AI 파이프라인 분석에 연결했습니다...',
          });
        }
        break;

      case 'CCTV_AI_START':
        setAnalysis({ isAnalyzing: true, percent: 5, title: message.message });
        setCompletedFilename(null);
        break;

      case 'CCTV_AI_PROGRESS':
        setAnalysis({
          isAnalyzing: true,
          percent: Math.min(100, Math.max(0, message.progress)),
          title: message.step_name,
        });
        break;

      case 'CCTV_AI_COMPLETED': {
        setAnalysis({ isAnalyzing: true, percent: 100, title: message.message });
        setCompletedFilename(message.filename);

        // 분석이 끝나면 전체 데이터셋을 한 번에 받아둔다. 이래야 타임라인을 뒤로
        // 드래그해도 이미 지나간 프레임의 지표가 남아 있다.
        fetchCctvDataset(message.filename)
            .then((dataset) => {
              const zoneId = (message as any).zone_id || 1;
              setMultiZoneFrameData(prev => ({ ...prev, [zoneId]: dataset }));
            })
            .catch((err) => console.error('[CCTV] 분석 데이터셋 로드 실패', err));

        // 100%를 잠깐 보여준 뒤 오버레이를 닫는다.
        window.setTimeout(() => setAnalysis(IDLE_ANALYSIS), 600);
        break;
      }

      case 'CCTV_AI_STREAM': {
        // 스트림이 오기 시작했는데 오버레이가 아직 떠 있으면 닫는다.
        setAnalysis((prev) => (prev.isAnalyzing ? IDLE_ANALYSIS : prev));
        setLiveFrameId(message.frame_id);
        const zoneId = (message as any).zone_id || 1;
        setMultiZoneFrameData((prev) => ({
          ...prev,
          [zoneId]: {
            ...(prev[zoneId] || {}),
            [message.frame_id]: toFrameMetrics(message),
          }
        }));
        break;
      }

      case 'pong':
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    setStatus('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(CCTV_WS_URL);
    } catch (err) {
      // 주소 자체가 잘못된 경우(예: HTTPS 페이지에서 ws:// 사용)는 재시도해도 소용없다.
      console.error('[CCTV WebSocket] 연결 생성 실패', err);
      setStatus('closed');
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('[CCTV WebSocket] 실시간 관제 스트림 연결됨');
      reconnectAttemptRef.current = 0;
      setStatus('open');

      pingTimerRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping');
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (event: MessageEvent<string>) => handleMessage(event.data);

    socket.onerror = () => {
      // AI 서버가 안 떠 있는 건 개발 중 흔한 상태라 error로 찍지 않는다.
      // 이때는 화면이 정적 폴백 데이터로 계속 동작한다.
      console.log('[CCTV WebSocket] 연결 실패 - AI 서버 미실행 상태일 수 있습니다.');
    };

    socket.onclose = () => {
      if (pingTimerRef.current !== null) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      socketRef.current = null;
      if (isUnmountedRef.current) return;

      setStatus('closed');

      const attempt = (reconnectAttemptRef.current += 1);
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
      console.log(`[CCTV WebSocket] ${delay / 1000}초 후 재연결 시도 (${attempt}번째)`);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };
  }, [handleMessage]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  const beginAnalysis = useCallback((title: string) => {
    setAnalysis({ isAnalyzing: true, percent: 5, title });
  }, []);

  const endAnalysis = useCallback(() => setAnalysis(IDLE_ANALYSIS), []);

  const resetFrameData = useCallback(() => {
    setMultiZoneFrameData({ 1: {}, 2: {}, 3: {} });
    setLiveFrameId(null);
    setCompletedFilename(null);
  }, []);

  return {
    status,
    multiZoneFrameData,
    analysis,
    completedFilename,
    liveFrameId,
    beginAnalysis,
    endAnalysis,
    resetFrameData,
  };
}
