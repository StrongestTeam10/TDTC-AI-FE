// 2026-08-06 신규: 기존 public/mangwon/js/dashboard.js의 changeWeatherMode()에
// if/else로 늘어져 있던 기상 시나리오 문구와 가중치를 데이터 테이블로 옮긴 것.
//
// ⚠️ 이 값들은 실제 기상청 API 응답이 아니라 관제 시연용으로 하드코딩된 문구다.
// BE에 GET /api/v1/external-factors(ExternalFactorDto: weatherCondition/temperature)가
// 이미 있으므로, 실제 기상 데이터 연동 시 이 테이블을 그 응답으로 대체하면 된다.
import type { WeatherMode } from '../types/cctv';

/** 슬라이더 0~3 인덱스 순서. setWeatherModeStep(index)가 이 배열을 참조한다. */
export const WEATHER_MODE_STEPS: WeatherMode[] = [
  'SUNNY',
  'PREDICTIVE_RAIN',
  'RAINY',
  'HOT_SUMMER',
];

/** 슬라이더 아래 눈금에 찍히는 짧은 라벨. */
export const WEATHER_MODE_MARKS = ['☀️ 맑음', '🔮 30분후비', '🌧️ 우천실황', '🥵 폭염특보'];

export interface WeatherTimelineEntry {
  /** 상단 굵은 줄 - 체감온도/강수량 등 */
  main: string;
  /** 하단 회색 줄 - 위험 가중치 및 관제 지침 */
  sub: string;
}

export interface WeatherScenario {
  /** 슬라이더 옆 배지에 뜨는 현재 모드 이름 */
  label: string;
  /** 비디오 좌상단 오버레이 배지 문구 */
  badgeText: string;
  /** 기상청 3단계 예측 타임라인 (현재 / 30분 후 / 1시간 후) */
  current: WeatherTimelineEntry;
  after30m: WeatherTimelineEntry;
  after60m: WeatherTimelineEntry;
}

export const WEATHER_SCENARIOS: Record<WeatherMode, WeatherScenario> = {
  SUNNY: {
    label: '현재 맑음',
    badgeText: '현재 맑음 / 기본 관제 가동중',
    current: {
      main: '현재 체감 28.5℃ / 습도 45%',
      sub: '위험 가중치 +0 pt / 쾌적한 관제 환경',
    },
    after30m: {
      main: '예측 체감 29.2℃ / 강수확률 10%',
      sub: '위험 가중치 +0 pt / 평시 유입 모니터링',
    },
    after60m: {
      main: '예측 체감 29.0℃ / 불쾌지수 [보통]',
      sub: '위험 가중치 +0 pt / 기상 위험 특이사항 없음',
    },
  },
  PREDICTIVE_RAIN: {
    label: '약 30분후 비 예보',
    badgeText: '약 30분후 비 예보 / 인구 유입 감시 모드',
    current: {
      main: '현재 체감 34.2℃ / 습도 75%',
      sub: '위험 가중치 +0 pt / 평시 관제 상태',
    },
    after30m: {
      main: '약 30분후 강수확률 60%',
      sub: '위험 가중치 +10 pt / 인구 유입 감시 모드 가동',
    },
    after60m: {
      main: '약 60분후 불쾌지수 [매우높음]',
      sub: '위험 가중치 +15 pt / 골목 혼잡 주의',
    },
  },
  RAINY: {
    label: '현재 호우 상황',
    badgeText: '현재 호우 상황 / 바닥 미끄럼 & 출구 집중 관제',
    current: {
      main: '현재 강수량 15.5mm/h / 미끄럼 주의',
      sub: '위험 가중치 +15 pt / 악천후 관제 가동중',
    },
    after30m: {
      main: '강수 지속 (18.0mm/h) / 유입 인파 집결',
      sub: '위험 가중치 +20 pt / 정체 유연 집중 감시',
    },
    after60m: {
      main: '소강 상태 진입 예상 / 습도 90%',
      sub: '위험 가중치 +10 pt / 이탈 인파 서서히 증가',
    },
  },
  HOT_SUMMER: {
    label: '폭염 경보',
    badgeText: '폭염 경보 / 밀실 열기 갇힘 모니터링',
    current: {
      main: '현재 체감온도 37.8℃ / 열섬 효과',
      sub: '위험 가중치 +20 pt / 온열질환 발생 주의',
    },
    after30m: {
      main: '예측 체감온도 38.5℃ / 불쾌지수 [최고조]',
      sub: '위험 가중치 +25 pt / 장시간 체류 이탈 안내',
    },
    after60m: {
      main: '예측 체감온도 36.5℃ / 약풍 1.2m/s',
      sub: '위험 가중치 +15 pt / 쉼터 구역 안내',
    },
  },
};
