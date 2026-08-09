import styles from './CctvDashboard.module.css';
import { WEATHER_MODE_MARKS, WEATHER_MODE_STEPS } from '../../constants/weatherScenario';
import type { WeatherMode } from '../../types/cctv';

// 2026-08-06: 원본 dashboard.js의 setWeatherModeStep()에 해당하는 부분.
// 원본은 슬라이더 두 개(메인/드로어)의 value와 눈금 span의 active-mark 클래스를
// document.querySelectorAll로 직접 동기화했는데, 여기서는 mode 하나를 props로 받아
// 두 슬라이더가 같은 상태를 그리게 한다.

interface CctvWeatherModeSliderProps {
  mode: WeatherMode;
  onChange: (mode: WeatherMode) => void;
}

export default function CctvWeatherModeSlider({ mode, onChange }: CctvWeatherModeSliderProps) {
  const stepIndex = WEATHER_MODE_STEPS.indexOf(mode);

  function selectStep(index: number) {
    const clamped = Math.min(WEATHER_MODE_STEPS.length - 1, Math.max(0, index));
    onChange(WEATHER_MODE_STEPS[clamped]);
  }

  return (
      <>
        <input
            type="range"
            min={0}
            max={WEATHER_MODE_STEPS.length - 1}
            step={1}
            value={stepIndex}
            className={`${styles.timelineSlider} ${styles.weatherModeSlider}`}
            onChange={(e) => selectStep(Number(e.target.value))}
        />
        <div className={styles.weatherModeMarks}>
          {WEATHER_MODE_MARKS.map((label, index) => (
              <span
                  key={label}
                  className={index === stepIndex ? styles.activeMark : undefined}
                  onClick={() => selectStep(index)}
              >
                {label}
              </span>
          ))}
        </div>
      </>
  );
}
