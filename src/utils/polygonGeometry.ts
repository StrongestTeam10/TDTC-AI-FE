// 2026-08-11 신규: CCTV 구역이 소속 시뮬레이션 구역 폴리곤 밖으로 나가지 않게 하는
// 기하 판정. 좌표는 화면에서 쓰는 [위도, 경도] 순([lat, lng])으로 통일한다.
//
// 판정은 위경도를 평면 좌표처럼 다룬다. 시장 하나 크기(수백 m)에서는 위경도 왜곡이
// 무시할 수준이라 포함 여부 판정에는 문제가 없다.

import type { LatLng } from './cctvZonePolygon';

/**
 * 점이 폴리곤 안에 있는지(ray casting). 경계선 위의 점도 안으로 본다.
 * BE(CctvZoneService.isPointInPolygon)와 같은 알고리즘이다.
 */
export function isPointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  const [py, px] = point; // [lat, lng] → y=lat, x=lng
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 경계선 위의 점은 CCTV ROI 꼭짓점으로 허용하지 않는다. */
/** 선분 방향 판정용 외적 부호. */
function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return (
    Math.min(ax, bx) <= px &&
    px <= Math.max(ax, bx) &&
    Math.min(ay, by) <= py &&
    py <= Math.max(ay, by)
  );
}

/**
 * 두 선분이 (경계 포함) 교차하는지. 꼭짓점만 맞닿는 경우는 교차로 보지 않는다
 * (폴리곤 변과 CCTV 변이 한 점만 공유하는 건 밖으로 나간 게 아니므로).
 */
export function segmentsProperlyIntersect(a1: LatLng, a2: LatLng, b1: LatLng, b2: LatLng): boolean {
  const [a1y, a1x] = a1;
  const [a2y, a2x] = a2;
  const [b1y, b1x] = b1;
  const [b2y, b2x] = b2;

  const d1 = cross(b1x, b1y, b2x, b2y, a1x, a1y);
  const d2 = cross(b1x, b1y, b2x, b2y, a2x, a2y);
  const d3 = cross(a1x, a1y, a2x, a2y, b1x, b1y);
  const d4 = cross(a1x, a1y, a2x, a2y, b2x, b2y);

  // 양쪽이 서로 반대편에 있으면 확실히 가로지른다.
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // 한 끝점이 다른 선분 위에 정확히 얹힌(겹치는) 경우만 교차로 처리한다.
  if (d1 === 0 && onSegment(b1x, b1y, b2x, b2y, a1x, a1y)) return pointStrictlyOnSegment(a1, b1, b2);
  if (d2 === 0 && onSegment(b1x, b1y, b2x, b2y, a2x, a2y)) return pointStrictlyOnSegment(a2, b1, b2);
  if (d3 === 0 && onSegment(a1x, a1y, a2x, a2y, b1x, b1y)) return pointStrictlyOnSegment(b1, a1, a2);
  if (d4 === 0 && onSegment(a1x, a1y, a2x, a2y, b2x, b2y)) return pointStrictlyOnSegment(b2, a1, a2);

  return false;
}

/** 점이 선분의 양 끝이 아닌 "내부"에 얹혀 있는지(끝점만 닿는 건 제외). */
function pointStrictlyOnSegment(p: LatLng, s1: LatLng, s2: LatLng): boolean {
  const samePoint = (a: LatLng, b: LatLng) => a[0] === b[0] && a[1] === b[1];
  if (samePoint(p, s1) || samePoint(p, s2)) return false;
  return true;
}

/**
 * 선분이 폴리곤 안에 완전히 들어있는지.
 * (1) 양 끝점이 폴리곤 안에 있고, (2) 폴리곤의 어느 변과도 가로지르지 않으면 안쪽이다.
 * 오목한 구역에서 두 점은 안에 있어도 선분이 밖으로 삐져나오는 경우를 이 교차 검사로 잡는다.
 *
 * ⚠️ 2026-08-11 현재 CCTV 구역 그리기에서는 사용하지 않는다. 선분이 구역을 벗어나지
 * 못하게 강제하면 사용자가 찍은 위치가 다른 곳으로 옮겨져 원하는 사각형이 안 나와서,
 * "점은 클릭 위치 보존(snapPointIntoPolygon)만" 하도록 바꿨다. 선분 제약이 다시
 * 필요해지면 이 함수와 clampVertexIntoPolygonWithEdge를 쓰면 된다.
 */
export function isSegmentInsidePolygon(p1: LatLng, p2: LatLng, ring: LatLng[]): boolean {
  if (!isPointInPolygon(p1, ring) || !isPointInPolygon(p2, ring)) return false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (segmentsProperlyIntersect(p1, p2, ring[j], ring[i])) return false;
  }
  return true;
}

/** 폴리곤 꼭짓점 평균 중심점. 닫힌 링의 마지막 중복점도 그냥 평균에 섞여 오차가 미미하다. */
function polygonCentroid(ring: LatLng[]): LatLng {
  const sum = ring.reduce(
    (acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng] as LatLng,
    [0, 0] as LatLng
  );
  return [sum[0] / ring.length, sum[1] / ring.length];
}

/** 점 p에서 선분 a-b에 내린 수선의 발(선분 범위로 클램프). 반환은 [위도, 경도]. */
function closestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const [py, px] = p;
  const [ay, ax] = a;
  const [by, bx] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [ay, ax]; // a와 b가 같은 점
  // 투영 비율 t를 0~1로 클램프해 선분 밖으로 나가지 않게 한다.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [ay + t * dy, ax + t * dx];
}

/**
 * 폴리곤 밖의 점을 폴리곤 경계에서 "가장 가까운" 안쪽 점으로 끌어당긴다. 밖에서 찍었을 때
 * "선택 불가"로 막는 대신, 클릭 위치를 최대한 보존하며 안쪽으로 넣어주기 위한 것.
 * 이미 안에 있는 점은 그대로 돌려준다(왜곡 0).
 *
 * 클릭 위치를 그대로 살리는 게 핵심이다. 사용자가 구역 가장자리를 따라 4점을 찍어
 * 사각형을 만들 때, 찍은 위치가 다른 곳으로 옮겨지면 원하는 사각형이 안 나온다.
 * (한때 "구역 중심 방향으로 당기는" 방식을 썼다가, 클릭 위치가 중심 쪽으로 왜곡돼
 * 사각형이 뭉치는 문제가 있어 이 최단거리 방식으로 되돌렸다.)
 */
export function snapPointIntoPolygon(point: LatLng, ring: LatLng[]): LatLng {
  if (ring.length < 3) return point;
  if (isPointInPolygon(point, ring)) return point;

  // 모든 변에 대해 최단 투영점을 구해 가장 가까운 것을 고른다(= 클릭에서 최소 이동).
  let best: LatLng = ring[0];
  let bestDistSq = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const proj = closestPointOnSegment(point, ring[j], ring[i]);
    const dLat = proj[0] - point[0];
    const dLng = proj[1] - point[1];
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = proj;
    }
  }

  // 경계 위 점은 부동소수 오차로 밖 판정될 수 있어, 중심 쪽으로 아주 살짝 밀어 확실히 안에 둔다.
  const center = polygonCentroid(ring);
  const EPS = 1e-7;
  const snapped: LatLng = [
    best[0] + (center[0] - best[0]) * EPS,
    best[1] + (center[1] - best[1]) * EPS,
  ];
  return isPointInPolygon(snapped, ring)
    ? snapped
    : [best[0] + (center[0] - best[0]) * 1e-4, best[1] + (center[1] - best[1]) * 1e-4];
}

/**
 * 선분 a1→a2와 b1→b2의 교차 지점을 a1→a2 기준 비율 t(0~1)로 돌려준다. 안 만나면 null.
 * 폴리곤 경계를 어디서 뚫는지 찾는 데 쓴다.
 */
function segmentIntersectionParam(a1: LatLng, a2: LatLng, b1: LatLng, b2: LatLng): number | null {
  const [a1y, a1x] = a1;
  const [a2y, a2x] = a2;
  const [b1y, b1x] = b1;
  const [b2y, b2x] = b2;

  const rX = a2x - a1x;
  const rY = a2y - a1y;
  const sX = b2x - b1x;
  const sY = b2y - b1y;

  const denom = rX * sY - rY * sX;
  if (denom === 0) return null; // 평행

  const t = ((b1x - a1x) * sY - (b1y - a1y) * sX) / denom;
  const u = ((b1x - a1x) * rY - (b1y - a1y) * rX) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

/** 폴리곤 bounding box 대각선 길이(위경도 단위). 뭉침 판정의 스케일 기준. */
function polygonSpan(ring: LatLng[]): number {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const dLat = maxLat - minLat;
  const dLng = maxLng - minLng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * 이전 점(prev)에서 클릭 지점으로 향할 때 찍을 안쪽 점을 정한다.
 *
 * 1. 클릭이 밖이면 방향 보존으로 안쪽에 스냅한다(snapPointIntoPolygon).
 * 2. prev→스냅점 선분이 이미 폴리곤 안이면 그대로 쓴다(대부분 이 경우).
 * 3. 오목 구역이라 선분이 경계를 뚫으면, 경계 직전(안쪽)까지 당겨 "선이 구역 안에서
 *    멈추게" 한다. 단 그 결과가 prev와 거의 겹치면(가늘고 긴 구역에서 사각형이 안 됨)
 *    선 제약을 포기하고 방향 보존 스냅점을 그대로 써서 사각형이 형성되게 한다.
 */
export function clampVertexIntoPolygonWithEdge(
  prev: LatLng | null,
  click: LatLng,
  ring: LatLng[]
): LatLng {
  const snapped = snapPointIntoPolygon(click, ring);
  if (!prev) return snapped;
  if (isSegmentInsidePolygon(prev, snapped, ring)) return snapped;

  // prev→snapped 선분이 폴리곤 경계를 처음 만나는 t를 찾는다(가장 prev에 가까운 교차).
  let firstT: number | null = null;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const t = segmentIntersectionParam(prev, snapped, ring[j], ring[i]);
    // prev(=t 0)에 딱 붙은 교차는 이전 꼭짓점 자신이므로 아주 작은 값은 건너뛴다.
    if (t !== null && t > 1e-9 && (firstT === null || t < firstT)) firstT = t;
  }
  if (firstT === null) return snapped; // 교차를 못 찾으면 스냅점 그대로

  // 경계 바로 앞(안쪽)으로 물러난 지점.
  const backedT = Math.max(0, firstT - 1e-3);
  let clamped: LatLng = [
    prev[0] + (snapped[0] - prev[0]) * backedT,
    prev[1] + (snapped[1] - prev[1]) * backedT,
  ];
  if (!(isPointInPolygon(clamped, ring) && isSegmentInsidePolygon(prev, clamped, ring))) {
    const saferT = Math.max(0, firstT - 1e-2);
    clamped = [
      prev[0] + (snapped[0] - prev[0]) * saferT,
      prev[1] + (snapped[1] - prev[1]) * saferT,
    ];
  }

  // 뭉침 방지: 당긴 점이 prev와 거의 겹치면(구역 대각선의 3% 미만) 사각형이 안 되므로,
  // 선이 살짝 삐져나가더라도 방향 보존 스냅점을 그대로 써서 서로 다른 꼭짓점이 되게 한다.
  const gap = Math.hypot(clamped[0] - prev[0], clamped[1] - prev[1]);
  if (gap < polygonSpan(ring) * 0.03) return snapped;
  return clamped;
}
