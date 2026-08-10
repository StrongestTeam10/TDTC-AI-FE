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
  const [isPlaying, setIsPlaying] = useState(true);
  const timerRef = useRef<number | null>(null);

  const totalFrames = frames.length;
  const intervalMs = Math.max(80, BASE_INTERVAL_MS / speed);

  // 새 시뮬레이션 결과가 들어오면 처음부터 자동 재생 시작
  useEffect(() => {
    setIndex(0);
    setIsPlaying(true);
  }, [frames]);

  useEffect(() => {
    if (totalFrames === 0 || !isPlaying) return;

    timerRef.current = window.setInterval(() => {
      setIndex((prev) => (prev >= totalFrames - 1 ? 0 : prev + 1));
    }, intervalMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [intervalMs, totalFrames, isPlaying]);

  if (totalFrames === 0) {
    return (
        <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 text-sm">
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

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded bg-white dark:bg-slate-900/90 px-4 py-2 text-xs text-slate-600 dark:text-slate-300 w-[90%] max-w-md shadow-lg border border-slate-300 dark:border-slate-700">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <input
            type="range"
            min={0}
            max={totalFrames - 1}
            value={index}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setIsPlaying(false); // 슬라이더 드래그 시 일시정지
            }}
            className="flex-1 accent-blue-500 cursor-pointer"
          />

          <div className="flex flex-col items-end min-w-[70px]">
            <span className="font-mono">{index + 1} / {totalFrames}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">~{elapsedSeconds}초</span>
          </div>

          <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1 py-1 text-slate-800 dark:text-slate-200 outline-none"
          >
            {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </div>
      </div>
  );
}
