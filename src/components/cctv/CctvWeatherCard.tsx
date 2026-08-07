import styles from './CctvDashboard.module.css';
import CctvWeatherModeSlider from './CctvWeatherModeSlider';
import CctvWeatherTimeline from './CctvWeatherTimeline';
import { WEATHER_SCENARIOS } from '../../constants/weatherScenario';
import type { WeatherMode } from '../../types/cctv';

// 2026-08-06: 원본 index.html의 <div class="card weather-card"> 블록.

interface CctvWeatherCardProps {
  mode: WeatherMode;
  onChange: (mode: WeatherMode) => void;
}

export default function CctvWeatherCard({ mode, onChange }: CctvWeatherCardProps) {
  return (
      <div className={`${styles.card} ${styles.weatherCard}`}>
        <div className={styles.cardTitle}>
          <span>🌦️ 기상청 초단기예보 타임라인</span>
          <span className={styles.weatherStatusTag}>PREDICTIVE ACTIVE</span>
        </div>

        <div className={styles.mainWeatherModeBox}>
          <div className={styles.sliderHeaderInfo}>
            <span className={styles.sliderTitle}>🖐️ 날씨 드래그 변경:</span>
            <span className={styles.weatherModeBadge}>{WEATHER_SCENARIOS[mode].label}</span>
          </div>
          <CctvWeatherModeSlider mode={mode} onChange={onChange} />
        </div>

        <CctvWeatherTimeline mode={mode} />
      </div>
  );
}
