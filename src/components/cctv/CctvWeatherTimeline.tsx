import styles from './CctvDashboard.module.css';
import { WEATHER_SCENARIOS } from '../../constants/weatherScenario';
import type { WeatherMode } from '../../types/cctv';

// 2026-08-06: 원본 index.html에 같은 마크업이 두 번(메인 기상 카드 + 우측 드로어)
// 복사돼 있었고, dashboard.js도 wt-*/drawer-wt-* 두 벌의 DOM 참조를 각각 들고
// 갱신했다. 하나의 컴포넌트로 합쳤다.

export default function CctvWeatherTimeline({ mode }: { mode: WeatherMode }) {
  const scenario = WEATHER_SCENARIOS[mode];

  const items = [
    { badge: '[현재]', badgeClass: styles.current, entry: scenario.current, rowClass: styles.active },
    { badge: '[30분 후]', badgeClass: styles.future30, entry: scenario.after30m, rowClass: styles.highlight },
    { badge: '[1시간 후]', badgeClass: styles.future60, entry: scenario.after60m, rowClass: '' },
  ];

  return (
      <div className={styles.weatherTimelineList}>
        {items.map((item) => (
            <div key={item.badge} className={`${styles.weatherTimelineItem} ${item.rowClass}`}>
              <div className={`${styles.itemTimeBadge} ${item.badgeClass}`}>{item.badge}</div>
              <div className={styles.itemDetails}>
                <div className={styles.itemMainText}>{item.entry.main}</div>
                <div className={styles.itemSubText}>{item.entry.sub}</div>
              </div>
            </div>
        ))}
      </div>
  );
}
