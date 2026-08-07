import { useCallback, useEffect, useRef, useState } from 'react';
import type { ControlStatus } from '../types/cctv';

// 2026-08-06 신규: dashboard.js updateUI() 안의 비상 타이머 부분을 훅으로 분리.
//
// 원본 대비 두 가지를 고쳤다.
//
// 1) 타이머가 video의 timeupdate 이벤트에 얹혀 있어서, 영상을 일시정지하면 카운트다운도
//    같이 멈췄다. 실제 관제에서는 화면을 멈춰도 위험 상태가 지속되면 시간은 흘러야 하므로
//    독립된 인터벌로 뺐다.
//
// 2) "출동 알람 지연 시간(alarmDelaySec)" 슬라이더가 값만 표시되고 아무 데도 쓰이지
//    않았다. 같이 선언돼 있던 dispatch-alert-overlay(🚨 EMERGENCY DISPATCH ACTIVE)도
//    한 번도 켜지지 않는 죽은 DOM이었다. cctv_ai_pipeline/docs/dashboard_update_summary.txt에
//    "대피 위험도 지속 시간이 설정 초(Delay)를 돌파하는 순간 화면 상단에 적색 오버레이
//    경보"라고 적힌 원래 의도대로 둘을 연결했다.

/** 화면 조작을 차단하고 확인 서랍을 내리는 지속 시간. */
const BLOCK_AFTER_SEC = 15;
/** 미확인 시 자동 신고가 나가는 지속 시간. */
const AUTO_DISPATCH_AFTER_SEC = 30;
/** 카운트다운 갱신 주기. */
const TICK_INTERVAL_MS = 250;

export interface UseEmergencyTimerResult {
  /** 대피 위험이 alarmDelaySec 이상 지속됨 - 비디오 위 적색 출동 경보 오버레이 */
  isDispatchAlarmActive: boolean;
  /** 15초 이상 지속 + 미확인 - 화면 차단 백드롭 & 상단 확인 서랍 */
  isBlocking: boolean;
  /** 자동 신고까지 남은 초 */
  countdownSec: number;
  /** 30초 경과로 112/119 자동 신고가 접수된 상태 */
  isAutoDispatched: boolean;
  /** "확인 및 관제 조작 해제" 버튼 */
  confirm: () => void;
}

/**
 * 대피 경보(danger) 상태가 얼마나 지속됐는지를 추적한다.
 * 상태가 danger에서 벗어나면 경과 시간과 확인 여부가 모두 초기화된다.
 */
export function useEmergencyTimer(
    status: ControlStatus,
    alarmDelaySec: number
): UseEmergencyTimerResult {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isConfirmed, setConfirmed] = useState(false);
  const dangerStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'danger') {
      // 위험 해제 - 타이머와 확인 상태를 모두 리셋한다.
      dangerStartRef.current = null;
      setElapsedSec(0);
      setConfirmed(false);
      return;
    }

    if (dangerStartRef.current === null) {
      dangerStartRef.current = Date.now();
    }

    const timerId = window.setInterval(() => {
      if (dangerStartRef.current === null) return;
      setElapsedSec((Date.now() - dangerStartRef.current) / 1000);
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [status]);

  const confirm = useCallback(() => setConfirmed(true), []);

  const isDanger = status === 'danger';
  const isAutoDispatched = isDanger && elapsedSec >= AUTO_DISPATCH_AFTER_SEC;

  return {
    isDispatchAlarmActive: isDanger && elapsedSec >= alarmDelaySec,
    isBlocking: isDanger && elapsedSec >= BLOCK_AFTER_SEC && !isConfirmed,
    countdownSec: Math.max(0, Math.ceil(AUTO_DISPATCH_AFTER_SEC - elapsedSec)),
    isAutoDispatched,
    confirm,
  };
}
