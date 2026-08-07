import type { ControlParams, ControlStatus, WeatherMode } from '../types/cctv';

// 2026-08-06 신규: 기존 public/mangwon/js/dashboard.js의 updateUI() 안에 DOM 조작과
// 뒤섞여 있던 위험도 계산을 순수 함수로 분리한 것. 계산식과 계수는 원본 그대로다.

/** EMA(지수이동평균) 계수. 클수록 최신 값에 민감해진다. */
export const ALPHA_EMA = 0.2;

/** 차트에 유지하는 최근 스코어 개수(= 최근 30초). */
export const MAX_HISTORY_LENGTH = 30;

/** 차트에 점선으로 그려지는 대피 임계선. 슬라이더와 무관한 고정 기준선이다. */
export const CRITICAL_THRESHOLD_LINE = 80;

/** 관제 파라미터 초기값(드로어 슬라이더의 기본 위치와 동일). */
export const DEFAULT_CONTROL_PARAMS: ControlParams = {
  evacThreshold: 70,
  alarmDelaySec: 3,
  densityWeightPercent: 40,
  manualScoreOffset: 0,
};

/** 기상 모드별 최종 스코어 배율. */
const WEATHER_MULTIPLIER: Record<WeatherMode, number> = {
  SUNNY: 1.0,
  PREDICTIVE_RAIN: 1.05,
  RAINY: 1.1,
  HOT_SUMMER: 1.15,
};

/**
 * 기상 모드별 위험 가산점.
 *
 * timeOffsetMinutes는 "현재 기준 몇 분 뒤를 보고 있는가"로, 3단계 예측 타임라인에서
 * 30분 후/60분 후를 볼 때 가중치를 키우기 위한 값이다. 지금은 화면이 항상 "현재"만
 * 보고 있어 0으로 고정돼 들어온다(원본 dashboard.js의 currentWeatherTimeOffset도
 * 선언만 되고 값이 바뀌는 곳이 없었다). 타임라인 항목을 클릭해 미래 시점을 보는
 * 기능을 붙일 때 이 인자만 채우면 된다.
 */
function computeWeatherRisk(mode: WeatherMode, timeOffsetMinutes: number): number {
  const timeRatio = timeOffsetMinutes / 60.0;
  switch (mode) {
    case 'SUNNY':
      return 0;
    case 'PREDICTIVE_RAIN':
      return Math.round(timeRatio * 15);
    case 'RAINY':
      return 15 + Math.round(timeRatio * 10);
    case 'HOT_SUMMER':
      return 10 + Math.round(timeRatio * 10);
  }
}

export interface CriInput {
  /** 해당 프레임의 감지 인원 수 */
  pedestrianCount: number;
  weatherMode: WeatherMode;
  /** 현재 기준 몇 분 뒤를 보고 있는지(지금은 항상 0) */
  weatherTimeOffsetMinutes?: number;
  params: ControlParams;
}

/**
 * 인원 수와 기상/파라미터로부터 스무딩 전 원본 CRI를 계산한다(0~100).
 *
 * AI 파이프라인이 cri_score를 직접 내려준 프레임에서는 이 함수를 쓰지 않고
 * 서버 값을 그대로 신뢰한다(서버가 CSRNet 밀도까지 본 값이라 더 정확하다).
 */
export function computeRawCri({
  pedestrianCount,
  weatherMode,
  weatherTimeOffsetMinutes = 0,
  params,
}: CriInput): number {
  const { densityWeightPercent, manualScoreOffset } = params;

  const sCount = Math.min(100, pedestrianCount * 2.2);
  const sDensity = Math.min(100, pedestrianCount * 2.5 * (densityWeightPercent / 40.0));
  const sStagnation = Math.min(100, pedestrianCount * 1.8);
  const sWeather = computeWeatherRisk(weatherMode, weatherTimeOffsetMinutes);

  const weighted =
      sCount * 0.25 +
      sDensity * (densityWeightPercent / 100.0) +
      sStagnation * 0.2 +
      sWeather * 0.15;

  const raw = weighted * WEATHER_MULTIPLIER[weatherMode] + manualScoreOffset;
  return clampScore(raw);
}

/** 0~100 범위로 자른다. */
export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** 한 스텝의 지수이동평균. */
export function applyEma(previous: number, raw: number, alpha = ALPHA_EMA): number {
  return alpha * raw + (1 - alpha) * previous;
}

export interface ControlStatusResult {
  status: ControlStatus;
  /** 상태 박스와 헤더 배지에 찍히는 문구 */
  label: string;
  /** 진행바 색상 */
  barColor: string;
}

/**
 * CRI와 대피 임계치로 관제 경보 3단계를 판정한다.
 * 혼잡주의 경계는 원본과 동일하게 임계치의 65% 지점이다.
 */
export function resolveControlStatus(cri: number, evacThreshold: number): ControlStatusResult {
  if (cri >= evacThreshold) {
    return { status: 'danger', label: 'EVACUATE / 대피경보', barColor: '#ef4444' };
  }
  if (cri >= evacThreshold * 0.65) {
    return { status: 'warning', label: 'CONGESTED / 혼잡주의', barColor: '#f59e0b' };
  }
  return { status: 'safe', label: 'NORMAL / 정상', barColor: '#10b981' };
}

/**
 * 정체 시간 표시 문자열. 60초를 넘으면 "1분 05초" 형태로 끊어 보여준다.
 */
export function formatStoppage(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds} 초`;
  return `${minutes}분 ${(seconds % 60).toString().padStart(2, '0')}초`;
}

/**
 * AI 서버가 3D 밀집율을 안 내려준 프레임의 근사값(원본과 동일한 계수).
 * 상한 99.5%는 100%로 꽉 찬 것처럼 보이지 않게 하려는 표시상의 제한이다.
 */
export function estimateOccupancyRate(pedestrianCount: number): number {
  return Math.min(99.5, Number((pedestrianCount * 1.45).toFixed(1)));
}

/** AI 서버가 정체 시간을 안 내려준 프레임의 근사값(원본과 동일한 계수). */
export function estimateStagnationSec(pedestrianCount: number): number {
  return Math.floor(pedestrianCount * 1.2);
}
