// 2026-08-19 추가: CCTV 관제 구역 목록의 단일 출처.
//
// 그동안 같은 구역명이 네 곳에 흩어져 있었고 표기까지 갈렸다.
//   CctvControlDashboard  zonesData 배열          '남측 구역'
//   CctvControlDashboard  currentZoneName 삼항     '남측 구역'
//   CctvZoneGallery       ZONES 배열              '남측 구역'
//   CctvZonePopupModal    zoneName 삼항           '남측'      <- 여기만 짧은 이름
// 이름을 하나 고치려면 네 곳을 찾아야 했고, 실제로 한 곳이 어긋나 있었다.
//
// ────────────────────────────────────────────────────────────────
// ⚠️ 이 목록을 API에서 받아오려고 하지 말 것
// ────────────────────────────────────────────────────────────────
// 공통코드 규칙("코드값은 DB가 유일한 출처")이 여기엔 적용되지 않는다.
// 아래 id 는 DB 구역 ID(mrkaddr01d.zone_id)가 아니라 CCTV AI 서버가 영상 파일을
// 찾는 폴더 이름이다.
//
//   TDTC-AI-CCTV/server/routers/cctv.py  find_sample_video_for_zone()
//     os.path.join(BASE_DIR, "..", "zone", f"zone_id{zone_id}")
//
// fetchZones(marketId) 가 돌려주는 DB zoneId 를 여기 넣으면 CCTV 서버가 해당
// 폴더를 못 찾고, 영상 대신 "Stream Waiting..." 회색 화면을 무한히 내보낸다
// (그 서버는 파일이 없을 때 에러가 아니라 대기 화면을 스트리밍한다).
//
// 구역 수를 동적으로 만드는 것도 지금 구조로는 막혀 있다. CctvControlDashboard 가
// useCriScore / useEmergencyTimer 를 구역당 하나씩 최상위에서 호출하는데, 훅은
// 개수가 변하는 반복문에서 부를 수 없다. 구역 하나를 담당하는 자식 컴포넌트로
// 쪼개는 작업이 먼저다.
//
// 정리하면 - 구역을 늘리려면 (1) CCTV 서버에 zone/zone_id{N} 폴더를 만들고
// (2) 이 배열에 추가한 뒤 (3) 대시보드의 훅 호출을 그 개수만큼 맞춰야 한다.

export interface CctvZone {
  /** CCTV AI 서버의 zone/zone_id{N} 폴더 번호. DB zoneId 가 아니다. */
  id: number;
  name: string;
}

export const CCTV_ZONES: CctvZone[] = [
  { id: 1, name: '남측 구역' },
  { id: 2, name: '중앙 구역' },
  { id: 3, name: '북측 구역' },
];

/** 구역을 고르지 않았을 때(종합 보기) 쓰는 이름. */
export const ALL_ZONES_LABEL = '종합대시보드';

/**
 * 구역 이름을 돌려준다. null 이면 종합 보기.
 * 목록에 없는 id 는 조용히 엉뚱한 이름을 주는 대신 번호를 그대로 드러낸다
 * - 예전 삼항 방식은 4 이상이면 전부 '북측'으로 보였다.
 */
export function cctvZoneName(id: number | null): string {
  if (id === null) return ALL_ZONES_LABEL;
  return CCTV_ZONES.find((z) => z.id === id)?.name ?? `구역 ${id}`;
}
