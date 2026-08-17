// 2026-08-11 신규: CCTV 관제 구역의 GeoJSON Polygon 변환 헬퍼.
//
// 저장 형식은 시뮬레이션 구역(mrkaddr01d.polygon_coordinates)과 동일한
// GeoJSON Polygon 문자열이다. GeoJSON은 좌표를 [경도, 위도] 순으로 쓰는데
// 카카오맵 API는 (위도, 경도) 순이라 뒤집혀서, 그 변환을 한 곳에 모아둔다.
//
// ⚠️ 형식만 같을 뿐 저장되는 테이블은 완전히 다르다(mrkcctv01m).
// 시뮬레이션 구역과 섞이면 SIM이 CCTV 구역까지 에이전트 배치 대상으로 잡는다.

/** 화면에서 다루는 꼭짓점 순서: [위도, 경도] (카카오맵과 동일) */
export type LatLng = [number, number];

/** CCTV 호모그래피 ROI라 꼭짓점은 사각형 4개로 고정한다(BE도 같은 값으로 검증). */
export const CCTV_ZONE_VERTEX_COUNT = 4;

/**
 * 꼭짓점 목록을 GeoJSON Polygon 문자열로 만든다.
 *
 * GeoJSON 링은 첫 점과 끝 점이 같아야 하므로(닫힌 링) 마지막에 첫 점을 한 번 더 넣는다.
 * BE의 검증도 이 규칙을 전제로 꼭짓점을 센다.
 */
export function verticesToGeoJson(vertices: LatLng[]): string {
  const ring = vertices.map(([lat, lng]) => [lng, lat]);
  if (ring.length > 0) {
    ring.push([...ring[0]]);
  }
  return JSON.stringify({ type: 'Polygon', coordinates: [ring] });
}

/**
 * 2026-08-14 추가: 점 목록을 GeoJSON LineString 문자열로 만든다.
 *
 * 시장 영역을 잘라 구역을 나눌 때(POST /markets/{id}/zones/split) 자르는 선을
 * 이 형식으로 보낸다. Polygon과 달리 링을 닫지 않는다 - 닫으면 BE가 직선이 아니라
 * 도형으로 읽는다. 좌표를 [경도, 위도]로 뒤집는 규칙은 위와 같다.
 */
export function verticesToLineStringGeoJson(vertices: LatLng[]): string {
  return JSON.stringify({
    type: 'LineString',
    coordinates: vertices.map(([lat, lng]) => [lng, lat]),
  });
}

/**
 * 저장된 GeoJSON Polygon 문자열을 꼭짓점 목록으로 되돌린다.
 * 닫힌 링의 마지막 중복점은 제거해서 화면에서 4점으로 보이게 한다.
 * 깨진 값이 하나 섞여도 화면 전체가 죽지 않도록 실패 시 빈 배열을 준다.
 */
export function geoJsonToVertices(polygonCoordinates: string): LatLng[] {
  try {
    const geo = JSON.parse(polygonCoordinates);
    const ring = geo?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length === 0) return [];

    const points: LatLng[] = ring
        .filter((pt: unknown): pt is number[] => Array.isArray(pt) && pt.length >= 2)
        .map((pt: number[]) => [pt[1], pt[0]] as LatLng);

    if (
        points.length >= 2 &&
        points[0][0] === points[points.length - 1][0] &&
        points[0][1] === points[points.length - 1][1]
    ) {
      points.pop();
    }
    return points;
  } catch {
    console.warn('[CCTV 구역] 좌표 JSON 파싱 실패', polygonCoordinates.slice(0, 80));
    return [];
  }
}

/**
 * 구역 번호별 색상. 네 구역을 지도와 목록에서 같은 색으로 알아볼 수 있게 고정한다.
 * (컴포넌트 파일에 두면 fast refresh가 깨져서 유틸에 둔다)
 */
const ZONE_COLORS = ['#f97316', '#8b5cf6', '#0ea5e9', '#22c55e'];

export function zoneColor(zoneNo: number): string {
  return ZONE_COLORS[(zoneNo - 1) % ZONE_COLORS.length];
}

/** 목록/상세에 보여줄 짧은 좌표 요약. */
export function formatVertexSummary(vertices: LatLng[]): string {
  if (vertices.length === 0) return '-';
  return vertices
      .map(([lat, lng]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      .join(' / ');
}
