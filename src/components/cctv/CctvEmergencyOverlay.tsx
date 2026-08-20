import { useEffect, useRef, useState } from 'react';
import styles from './CctvDashboard.module.css';

// 2026-08-06: 원본 index.html의 emergency-block-backdrop + emergency-top-drawer.
// 위험 15초 지속 시 화면 조작을 차단하고, 30초까지 미확인이면 자동 신고가 접수된다.
// 타이머 계산은 useEmergencyTimer가 담당하고 여기서는 표시만 한다.
//
// 2026-08-19 (접근성): 이 오버레이는 112/119 자동 신고 카운트다운을 띄우는데
// aria-* 가 하나도 없어서 보조기기에는 아무 일도 일어나지 않는 것으로 보였다
// (WCAG 4.1.3 상태 메시지 / KWCAG 2.2 "상태 정보 제공"). 앱의 폼 오류 메시지는
// role="alert" 를 일관되게 쓰고 있었는데 정작 가장 급한 이 컴포넌트만 빠져 있었다.
//
// 설계:
//  - 카운트다운 숫자(countdownSec)는 매초 바뀐다. 이걸 live region 안에 그대로 두면
//    스크린리더가 "29초, 28초, 27초…"를 매초 읽어 다른 모든 안내를 덮어버린다.
//    숫자는 aria-hidden 으로 가리고, 읽혀야 할 시점에만 문장을 만들어 따로 둔 live
//    region 에 넣는다. 읽혀야 할 시점은 둘이다: (1) 알림이 새로 떴을 때 (2) 30초가
//    지나 자동 신고로 넘어갔을 때. 둘 다 상태가 바뀌는 순간이고, 그 사이 초 단위
//    변화는 시각 정보로 충분하다.
//  - 카드 자체는 role="alertdialog" — 확인 버튼이 있어 상호작용 대상이고, 비상 알림이라
//    dialog 보다 alertdialog 가 맞다. aria-labelledby 로 제목을, aria-describedby 로
//    본문을 연결해 보조기기가 "무엇에 대한 대화상자인지" 먼저 읽게 한다.
//  - 구역이 여럿 동시에 뜰 수 있으므로 id 는 zoneId 를 붙여 구분한다.
//  - 원래 인라인 style 에 animation: 'slideInRight' 가 있었는데 그 키프레임은 어디에도
//    정의된 적이 없어 아무 동작도 안 했다. 모듈에 정의하고 클래스로 옮겼다.
//    (prefers-reduced-motion 은 모듈의 해당 블록이 같이 처리한다)
//
// ! 이 컴포넌트는 .dashboard-root 의 자손이어야 한다. 카드 스타일이 --color-danger,
//   --shadow-rgb 같은 모듈 변수를 쓰는데 그 변수는 .dashboard-root 에 선언돼 있다.
//   position: fixed 요소라 "포털로 body 에 빼자"는 유혹이 생기기 쉬운데, 그러면 변수가
//   끊겨 테두리·그림자가 사라진다(검증 중 body 에 마운트해 보고 실제로 확인했다).

export interface ActiveEmergency {
  zoneId: number;
  zoneName: string;
  countdownSec: number;
  isAutoDispatched: boolean;
  onConfirm: () => void;
}

interface CctvEmergencyOverlayProps {
  emergencies: ActiveEmergency[];
}

/**
 * 보조기기에 읽힐 한 줄. "언제 읽히나"는 아래 훅이 정하고, 여기서는 문장만 만든다.
 * 카운트다운 초는 이 문장이 만들어지는 순간의 값이 한 번 읽히고 끝난다 - 그게 의도다.
 */
function announcementFor(em: ActiveEmergency): string {
  return em.isAutoDispatched
    ? `${em.zoneName}, 30초 경과로 112, 119 긴급 자동 신고가 접수되었습니다. 현장 출동 명령이 발송되었습니다.`
    : `${em.zoneName}, 인파 밀집 위험이 지속되고 있습니다. 확인하지 않으면 ${em.countdownSec}초 뒤 자동으로 긴급 신고가 접수됩니다.`;
}

/**
 * 읽혀야 할 순간에만 live region 의 내용을 바꾼다.
 *  - 새 zoneId 가 들어오면 → 진입 안내
 *  - 기존 zone 의 isAutoDispatched 가 false→true 로 바뀌면 → 자동 신고 안내
 * 그 외(초가 줄어드는 것)에는 내용을 건드리지 않는다. 같은 문장을 다시 넣으면 일부
 * 스크린리더가 재낭독하므로, 바뀔 때만 setState 한다.
 */
function useEmergencyAnnouncement(emergencies: ActiveEmergency[]): string {
  const [text, setText] = useState('');
  // zoneId -> 마지막으로 안내한 시점의 isAutoDispatched
  const seenRef = useRef<Map<number, boolean>>(new Map());

  useEffect(() => {
    const seen = seenRef.current;
    const lines: string[] = [];

    for (const em of emergencies) {
      const prev = seen.get(em.zoneId);
      const isNew = prev === undefined;
      const escalated = prev === false && em.isAutoDispatched;
      if (isNew || escalated) {
        lines.push(announcementFor(em));
        seen.set(em.zoneId, em.isAutoDispatched);
      }
    }

    // 사라진 구역은 기록에서 지워, 나중에 다시 뜨면 "새 알림"으로 안내되게 한다.
    const liveIds = new Set(emergencies.map((e) => e.zoneId));
    for (const id of [...seen.keys()]) {
      if (!liveIds.has(id)) seen.delete(id);
    }

    if (lines.length > 0) setText(lines.join(' '));
  }, [emergencies]);

  return text;
}

export default function CctvEmergencyOverlay({ emergencies }: CctvEmergencyOverlayProps) {
  const announcement = useEmergencyAnnouncement(emergencies);

  // live region 은 알림이 없을 때도 DOM 에 남아 있어야 한다. 보조기기는 "이미 있던
  // 영역의 내용이 바뀌는 것"을 감지하지, 영역이 새로 생기면서 내용을 가진 것은
  // 놓치는 경우가 많다. 그래서 emergencies 가 비어도 early return 하지 않는다.
  return (
    <>
      {/* 상태 안내 전용. 화면에는 보이지 않고 보조기기에만 읽힌다(sr-only).
          assertive: 비상 상황이라 현재 낭독을 끊고 즉시 읽어야 한다.
          atomic: 문장을 통째로 읽는다(부분 갱신 낭독 방지). */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {emergencies.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            pointerEvents: 'none', // 카드 사이 빈 곳은 뒤 화면이 클릭되게
          }}
        >
          {emergencies.map((em) => {
            const titleId = `emergency-title-${em.zoneId}`;
            const descId = `emergency-desc-${em.zoneId}`;
            return (
              <div
                key={em.zoneId}
                role="alertdialog"
                aria-labelledby={titleId}
                aria-describedby={descId}
                className={`${styles.emergencyTopDrawer} ${styles.active} ${styles.emergencyToast}`}
              >
                <div className={styles.emergencyDrawerContent}>
                  <div className={styles.emergencyDrawerHeader}>
                    <span id={titleId} className={styles.emergencyBadgePulse}>
                      🚨 [{em.zoneName}] 인파 밀집 위험 지속 감지
                    </span>
                    {/* 초 단위 카운트다운은 시각 전용. 매초 낭독되면 안 되므로 가린다.
                        보조기기용 값은 위 live region 의 문장에 한 번 들어간다. */}
                    <div className={styles.emergencyTimerBox} aria-hidden="true">
                      <span className={styles.timerLabel}>자동 112/119 신고까지</span>
                      <span className={styles.timerValue}>{em.countdownSec}초</span>
                    </div>
                  </div>
                  <div className={styles.emergencyDrawerBody}>
                    <div id={descId} className={styles.emergencyMsg} style={{ wordBreak: 'keep-all' }}>
                      {em.isAutoDispatched ? (
                        <>
                          🚨 <strong>[30초 경과 - 긴급 자동 신고 접수 완료]</strong><br />
                          해당 구역의 112/119 현장 출동 명령이 발송되었습니다.
                        </>
                      ) : (
                        <>
                          ⚠️ <strong>{em.zoneName}</strong>의 혼잡도 위험 점수가 높습니다.<br />
                          확인 버튼을 누르지 않으면 30초 경과 시 자동으로 긴급 신고가 접수됩니다.
                        </>
                      )}
                    </div>
                    <button type="button" className={styles.btnEmergencyConfirm} onClick={em.onConfirm}>
                      {em.isAutoDispatched
                        ? '🚨 [112/119 긴급 출동 완료 - 조작 해제]'
                        : '🚨 [확인 및 관제 조작 해제]'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
