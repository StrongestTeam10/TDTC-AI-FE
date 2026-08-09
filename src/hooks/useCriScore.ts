import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALPHA_EMA,
  applyEma,
  clampScore,
  computeRawCri,
  CRITICAL_THRESHOLD_LINE,
  MAX_HISTORY_LENGTH,
  resolveControlStatus,
} from '../utils/criScore';
import type { ControlParams, WeatherMode } from '../types/cctv';
import type { ControlStatusResult } from '../utils/criScore';

// 2026-08-06 신규: dashboard.js updateUI()의 EMA 스무딩 + 차트 히스토리 관리 부분.
//
// 원본은 스코어가 갱신될 때마다 lineChart.data를 직접 밀어 넣었는데(shift/push),
// 여기서는 히스토리를 상태로 들고 recharts가 그리게 한다. Chart.js CDN 의존이
// 사라지는 것도 겸사겸사 얻는 이득이다(원본 index.html은 jsdelivr에서 받아왔다).

/** 차트 갱신 스로틀. 프레임마다 밀어 넣으면 곡선이 너무 빨리 흘러간다. */
const CHART_UPDATE_INTERVAL_MS = 300;

/** 최초 진입 시 차트를 채워둘 기본 스코어(원본과 동일). */
const INITIAL_SCORE = 20;

export interface CriHistoryPoint {
  /** x축 라벨. "-29s" ~ "0s" */
  t: string;
  score: number;
  /** 80pt 대피 임계선(고정) */
  limit: number;
}

export interface UseCriScoreArgs {
  /** 현재 프레임의 감지 인원 수 */
  pedestrianCount: number;
  /**
   * AI 서버가 직접 내려준 CRI. 값이 있으면 자체 계산 대신 이 값을 그대로 쓴다
   * (서버가 CSRNet 밀도까지 반영한 값이라 더 정확하다).
   */
  incomingCriScore: number | null;
  weatherMode: WeatherMode;
  params: ControlParams;
}

export interface UseCriScoreResult {
  /** 화면에 표시되는 최종 CRI(스무딩 반영) */
  cri: number;
  /** 3단계 경보 판정 결과 */
  statusResult: ControlStatusResult;
  /** 추이 그래프용 최근 30초 히스토리 */
  history: CriHistoryPoint[];
  /** 새 영상을 올릴 때 스무딩 상태와 차트를 초기화 */
  reset: () => void;
}

function buildInitialHistory(): CriHistoryPoint[] {
  return Array.from({ length: MAX_HISTORY_LENGTH }, (_, i) => ({
    t: `-${MAX_HISTORY_LENGTH - 1 - i}s`,
    score: INITIAL_SCORE,
    limit: CRITICAL_THRESHOLD_LINE,
  }));
}

export function useCriScore({
  pedestrianCount,
  incomingCriScore,
  weatherMode,
  params,
}: UseCriScoreArgs): UseCriScoreResult {
  const [cri, setCri] = useState(INITIAL_SCORE);
  const [history, setHistory] = useState<CriHistoryPoint[]>(buildInitialHistory);

  // EMA는 이전 값을 계속 물고 가야 해서 렌더와 무관하게 ref로 유지한다.
  const smoothedRef = useRef(INITIAL_SCORE);
  const lastChartUpdateRef = useRef(0);

  // 입력이 바뀔 때마다 EMA를 한 스텝 진행한다. 원본이 updateUI() 호출 시점마다
  // 스무딩을 한 번씩 돌렸던 것과 같은 주기다(프레임 갱신 + 슬라이더 조작).
  useEffect(() => {
    if (incomingCriScore !== null) {
      // 서버 값을 쓸 때도 ref를 맞춰둬야, 이후 서버 연결이 끊겨 자체 계산으로
      // 돌아갔을 때 스코어가 엉뚱한 값에서 다시 시작하지 않는다.
      const serverScore = clampScore(incomingCriScore);
      smoothedRef.current = serverScore;
      setCri(serverScore);
      return;
    }

    const raw = computeRawCri({ pedestrianCount, weatherMode, params });
    smoothedRef.current = applyEma(smoothedRef.current, raw, ALPHA_EMA);
    setCri(clampScore(smoothedRef.current));
  }, [pedestrianCount, incomingCriScore, weatherMode, params]);

  // 차트는 스코어 갱신보다 느린 주기로만 밀어준다.
  useEffect(() => {
    const now = Date.now();
    if (now - lastChartUpdateRef.current < CHART_UPDATE_INTERVAL_MS) return;
    lastChartUpdateRef.current = now;

    setHistory((prev) => {
      const next = prev.slice(1).map((point, i) => ({
        ...point,
        t: `-${MAX_HISTORY_LENGTH - 1 - i}s`,
      }));
      next.push({ t: '0s', score: Number(cri.toFixed(1)), limit: CRITICAL_THRESHOLD_LINE });
      return next;
    });
  }, [cri]);

  const statusResult = useMemo(
      () => resolveControlStatus(cri, params.evacThreshold),
      [cri, params.evacThreshold]
  );

  const reset = useCallback(() => {
    smoothedRef.current = INITIAL_SCORE;
    lastChartUpdateRef.current = 0;
    setCri(INITIAL_SCORE);
    setHistory(buildInitialHistory());
  }, []);

  return { cri, statusResult, history, reset };
}
