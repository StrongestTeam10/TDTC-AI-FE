import { useEffect, useRef, useState } from 'react';
import HeatmapView from './HeatmapView';
import type { ZoneRisk } from './HeatmapView';
import type { AgentState, Zone } from '../types';

interface FramePlayerProps {
  zones: Zone[];
  frames: AgentState[][]; // 스텝별 에이전트 상태 (SIM ScenarioResult.frames / 예측 시뮬레이션 결과)
  zoneRisks?: ZoneRisk[];
  // SIM simulate.py의 STEP_DURATION_SECONDS(임시 캘리브레이션 값)와 맞춘 표시용 값.
  // SIM 쪽 값이 바뀌면 같이 맞춰야 함.
  stepDurationSeconds?: number;
  width?: number;
  height?: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];
const BASE_INTERVAL_MS = 500;

/**
 * 2026-07-24: 재생/일시정지/슬라이더 등 별도 컨트롤 바를 없애고, 결과가 들어오면
 * 바로 자동 재생을 시작하도록 단순화. 배속 선택만 지도 위 오버레이로 남겨둠.
 * 끝까지 재생되면 처음부터 반복 재생한다.
 */
export default function FramePlayer({
                                       zones,
                                       frames,
                                       zoneRisks,
                                       stepDurationSeconds = 10,
                                       width,
                                       height,
                                     }: FramePlayerProps) {
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<number | null>(null);

  const totalFrames = frames.length;
  const intervalMs = Math.max(80, BASE_INTERVAL_MS / speed);

  // 새 시뮬레이션 결과가 들어오면 처음부터 자동 재생 시작
  useEffect(() => {
    setIndex(0);
  }, [frames]);

  useEffect(() => {
    if (totalFrames === 0) return;

    timerRef.current = window.setInterval(() => {
      setIndex((prev) => (prev >= totalFrames - 1 ? 0 : prev + 1));
    }, intervalMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [intervalMs, totalFrames]);

  if (totalFrames === 0) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-8 text-center text-slate-500 text-sm">
          재생할 시뮬레이션 결과가 없습니다. 먼저 시뮬레이션을 실행해주세요.
        </div>
    );
  }

  const currentAgents = frames[index] ?? [];
  const elapsedSeconds = (index + 1) * stepDurationSeconds;

  return (
      <div className="relative">
        <HeatmapView
            zones={zones}
            agents={currentAgents}
            zoneRisks={zoneRisks}
            width={width}
            height={height}
            transitionMs={intervalMs}
        />

        <div className="absolute top-2 right-2 flex items-center gap-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-300">
          <span className="whitespace-nowrap">
            {index + 1}/{totalFrames} (~{elapsedSeconds}초)
          </span>
          <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-200"
          >
            {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </div>
      </div>
  );
}
