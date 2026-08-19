import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThemeStore } from '../store/themeStore';
import type { AgentState, Zone, PlacedObject, Gate, EventTrigger, Building } from '../types';

// 2026-08-19 신규: HeatmapView(SVG 2D)의 3D 판.
//
// props가 HeatmapView와 완전히 동일해서 부모(SimulationComparePage)는 컴포넌트
// 이름만 바꿔 끼우면 된다. 시뮬레이션에는 전혀 관여하지 않는다 - SIM이 계산해
// 내려준 frames를 그리기만 하므로 초기 배치·이동·대피·위험도·보고서는 그대로다.
//
// 2D를 3D로 바꾼 이유는 건물 높이(mrkbldg01m.height_m)를 이미 갖고 있어서
// 압출만 하면 실제 시장 형상이 나오기 때문이다. 나중에 시설 사진
// (mrkfcph01d, direction_code로 방향까지 라벨링돼 있다)을 건물 텍스처로
// 입히면 실제 시장 모습이 된다.

export interface ZoneRisk {
  zoneId: number;
  riskLevel?: string;
  riskScore?: number;
}

export interface CorridorEdge {
  fromZoneId: number;
  toZoneId: number;
  pathCoordinates: string | null;
}

interface HeatmapView3DProps {
  zones: Zone[];
  agents: AgentState[];
  zoneRisks?: ZoneRisk[];
  buildings?: Building[];
  /**
   * 화재 인지 전파 링을 그릴 현재 스텝. SIM은 인지 반경을 응답에 담지 않지만
   * 규칙(초기 8m + 스텝당 10m)이 고정이라 발동 스텝과 현재 스텝으로 복원할 수 있다.
   */
  currentStep?: number;
  width?: number | string;
  height?: number | string;
  transitionMs?: number;
  corridors?: CorridorEdge[];
  gates?: Gate[];
  closedGateIds?: Set<number>;
  onGateClick?: (facilityId: number) => void;
  placementType?: PlacedObject['objectType'] | EventTrigger['eventType'] | null;
  onPlaceObject?: (zoneId: number, latitude: number, longitude: number) => void;
  placedObjects?: PlacedObject[];
  events?: EventTrigger[];
  focusEvent?: EventTrigger | null;
  viewCenter?: { lon: number; lat: number };
  viewZoom?: number;
  onViewportChange?: (v: { lon: number; lat: number; zoom: number }) => void;
}

// 위험도 색은 2D(HeatmapView)와 같은 값을 쓴다. 두 화면을 오갈 때 색이 달라지면
// 같은 구역이 다른 등급처럼 보인다.
const RISK_COLOR: Record<string, number> = {
  low: 0x3b82f6,
  medium: 0xf59e0b,
  high: 0xf97316,
  critical: 0xef4444,
};
const DEFAULT_ZONE_COLOR = 0x64748b;

// 에이전트 색 구분 기준(60/30)도 2D와 동일하다.
const AGENT_RED = 0xef4444;
const AGENT_YELLOW = 0xeab308;
const AGENT_BLUE = 0x38bdf8;

// 체류 중(STAYING)인 사람을 키우는 배수.
//
// 2D는 채움색=위험도, 테두리=행동으로 채널이 분리돼 있었다. 3D로 옮길 때 이 둘을
// 색 하나에 섞었더니 "위험한데 체류 중"인 사람이 분홍이 되어, 범례의 안전/주의/위험
// 어디에도 없는 색이 돌아다녔다. 위험도 색은 이 화면에서 가장 중요한 정보라
// 오염시키면 안 된다. 색은 위험도 전용으로 되돌리고, 행동은 크기로 나타낸다.
// 인스턴싱에서 배율은 이미 행렬에 쓰고 있어 추가 비용이 사실상 없고, 한자리에
// 뭉친 사람은 덩어리가 커져 오히려 더 눈에 띈다.
const STAYING_SCALE = 1.3;

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25; // 2D(HeatmapView)의 +/- 한 번 배율과 같게 맞춘다

type LonLat = [number, number];

function parsePolygon(polygonCoordinates: string): LonLat[] | null {
  try {
    const geo = JSON.parse(polygonCoordinates);
    const ring = geo?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    return ring.map((pt: number[]) => [pt[0], pt[1]] as LonLat);
  } catch {
    return null;
  }
}

function parseLineString(coordinates: string): LonLat[] | null {
  try {
    const geo = JSON.parse(coordinates);
    const line = geo?.coordinates;
    if (!Array.isArray(line) || line.length < 2) return null;
    return line.map((pt: number[]) => [pt[0], pt[1]] as LonLat);
  } catch {
    return null;
  }
}

function pointInPolygon(lon: number, lat: number, polygon: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonCentroid(ring: LonLat[]): LonLat {
  let lon = 0;
  let lat = 0;
  ring.forEach(([lo, la]) => {
    lon += lo;
    lat += la;
  });
  return [lon / ring.length, lat / ring.length];
}

// SIM의 LocalProjection과 같은 등거리 근사. 시장 규모(수백 m)에서는 정밀 투영 없이
// 충분하고, 두 곳이 같은 공식을 써야 에이전트 좌표가 구역 폴리곤과 어긋나지 않는다.
const METERS_PER_DEG_LAT = 111_132;
const metersPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function disposeGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    if (!child) continue;
    child.traverse((node) => {
      const mesh = node as THREE.Mesh;
      // Sprite는 three.js 내부에서 지오메트리 하나를 모든 인스턴스가 공유한다.
      // 여기서 dispose하면 살아 있는 다른 Sprite(구역 이름표 등)의 GPU 버퍼까지
      // 날아가 다음 프레임에 다시 올려야 한다.
      if (mesh.geometry && !(node instanceof THREE.Sprite)) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (material) {
        (Array.isArray(material) ? material : [material]).forEach((m) => {
          // Material.dispose()는 붙어 있는 텍스처를 지우지 않는다. 구역 이름표는
          // 캔버스로 매번 새 텍스처를 굽기 때문에, 이걸 안 지우면 테마 전환이나
          // 게이트 개폐처럼 정적 씬을 다시 만들 때마다 GPU 메모리가 쌓인다.
          const map = (m as THREE.Material & { map?: THREE.Texture }).map;
          if (map) map.dispose();
          m.dispose();
        });
      }
    });
  }
}


// ── 배치 오브젝트 형상 ──────────────────────────────────────
// 색 상자 하나로는 무엇을 놓았는지 알 수 없어, 실제 물건 모양으로 만든다.
// 치수는 SIM이 쓰는 값과 맞춘다(푸드트럭 = 1톤 트럭 전장 5.2m·전폭 1.74m,
// 적재물 = 반경 0.5m 소형). 그래야 화면 크기와 통행 차단 범위가 어긋나지 않는다.

function makeFoodTruck(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xf3f4f0, roughness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x38566e, roughness: 0.25, metalness: 0.2 });

  const cargo = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.95, 1.74), body);
  cargo.position.set(0.75, 1.55, 0);
  cargo.castShadow = true;
  g.add(cargo);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.42, 1.78), accent);
  stripe.position.set(0.75, 0.95, 0);
  g.add(stripe);

  // 판매창 + 차양
  const window = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.06), dark);
  window.position.set(0.75, 1.75, 0.9);
  g.add(window);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 1.25), accent);
  awning.position.set(0.75, 2.42, 1.42);
  awning.rotation.x = -0.32;
  awning.castShadow = true;
  g.add(awning);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.45, 1.7), body);
  cab.position.set(-1.65, 1.25, 0);
  cab.castShadow = true;
  g.add(cab);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1.5), glass);
  windshield.position.set(-2.38, 1.6, 0);
  g.add(windshield);

  [[-1.55, 0.88], [-1.55, -0.88], [1.55, 0.88], [1.55, -0.88]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    g.add(wheel);
  });
  return g;
}

function makeObstacle(): THREE.Group {
  const g = new THREE.Group();
  const light = new THREE.MeshStandardMaterial({ color: 0xb07a42, roughness: 0.92 });
  const darkBox = new THREE.MeshStandardMaterial({ color: 0x8a5b2e, roughness: 0.92 });

  // 쌓아 올린 적재 상자. 반듯하게 놓지 않고 조금씩 틀어야 적치물처럼 보인다.
  const specs: Array<[number, number, number, number, THREE.Material]> = [
    [-0.34, 0.29, 0.02, 0.15, light],
    [0.36, 0.27, -0.06, -0.22, darkBox],
    [0.02, 0.82, 0.05, 0.42, light],
  ];
  specs.forEach(([px, py, pz, ry, mat]) => {
    const size = py > 0.6 ? 0.62 : 0.72;
    const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.82, size), mat);
    box.position.set(px, py, pz);
    box.rotation.y = ry;
    box.castShadow = true;
    g.add(box);
  });
  return g;
}

function makeEventZone(): THREE.Group {
  const g = new THREE.Group();
  const span = 4.2;
  const height = 2.6;
  const leg = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.5 });
  const roof = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6, roughness: 0.7, side: THREE.DoubleSide,
  });

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, height, 8), leg);
    pole.position.set((sx * span) / 2, height / 2, (sz * span) / 2);
    g.add(pole);
  });

  const canopy = new THREE.Mesh(new THREE.ConeGeometry(span * 0.78, 1.15, 4), roof);
  canopy.position.y = height + 0.5;
  canopy.rotation.y = Math.PI / 4;
  canopy.castShadow = true;
  g.add(canopy);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(span * 0.72, 28),
    new THREE.MeshBasicMaterial({
      color: 0x8b5cf6, transparent: true, opacity: 0.16, depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.07;
  g.add(pad);
  return g;
}

function makeRestArea(): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bec5, roughness: 0.5 });
  const shade = new THREE.MeshStandardMaterial({
    color: 0x14b8a6, roughness: 0.75, side: THREE.DoubleSide,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.9 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8), metal);
  pole.position.y = 1.2;
  g.add(pole);
  const parasol = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.72, 10), shade);
  parasol.position.y = 2.45;
  parasol.castShadow = true;
  g.add(parasol);

  [-1.5, 1.5].forEach((bx) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 1.7), wood);
    seat.position.set(bx, 0.46, 0);
    seat.castShadow = true;
    g.add(seat);
    [-0.66, 0.66].forEach((lz) => {
      const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.1), metal);
      legMesh.position.set(bx, 0.23, lz);
      g.add(legMesh);
    });
  });

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 28),
    new THREE.MeshBasicMaterial({
      color: 0x14b8a6, transparent: true, opacity: 0.16, depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.07;
  g.add(pad);
  return g;
}

/**
 * 게이트(출입구) 표지.
 *
 * 처음엔 원반 위 막대라 디버그 마커 같았고, 다음엔 기둥에 각진 보를 얹어 골대처럼
 * 보였다. 결국 비상구 표지(EXIT)로 간다 - 인파 안전을 다루는 화면이라 이게 가장
 * 맞는 시각 언어이고, 문 모양을 3D로 흉내 내는 것보다 훨씬 빨리 읽힌다.
 *
 * 표지는 Sprite로 만든다. 사용자가 지도를 자유롭게 돌리는데 평평한 판이면 옆에서
 * 볼 때 선으로 납작해져 글자가 사라진다. Sprite는 항상 카메라를 정면으로 본다.
 *
 * 열림/닫힘은 색뿐 아니라 글자도 바꾼다. 색만 다르면 색각 이상이 있는 사람이
 * 구분하지 못하고, 축소하면 누구든 어렵다.
 */
/** EXIT 표지 밑변이 놓이는 높이(기둥 top). 실제 y는 표지 크기에 맞춰 렌더 루프가 잡는다. */
const GATE_SIGN_BASE_Y = 4.2;

function makeExitSign(closed: boolean): THREE.Sprite {
  const text = closed ? 'CLOSED' : 'EXIT';
  const bg = closed ? '#dc2626' : '#16a34a';

  const scaleFactor = 2; // 확대해도 글자가 뭉개지지 않게 2배로 그린다
  const fontSize = 84;
  const font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;

  const measure = document.createElement('canvas').getContext('2d');
  if (measure) measure.font = font;
  const textWidth = measure ? measure.measureText(text).width : text.length * fontSize * 0.62;
  const width = Math.ceil(textWidth) + 76;
  const height = fontSize + 56;

  const canvas = document.createElement('canvas');
  canvas.width = width * scaleFactor;
  canvas.height = height * scaleFactor;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(scaleFactor, scaleFactor);
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, width, height, 14);
    else ctx.rect(0, 0, width, height);
    ctx.fill();
    // 밝은 테두리를 둘러 실제 표지판처럼 보이게 한다.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      // 건물에 가려도 보이게 한다. 출구 위치는 대피를 읽는 기준이라 늘 보여야 한다.
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.renderOrder = 11;
  sprite.userData.aspect = width / height;
  return sprite;
}

/** 표지를 세우는 기둥과 바닥 링. 클릭 판정은 이 실제 메시들이 맡는다. */
function makeExitPost(closed: boolean): THREE.Group {
  const g = new THREE.Group();
  const hex = closed ? 0xdc2626 : 0x16a34a;

  // 바닥 링. 위에서 내려다보는 배율에서 출구 위치를 잃지 않게 한다.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.6, 36),
    new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 4.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.2 }),
  );
  pole.position.y = 2.1;
  pole.castShadow = true;
  g.add(pole);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.85 }),
  );
  base.position.y = 0.15;
  g.add(base);

  return g;
}

const OBJECT_BUILDERS: Record<PlacedObject['objectType'], () => THREE.Group> = {
  food_truck: makeFoodTruck,
  obstacle: makeObstacle,
  event_zone: makeEventZone,
  rest_area: makeRestArea,
};

// 에이전트 표시 크기. 시장은 200m가 넘는데 사람은 1.6m라, 전체를 보는 배율에서는
// 2~3픽셀이라 사실상 안 보인다. 카메라 거리에 비례해 키워 항상 읽히게 하고,
// 가까이 가면 실제 사람 크기로 줄어들도록 상·하한을 둔다.
// 개입 전/후 두 지도가 카메라를 공유한다.
//
// props의 {lon, lat, zoom}에는 회전 각도가 없어서 그 경로로는 시점을 맞출 수
// 없었고(한쪽만 돌아갔다), 드래그마다 부모 상태를 갱신하느라 "내가 보낸 값이
// 되돌아와 내 값을 덮어쓰는" 왕복이 생겨 움직임이 끊겼다. 부모를 거치지 않고
// 여기서 직접 공유하면 회전까지 같이 움직이고 왕복도 사라진다.
const sharedCamera = {
  theta: -0.6,
  thetaGoal: -0.6,
  phi: 0.92,
  phiGoal: 0.92,
  distance: 0,
  distanceGoal: 0,
  target: new THREE.Vector3(0, 0, 0),
  targetGoal: new THREE.Vector3(0, 0, 0),
  baseDistance: 0,
};

// 어느 지도에서든 드래그 중이면 나머지 지도의 호버 판정을 멈춘다.
// 두 지도가 같은 window 이벤트를 듣기 때문에, 한쪽을 돌리는 동안 반대쪽이
// 에이전트 수백 개를 상대로 레이캐스팅을 계속해 프레임이 떨어졌다.
const pointerState = { dragging: false };

// 확대·이동으로 시점이 시장에서 너무 멀어지면 화면에 아무것도 안 남아
// 길을 잃는다. 시장 반경의 1.2배 안으로 부드럽게 붙잡아 둔다.
function clampTarget(target: THREE.Vector3, extent: number) {
  const limit = extent * 1.2;
  const d = Math.hypot(target.x, target.z);
  if (d > limit) {
    const k = limit / d;
    target.x *= k;
    target.z *= k;
  }
}

// 구역 이름표.
//
// 3D에서 바닥에 글자를 눕혀 놓으면 각도를 조금만 돌려도 납작해져 못 읽는다.
// Sprite는 항상 카메라를 정면으로 바라보므로, 사용자가 어느 방향으로 돌려도
// 글자는 똑바로 선 채 그대로 읽힌다.
function makeZoneLabel(text: string, sub: string | null, dark: boolean): THREE.Sprite {
  const scaleFactor = 2; // 확대해도 글자가 뭉개지지 않게 2배로 그린다
  const fontSize = 44;
  const subSize = 34;
  const font = `bold ${fontSize}px "Malgun Gothic", "맑은 고딕", sans-serif`;
  const subFont = `bold ${subSize}px "Malgun Gothic", "맑은 고딕", sans-serif`;

  // sub(둘째 줄)는 지금은 항상 null이다. 위험도는 구역 바닥 색으로 보여주고 있고,
  // 이 이름표는 위험도가 바뀔 때 다시 굽지 않으므로 숫자를 새기면 낡은 값이 박힌다.
  // 둘째 줄 경로는 나중에 이름표를 스텝마다 갱신하게 될 때를 위해 남겨 둔다.
  // (한 줄로 "북측 구역 (12.3)"처럼 이으면 폭이 40%쯤 넓어져, 통로를 따라 나란히
  //  선 이름표 세 개가 축소 시 서로 겹친다. 그래서 두 줄로 나누는 구조다.)
  const measure = document.createElement('canvas').getContext('2d');
  const measureWith = (f: string, t: string) => {
    if (!measure) return t.length * fontSize * 0.6;
    measure.font = f;
    return measure.measureText(t).width;
  };
  const textWidth = Math.max(
    measureWith(font, text),
    sub ? measureWith(subFont, sub) : 0,
  );
  const width = Math.ceil(textWidth) + 44;
  const height = (sub ? fontSize + subSize + 8 : fontSize) + 30;

  const canvas = document.createElement('canvas');
  canvas.width = width * scaleFactor;
  canvas.height = height * scaleFactor;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(scaleFactor, scaleFactor);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 지도 위 어떤 색 위에서도 읽히도록 알약 배경을 깐다.
    ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.88)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, width, height, 12);
    else ctx.rect(0, 0, width, height);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a';
    ctx.font = font;
    if (sub) {
      ctx.fillText(text, width / 2, height / 2 - subSize / 2 - 1);
      // 점수는 한 단계 흐리게. 이름이 먼저 읽히고 점수가 따라오게 한다.
      ctx.fillStyle = dark ? '#94a3b8' : '#475569';
      ctx.font = subFont;
      ctx.fillText(sub, width / 2, height / 2 + fontSize / 2 - 1);
    } else {
      ctx.fillText(text, width / 2, height / 2 + 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      // 건물에 가려도 보이게 한다. 구역 이름은 길 찾는 기준이라 늘 보여야 한다.
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.renderOrder = 10;
  sprite.userData.aspect = width / height;
  // 두 줄짜리는 세로로 더 크게 그려야 '이름' 글자가 한 줄일 때와 같은 크기로 보인다.
  // 이 값을 안 쓰면 같은 세로 크기 안에 두 줄을 밀어 넣어 글자만 작아진다.
  sprite.userData.heightRatio = height / (fontSize + 30);
  return sprite;
}

// 팬 계산은 "지금 화면의 카메라"를 기준으로 해야 잡은 점이 커서에 붙는다.
// 렌더 루프를 기다리면 한 프레임 늦어 손과 화면이 어긋난다.
function syncCameraNow(camera: THREE.PerspectiveCamera) {
  const cam = sharedCamera;
  camera.position.set(
    cam.target.x + cam.distance * Math.sin(cam.phi) * Math.sin(cam.theta),
    cam.target.y + cam.distance * Math.cos(cam.phi),
    cam.target.z + cam.distance * Math.sin(cam.phi) * Math.cos(cam.theta),
  );
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
}

function resetSharedCamera(baseDistance: number) {
  sharedCamera.theta = -0.6;
  sharedCamera.thetaGoal = -0.6;
  sharedCamera.phi = 0.92;
  sharedCamera.phiGoal = 0.92;
  sharedCamera.distance = baseDistance;
  sharedCamera.distanceGoal = baseDistance;
  sharedCamera.target.set(0, 0, 0);
  sharedCamera.targetGoal.set(0, 0, 0);
  sharedCamera.baseDistance = baseDistance;
}

const AGENT_PIXEL_TARGET = 0.018;
const AGENT_SCALE_MIN = 1;
const AGENT_SCALE_MAX = 5.5;
// 호버 판정 허용 오차(화면 픽셀). 사람이 화면상 두어 픽셀이라 정확히 찍기가 어렵다.
const HOVER_PIXELS = 12;

export default function HeatmapView3D({
  zones,
  agents,
  zoneRisks,
  buildings,
  currentStep,
  width = 640,
  height = 480,
  transitionMs = 0,
  corridors,
  gates,
  closedGateIds,
  onGateClick,
  placementType = null,
  onPlaceObject,
  placedObjects,
  events,
  focusEvent,
  viewCenter,
  viewZoom,
  onViewportChange,
}: HeatmapView3DProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const mountRef = useRef<HTMLDivElement>(null);
  // 렌더 루프가 "지금 드래그 중인지"를 알아야 감쇠 세기를 바꿀 수 있다.
  const draggingRef = useRef(false);
  // 툴팁이 이미 없는 상태에서 setHovered(null)을 반복 호출하지 않도록 하는 표시.
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState<{ agent: AgentState; x: number; y: number } | null>(null);

  // 좌표 원점은 구역 폴리곤 전체의 평균. 시장이 바뀌면 같이 바뀐다.
  const origin = useMemo(() => {
    let sumLon = 0;
    let sumLat = 0;
    let count = 0;
    zones.forEach((zone) => {
      const ring = parsePolygon(zone.polygonCoordinates);
      if (!ring) return;
      ring.forEach(([lon, lat]) => {
        sumLon += lon;
        sumLat += lat;
        count += 1;
      });
    });
    return count > 0 ? { lon: sumLon / count, lat: sumLat / count } : { lon: 126.9, lat: 37.55 };
  }, [zones]);

  // 위경도 -> 로컬 미터. 북쪽이 -z 방향(화면 안쪽)이 되도록 부호를 뒤집는다.
  const toLocal = useMemo(() => {
    const mPerLon = metersPerDegLon(origin.lat);
    return (lon: number, lat: number): [number, number] => [
      (lon - origin.lon) * mPerLon,
      -(lat - origin.lat) * METERS_PER_DEG_LAT,
    ];
  }, [origin]);

  const toLonLat = useMemo(() => {
    const mPerLon = metersPerDegLon(origin.lat);
    return (x: number, z: number): [number, number] => [
      origin.lon + x / mPerLon,
      origin.lat - z / METERS_PER_DEG_LAT,
    ];
  }, [origin]);

  // zoom = 1일 때 시장 전체가 화면에 들어오도록 기준 거리를 잡는다.
  const extent = useMemo(() => {
    let max = 40;
    zones.forEach((zone) => {
      const ring = parsePolygon(zone.polygonCoordinates);
      if (!ring) return;
      ring.forEach(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat);
        max = Math.max(max, Math.hypot(x, z));
      });
    });
    return max;
  }, [zones, toLocal]);

  const baseDistance = extent * 2.6;

  // 시장이 뻗은 방향(주축). 푸드트럭·천막을 통로와 나란히 놓지 않으면
  // 길 한가운데 비스듬히 선 것처럼 보인다. 구역 꼭짓점의 주성분 각도를 쓴다.
  const marketHeading = useMemo(() => {
    const pts: Array<[number, number]> = [];
    zones.forEach((zone) => {
      const ring = parsePolygon(zone.polygonCoordinates);
      if (!ring) return;
      ring.forEach(([lon, lat]) => pts.push(toLocal(lon, lat)));
    });
    if (pts.length < 3) return 0;
    let mx = 0;
    let mz = 0;
    pts.forEach(([x, z]) => {
      mx += x;
      mz += z;
    });
    mx /= pts.length;
    mz /= pts.length;
    let cxx = 0;
    let czz = 0;
    let cxz = 0;
    pts.forEach(([x, z]) => {
      const dx = x - mx;
      const dz = z - mz;
      cxx += dx * dx;
      czz += dz * dz;
      cxz += dx * dz;
    });
    return 0.5 * Math.atan2(2 * cxz, cxx - czz);
  }, [zones, toLocal]);

  const core = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    staticGroup: THREE.Group;
    dynamicGroup: THREE.Group;
    agentMesh: THREE.InstancedMesh | null;
    gateMeshes: THREE.Object3D[];
    raycaster: THREE.Raycaster;
    groundPlane: THREE.Plane;
    /** 보간 시작·목표 위치(x,y,z 연속). 매 프레임 새 객체를 만들지 않으려고 타입 배열을 쓴다. */
    agentFrom: Float32Array;
    agentTo: Float32Array;
    agentCurrent: Float32Array;
    /** 슬롯이 지금 쓰이는지. 0이면 화면에서 감춘다. */
    agentActive: Uint8Array;
    /** agentId -> 인스턴스 슬롯. 사람이 나가면 인덱스가 밀리므로 신원으로 고정한다. */
    agentSlots: Map<number, number>;
    /** 나간 사람이 쓰던 슬롯 재사용 목록 */
    agentFreeSlots: number[];
    /**
     * 인스턴스 슬롯 -> 그 자리에 서 있는 사람. 호버 판정이 쓴다.
     * Raycaster가 주는 instanceId는 슬롯 번호인데, 슬롯은 신원으로 고정되고
     * 재사용되므로 agents 배열의 순서와 일치하지 않는다. 예전에 agents[instanceId]로
     * 읽던 코드가 엉뚱한 사람을 집거나 undefined가 되어 툴팁이 안 떴다.
     */
    agentBySlot: Array<AgentState | null>;
    /** 슬롯별 추가 배율. 체류 중인 사람을 키우는 데 쓴다(1 = 기본). */
    agentScaleMul: Float32Array;
    agentCapacity: number;
    /** 프레임 사이 보간 진행 상태 */
    animStart: number;
    animDuration: number;
    animating: boolean;
    /** 마지막으로 인스턴스 행렬에 반영한 에이전트 배율 */
    agentScale: number;
    fireGroup: THREE.Group | null;
    zoneLabels: THREE.Sprite[];
    /** 게이트 EXIT 표지. 구역 이름표와 같이 화면상 크기를 일정하게 유지한다. */
    gateSigns: THREE.Sprite[];
    /**
     * 구역 바닥·테두리의 재질. 위험도가 바뀌면 이 색만 갈아끼운다.
     * 지오메트리를 다시 만들면 건물 압출까지 매 스텝 재계산되어 화면이 멈춘다.
     */
    zoneMaterials: Array<{
      zoneId: number;
      floor: THREE.MeshBasicMaterial;
      outline: THREE.LineBasicMaterial;
    }>;
  } | null>(null);

  // 콜백은 매 렌더마다 새로 오므로 ref로 최신값만 들고 있는다. 이벤트 리스너를
  // 다시 붙이지 않아도 최신 핸들러가 호출된다.
  const handlers = useRef({ onPlaceObject, onGateClick, onViewportChange, placementType });
  handlers.current = { onPlaceObject, onGateClick, onViewportChange, placementType };

  // ── 렌더러 초기화 ─────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 8000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // 지도가 두 개라 픽셀이 두 배로 든다. 고해상도 화면에서 2배까지 올리면
    // 실제로 그리는 픽셀이 4배가 되어 재생 중 버벅인다.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 그림자를 드리우는 건 건물·게이트·배치물뿐이고 전부 제자리에 서 있다.
    // 자동 갱신을 켜두면 매 프레임 장면을 한 번 더(그림자용 카메라로) 그린다.
    // 지도가 두 개이므로 초당 120번의 불필요한 장면 렌더가 된다. 정적 지오메트리가
    // 바뀔 때만 아래 이펙트에서 한 번 다시 굽는다.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x20262f, 1.4));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
    sun.position.set(140, 240, 110);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowSpan = Math.max(200, extent * 1.5);
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.far = shadowSpan * 5;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);

    const staticGroup = new THREE.Group();
    const dynamicGroup = new THREE.Group();
    scene.add(staticGroup);
    scene.add(dynamicGroup);

    core.current = {
      scene,
      camera,
      renderer,
      staticGroup,
      dynamicGroup,
      agentMesh: null,
      gateMeshes: [],
      raycaster: new THREE.Raycaster(),
      // 지면은 메시 대신 수학 평면으로 둔다. 보이지 않는 메시를 레이캐스팅
      // 대상으로 두면 three 버전에 따라 판정이 달라진다.
      groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      agentFrom: new Float32Array(0),
      agentTo: new Float32Array(0),
      agentCurrent: new Float32Array(0),
      agentActive: new Uint8Array(0),
      agentSlots: new Map(),
      agentFreeSlots: [],
      agentBySlot: [],
      agentScaleMul: new Float32Array(0),
      agentCapacity: 0,
      animStart: 0,
      animDuration: 0,
      animating: false,
      agentScale: 1,
      fireGroup: null,
      zoneLabels: [],
      gateSigns: [],
      zoneMaterials: [],
    };

    // 시장이 바뀌어 기준 거리가 달라지면 공유 카메라도 새로 잡는다.
    if (sharedCamera.baseDistance !== extent * 2.6) resetSharedCamera(extent * 2.6);

    let frameId = 0;
    const renderLoop = () => {
      const c = core.current;
      if (c) {
        const w = mount.clientWidth || 640;
        const h = mount.clientHeight || 480;
        const size = new THREE.Vector2();
        c.renderer.getSize(size);
        if (Math.abs(size.x - w) > 1 || Math.abs(size.y - h) > 1) {
          c.renderer.setSize(w, h, false);
          c.camera.aspect = w / Math.max(1, h);
          c.camera.updateProjectionMatrix();
        }
        // 목표값으로 매 프레임 조금씩 다가간다(감쇠). 0.18이면 대략 6~8프레임에
        // 도달해, 조작은 즉각적으로 느끼면서도 화면은 부드럽게 따라온다.
        // 드래그 중에는 거의 즉시 따라가고(0.55), 손을 뗀 뒤에는 천천히
        // 안착한다(0.16). 드래그에 감쇠를 크게 주면 손보다 화면이 늦어
        // "안 따라온다"고 느껴진다.
        const k = draggingRef.current ? 0.55 : 0.16;
        const cam = sharedCamera;
        cam.theta += (cam.thetaGoal - cam.theta) * k;
        cam.phi += (cam.phiGoal - cam.phi) * k;
        cam.distance += (cam.distanceGoal - cam.distance) * k;
        cam.target.lerp(cam.targetGoal, k);

        const { target, theta, phi, distance } = cam;
        c.camera.position.set(
          target.x + distance * Math.sin(phi) * Math.sin(theta),
          target.y + distance * Math.cos(phi),
          target.z + distance * Math.sin(phi) * Math.cos(theta),
        );
        c.camera.lookAt(target);

        // 카메라가 멀어지면 사람이 몇 픽셀로 줄어 보이지 않는다. 거리에 비례해 키운다.
        const wantScale = Math.min(
          AGENT_SCALE_MAX,
          Math.max(AGENT_SCALE_MIN, distance * AGENT_PIXEL_TARGET),
        );
        const scaleChanged = Math.abs(wantScale - c.agentScale) / c.agentScale > 0.08;

        if (c.agentMesh && (c.animating || scaleChanged)) {
          const now = performance.now();
          const t = c.animDuration > 0
            ? Math.min(1, (now - c.animStart) / c.animDuration)
            : 1;
          // 끝에서 살짝 감속시키면 스텝 전환이 덜 기계적으로 보인다.
          const e = t * (2 - t);
          if (scaleChanged) c.agentScale = wantScale;
          const s2 = c.agentScale;

          // 인스턴스 행렬을 배열에 직접 쓴다.
          //
          // 원래는 Object3D 하나를 옮겨가며 updateMatrix()로 만들었는데, 그 경로는
          // 위치·회전(쿼터니언)·배율을 매번 합성한다. 여기서 필요한 건 배율과 이동뿐이라
          // 열 우선 4x4의 해당 칸만 채우면 된다. 사람이 수백 명이고 지도가 두 개이며
          // 이걸 초당 60번 하므로, 이 차이가 재생 중 버벅임으로 그대로 나타난다.
          const mat = c.agentMesh.instanceMatrix.array as Float32Array;
          const count = c.agentMesh.count;
          for (let i = 0; i < count; i += 1) {
            const b = i * 16;
            if (!c.agentActive[i]) {
              // 빈 자리는 배율 0으로 접어 화면에서 지운다.
              mat[b] = 0; mat[b + 5] = 0; mat[b + 10] = 0; mat[b + 15] = 1;
              mat[b + 12] = 0; mat[b + 13] = -9999; mat[b + 14] = 0;
              continue;
            }
            const o = i * 3;
            const fx = c.agentFrom[o];
            const fz = c.agentFrom[o + 2];
            const x = fx + (c.agentTo[o] - fx) * e;
            const z = fz + (c.agentTo[o + 2] - fz) * e;
            c.agentCurrent[o] = x;
            c.agentCurrent[o + 2] = z;
            // 체류 중이면 키운다. 발이 바닥에 닿아 있어야 하므로 높이도 같이 곱한다.
            const sm = s2 * c.agentScaleMul[i];
            mat[b] = sm; mat[b + 5] = sm; mat[b + 10] = sm; mat[b + 15] = 1;
            mat[b + 12] = x; mat[b + 13] = 0.95 * sm; mat[b + 14] = z;
          }
          c.agentMesh.instanceMatrix.needsUpdate = true;
          // 보간이 끝나면 멈춘다. 정지 화면에서 매 프레임 수백 개를 다시 쓰면
          // 아무 변화가 없는데도 CPU를 계속 먹는다.
          if (t >= 1) c.animating = false;
        }

        // 이름표는 멀어져도 같은 크기로 읽히도록 거리에 비례해 키운다.
        // (Sprite는 방향은 알아서 카메라를 향하지만 크기는 원근을 탄다)
        if (c.zoneLabels.length > 0) {
          const labelSize = Math.max(6, distance * 0.055);
          c.zoneLabels.forEach((label) => {
            const aspect = (label.userData.aspect as number) || 3;
            const hr = (label.userData.heightRatio as number) || 1;
            const h = labelSize * hr;
            label.scale.set(h * aspect, h, 1);
          });
        }

        // EXIT 표지도 같은 이유로 거리에 비례해 키운다. 구역 이름표보다는 작게 둬서
        // 이름표가 먼저 읽히고 표지가 배경으로 깔리게 한다.
        if (c.gateSigns.length > 0) {
          const signSize = Math.max(4, distance * 0.034);
          c.gateSigns.forEach((sign) => {
            const aspect = (sign.userData.aspect as number) || 3;
            sign.scale.set(signSize * aspect, signSize, 1);
            // 표지 '밑변'을 기둥 위에 맞춘다. 위치를 고정해 두면 축소할수록 표지가
            // 커지면서 중심 기준으로 아래로도 자라나, 기둥을 삼키고 바닥을 뚫는다.
            const baseY = (sign.userData.baseY as number) ?? 0;
            sign.position.y = baseY + signSize / 2;
          });
        }

        // 불꽃이 가만히 서 있으면 정지 화면처럼 보인다. 살짝 흔들어 준다.
        if (c.fireGroup) {
          const t = performance.now() * 0.006;
          c.fireGroup.children.forEach((child, idx) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.ConeGeometry) {
              child.scale.set(1 + Math.sin(t + idx) * 0.12, 1 + Math.cos(t * 1.3 + idx) * 0.16, 1);
            } else if (child instanceof THREE.PointLight) {
              child.intensity = 340 + Math.sin(t * 1.7 + idx) * 120;
            }
          });
        }

        c.renderer.render(c.scene, c.camera);
      }
      frameId = requestAnimationFrame(renderLoop);
    };
    frameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(frameId);
      const c = core.current;
      if (c) {
        disposeGroup(c.staticGroup);
        disposeGroup(c.dynamicGroup);
        if (c.agentMesh) {
          c.agentMesh.geometry.dispose();
          (c.agentMesh.material as THREE.Material).dispose();
        }
        c.renderer.dispose();
        // dispose()만으로는 브라우저가 WebGL 컨텍스트를 바로 놓아주지 않는다.
        // 이 이펙트는 시장을 바꿀 때마다 다시 도는데, 컨텍스트 상한(보통 16개)에
        // 걸리면 가장 오래된 것이 강제로 날아가 다른 지도가 검게 죽는다.
        c.renderer.forceContextLoss();
        if (c.renderer.domElement.parentNode) {
          c.renderer.domElement.parentNode.removeChild(c.renderer.domElement);
        }
      }
      core.current = null;
    };
    // 시장이 바뀌면 extent가 달라져 카메라 기준 거리도 다시 잡아야 한다.
  }, [extent]);

  // ── 배경/안개 (다크 모드 연동) ────────────────────────────────
  useEffect(() => {
    const c = core.current;
    if (!c) return;
    const bg = resolvedTheme === 'dark' ? 0x0f172a : 0xe9eef4;
    c.scene.background = new THREE.Color(bg);
    c.scene.fog = new THREE.Fog(bg, extent * 2.4, extent * 7);
  }, [resolvedTheme, extent]);

  // 위험도 색을 지금 있는 재질에 입힌다.
  //
  // 두 곳에서 부른다. (1) 위험도가 바뀔 때, (2) 정적 지오메트리를 다시 만든 직후.
  // (2)를 빠뜨리면 게이트를 토글하거나 테마를 바꿀 때 재질이 새로 생기면서 색이
  // 기본 회색으로 돌아가 버린다 - 위험도는 그대로인데 화면만 회색이 된다.
  const applyZoneRiskColors = (risks: ZoneRisk[] | undefined) => {
    const c = core.current;
    if (!c || c.zoneMaterials.length === 0) return;
    const riskByZoneId = new Map((risks ?? []).map((r) => [r.zoneId, r]));
    c.zoneMaterials.forEach(({ zoneId, floor, outline }) => {
      const level = riskByZoneId.get(zoneId)?.riskLevel?.toLowerCase();
      const color = (level && RISK_COLOR[level]) || DEFAULT_ZONE_COLOR;
      floor.color.setHex(color);
      outline.color.setHex(color);
    });
  };

  // 정적 지오메트리 이펙트는 zoneRisks를 의존성에 두지 않으므로(매 스텝 재빌드를
  // 피하려고), 그 안에서 최신 위험도를 읽으려면 ref가 필요하다.
  const zoneRisksRef = useRef(zoneRisks);
  zoneRisksRef.current = zoneRisks;

  // ── 정적 지오메트리: 구역 · 건물 · 통로 · 게이트 ──────────────
  useEffect(() => {
    const c = core.current;
    if (!c) return;
    disposeGroup(c.staticGroup);
    c.gateMeshes = [];
    c.zoneLabels = [];
    c.gateSigns = [];
    c.zoneMaterials = [];

    zones.forEach((zone) => {
      const ring = parsePolygon(zone.polygonCoordinates);
      if (!ring || ring.length < 3) return;

      // Shape는 XY 평면에 만든 뒤 X축으로 -90도 돌린다. 그러면 shape의 y가
      // 월드 -z가 되므로, 여기서 -z를 넣어 두 번 뒤집어 원래 z로 되돌린다.
      const shape = new THREE.Shape();
      ring.forEach(([lon, lat], i) => {
        const [x, z] = toLocal(lon, lat);
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });

      // 색은 여기서 정하지 않는다. 아래 '위험도 색 갱신' 이펙트가 매 스텝 넣어준다.
      const floorMaterial = new THREE.MeshBasicMaterial({
        color: DEFAULT_ZONE_COLOR,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.06;
      c.staticGroup.add(floor);

      const outlinePoints = ring.map(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat);
        return new THREE.Vector3(x, 0.14, z);
      });
      outlinePoints.push(outlinePoints[0].clone());
      const outlineMaterial = new THREE.LineBasicMaterial({ color: DEFAULT_ZONE_COLOR });
      c.staticGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(outlinePoints),
          outlineMaterial,
        ),
      );
      c.zoneMaterials.push({
        zoneId: zone.zoneId,
        floor: floorMaterial,
        outline: outlineMaterial,
      });

      // 구역 이름표. 중심에 두면 통로 한복판이라 사람과 건물을 가린다.
      // 시장이 뻗은 방향의 직각으로 밀어내 길 옆에 세운다. 구역이 통로를 따라
      // 남->중앙->북 순서로 늘어서 있으므로, 옆에 나란히 붙어도 어느 구역인지
      // 바로 읽힌다.
      const [cLon, cLat] = polygonCentroid(ring);
      const [lx, lz] = toLocal(cLon, cLat);

      const perpX = -Math.sin(marketHeading);
      const perpZ = Math.cos(marketHeading);
      // 이 구역이 직각 방향으로 얼마나 퍼져 있는지 재서 그 바깥에 놓는다.
      let halfWidth = 0;
      ring.forEach(([lon, lat]) => {
        const [px, pz] = toLocal(lon, lat);
        halfWidth = Math.max(halfWidth, Math.abs((px - lx) * perpX + (pz - lz) * perpZ));
      });
      const offset = halfWidth + Math.max(16, extent * 0.12);

      // 이름표에는 점수를 넣지 않는다. 이 이펙트는 위험도가 바뀔 때 다시 돌지
      // 않으므로(그러면 건물 압출까지 매 스텝 재계산된다), 점수를 새겨 넣으면
      // 처음 값이 그대로 박혀 틀린 숫자를 보여주게 된다. 없는 것보다 나쁘다.
      // 위험도는 아래 이펙트가 구역 바닥 색으로 보여준다.
      const label = makeZoneLabel(zone.zoneName, null, resolvedTheme === 'dark');
      label.position.set(lx + perpX * offset, 6.5, lz + perpZ * offset);
      c.staticGroup.add(label);
      c.zoneLabels.push(label);
    });

    // 건물: height_m으로 압출한다. 나중에 시설 사진을 텍스처로 입힐 자리다.
    (buildings ?? []).forEach((building) => {
      const ring = parsePolygon(building.polygonCoordinates);
      if (!ring || ring.length < 3) return;

      const shape = new THREE.Shape();
      ring.forEach(([lon, lat], i) => {
        const [x, z] = toLocal(lon, lat);
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });

      const buildingHeight = Math.max(2.5, building.heightM || (building.floors || 1) * 3.2);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: buildingHeight,
        bevelEnabled: false,
      });
      // 압출 방향(+z)이 X축 -90도 회전 뒤 월드 +y가 되므로 바닥에 그대로 선다.
      geometry.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: building.heightEstimated ? 0x9aa9b8 : 0xc7d0da,
          roughness: 0.86,
          transparent: building.heightEstimated,
          opacity: building.heightEstimated ? 0.85 : 1,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      c.staticGroup.add(mesh);
    });

    (corridors ?? []).forEach((corridor) => {
      if (!corridor.pathCoordinates) return;
      const line = parseLineString(corridor.pathCoordinates);
      if (!line) return;
      const points = line.map(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat);
        return new THREE.Vector3(x, 0.22, z);
      });
      const lineMesh = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineDashedMaterial({ color: 0x94a3b8, dashSize: 2.4, gapSize: 1.8 }),
      );
      lineMesh.computeLineDistances();
      c.staticGroup.add(lineMesh);
    });

    (gates ?? []).forEach((gate) => {
      const closed = closedGateIds?.has(gate.facilityId) ?? false;
      const [x, z] = toLocal(gate.longitude, gate.latitude);

      // 기둥·바닥 링(실제 메시) + EXIT 표지(Sprite).
      const post = makeExitPost(closed);
      post.position.set(x, 0, z);
      post.traverse((node) => {
        node.userData.facilityId = gate.facilityId;
        if (node instanceof THREE.Mesh) c.gateMeshes.push(node);
      });
      c.staticGroup.add(post);

      const sign = makeExitSign(closed);
      // 세로 위치는 렌더 루프가 표지 크기에 맞춰 잡는다. 여기서는 기준 높이만 준다.
      sign.userData.baseY = GATE_SIGN_BASE_Y;
      sign.position.set(x, GATE_SIGN_BASE_Y, z);
      sign.userData.facilityId = gate.facilityId;
      c.staticGroup.add(sign);
      c.gateSigns.push(sign);
      // 화면에서 가장 크고 눈에 띄는 게 이 표지다. 여기를 눌러도 개폐가 되어야 한다.
      c.gateMeshes.push(sign);
    });

    // 재질이 전부 새로 생겼으니 현재 위험도 색을 바로 입힌다.
    applyZoneRiskColors(zoneRisksRef.current);

    // 정적 지오메트리가 바뀌었으니 그림자를 한 번만 다시 굽는다.
    c.renderer.shadowMap.needsUpdate = true;
    // zoneRisks는 일부러 뺐다. 매 스텝 바뀌는 값이라 여기 넣으면 건물 폴리곤
    // 압출까지 0.5초마다 다시 하게 된다. 색 갱신은 아래 전용 이펙트가 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, buildings, corridors, gates, closedGateIds, resolvedTheme, marketHeading, extent, toLocal]);

  // ── 위험도 색 갱신 ───────────────────────────────────────────
  //
  // 지오메트리는 손대지 않고 이미 만들어 둔 재질의 색 값만 바꾼다. 3D에서
  // 모양을 다시 만드는 것과 색만 바꾸는 것은 비용이 비교가 안 된다.
  useEffect(() => {
    applyZoneRiskColors(zoneRisks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneRisks]);

  // ── 동적 지오메트리: 배치 오브젝트 · 화재 ─────────────────────
  useEffect(() => {
    const c = core.current;
    if (!c) return;
    disposeGroup(c.dynamicGroup);

    (placedObjects ?? []).forEach((object) => {
      if (object.latitude == null || object.longitude == null) return;
      const [x, z] = toLocal(object.longitude, object.latitude);
      const group = OBJECT_BUILDERS[object.objectType]?.();
      if (!group) return;
      group.position.set(x, 0, z);
      // 통로와 나란히 세운다. 유인류(천막·파라솔)는 방향이 덜 중요하지만
      // 같이 맞춰 두면 배치가 정돈돼 보인다.
      group.rotation.y = marketHeading;
      // SIM이 반경을 (0.5 + intensity)로 키우는 것과 같은 방향으로 보이게 한다.
      const scale = 0.85 + 0.35 * (object.intensity ?? 0.5);
      group.scale.setScalar(scale);
      c.dynamicGroup.add(group);
    });

    const fireGroup = new THREE.Group();
    (events ?? []).forEach((event) => {
      if (event.latitude == null || event.longitude == null) return;
      const [x, z] = toLocal(event.longitude, event.latitude);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, 9, 14),
        new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.92 }),
      );
      flame.position.set(x, 4.5, z);
      fireGroup.add(flame);

      const glow = new THREE.PointLight(0xff6a2a, 400, 140);
      glow.position.set(x, 7, z);
      fireGroup.add(glow);

      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(6, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0x3a3330, transparent: true, opacity: 0.24 }),
      );
      smoke.position.set(x, 13, z);
      fireGroup.add(smoke);

      // 화재 인지 전파 링. SIM 규칙(초기 8m + 스텝당 10m)을 그대로 복원한다.
      // 불이 나도 전원이 동시에 아는 게 아니라 가까운 사람부터 반응한다는 것을
      // 화면에서 바로 읽히게 하는 장치라, 3D에서 가장 눈에 띄는 요소다.
      if (currentStep !== undefined) {
        const age = currentStep - (event.triggerStep ?? 1);
        if (age >= 0) {
          const radius = 8 + 10 * age;
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius, radius + Math.max(1.2, radius * 0.02), 96),
            new THREE.MeshBasicMaterial({
              color: 0xeab308,
              transparent: true,
              // 멀리 퍼질수록 옅어져 화면을 가리지 않게 한다.
              opacity: Math.max(0.12, 0.5 - radius / 900),
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(x, 0.3, z);
          c.dynamicGroup.add(ring);
        }
      }
    });
    c.dynamicGroup.add(fireGroup);
    c.fireGroup = fireGroup.children.length > 0 ? fireGroup : null;

    if (focusEvent && focusEvent.latitude != null && focusEvent.longitude != null) {
      const [x, z] = toLocal(focusEvent.longitude, focusEvent.latitude);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(13, 15, 48),
        new THREE.MeshBasicMaterial({
          color: 0xdc2626,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.45, z);
      c.dynamicGroup.add(ring);
    }

    c.renderer.shadowMap.needsUpdate = true;
  }, [placedObjects, events, focusEvent, currentStep, marketHeading, extent, toLocal]);

  // ── 에이전트 ─────────────────────────────────────────────────
  useEffect(() => {
    const c = core.current;
    if (!c) return;

    // 슬롯은 agentId로 고정한다. SIM은 사람이 출구로 나가면 목록에서 빼기 때문에
    // 배열 인덱스가 매 프레임 밀린다. 인덱스로 보간하면 A가 있던 자리에서 B가 있는
    // 자리로 끌려가 순간이동처럼 보인다.
    const required = agents.length;
    if (!c.agentMesh || c.agentCapacity < required + c.agentSlots.size) {
      const capacity = Math.max(128, Math.ceil((required + c.agentSlots.size) * 1.6));
      const from = new Float32Array(capacity * 3);
      const to = new Float32Array(capacity * 3);
      const current = new Float32Array(capacity * 3);
      const active = new Uint8Array(capacity);
      // 기존 위치를 그대로 옮겨야 크기가 늘어나는 순간 튀지 않는다.
      if (c.agentCurrent.length > 0) {
        from.set(c.agentFrom);
        to.set(c.agentTo);
        current.set(c.agentCurrent);
        active.set(c.agentActive);
      }
      if (c.agentMesh) {
        c.scene.remove(c.agentMesh);
        c.agentMesh.geometry.dispose();
        (c.agentMesh.material as THREE.Material).dispose();
      }
      const mesh = new THREE.InstancedMesh(
        new THREE.CapsuleGeometry(0.36, 0.9, 4, 8),
        new THREE.MeshStandardMaterial({ roughness: 0.55 }),
        capacity,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // 에이전트 그림자는 끈다. 인스턴스가 수백 개면 그림자 맵을 매 프레임
      // 다시 그리느라 재생 중 프레임이 크게 떨어진다. 사람 그림자는 이 축척에서
      // 거의 보이지도 않는다.
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      c.scene.add(mesh);
      c.agentMesh = mesh;
      c.agentCapacity = capacity;
      c.agentBySlot = new Array(capacity).fill(null);
      c.agentScaleMul = new Float32Array(capacity).fill(1);
      c.agentFrom = from;
      c.agentTo = to;
      c.agentCurrent = current;
      c.agentActive = active;
    }

    const mesh = c.agentMesh;
    const color = new THREE.Color();
    const seen = new Set<number>();

    agents.forEach((agent) => {
      seen.add(agent.agentId);
      let slot = c.agentSlots.get(agent.agentId);
      const isNew = slot === undefined;
      if (isNew) {
        slot = c.agentFreeSlots.pop();
        if (slot === undefined) slot = c.agentSlots.size;
        if (slot >= c.agentCapacity) return; // 용량 밖이면 이번 프레임은 건너뛴다
        c.agentSlots.set(agent.agentId, slot);
      }
      const o = (slot as number) * 3;
      const [x, z] = toLocal(agent.longitude, agent.latitude);

      if (isNew) {
        // 새로 들어온 사람은 제자리에서 나타난다. 안 그러면 화면 밖에서 날아온다.
        c.agentFrom[o] = x;
        c.agentFrom[o + 2] = z;
        c.agentCurrent[o] = x;
        c.agentCurrent[o + 2] = z;
      } else {
        c.agentFrom[o] = c.agentCurrent[o];
        c.agentFrom[o + 2] = c.agentCurrent[o + 2];
      }
      c.agentTo[o] = x;
      c.agentTo[o + 2] = z;
      c.agentActive[slot as number] = 1;
      c.agentBySlot[slot as number] = agent;

      const danger = agent.dangerLevel ?? 0;
      color.setHex(danger >= 60 ? AGENT_RED : danger >= 30 ? AGENT_YELLOW : AGENT_BLUE);
      mesh.setColorAt(slot as number, color);
      // 행동은 색이 아니라 크기로 (STAYING_SCALE 주석 참고).
      c.agentScaleMul[slot as number] = agent.actionState === 'STAYING' ? STAYING_SCALE : 1;
    });

    // 이번 프레임에 없는 사람은 퇴장한 것. 슬롯을 비워 다음 사람이 쓰게 한다.
    Array.from(c.agentSlots.entries()).forEach(([id, slot]) => {
      if (seen.has(id)) return;
      c.agentSlots.delete(id);
      c.agentFreeSlots.push(slot);
      c.agentActive[slot] = 0;
      c.agentBySlot[slot] = null;
      c.agentScaleMul[slot] = 1;
    });

    // 실제로 쓰이는 가장 높은 슬롯까지만 그린다. 용량은 넉넉히 잡아 두는데,
    // 그 전부를 매 프레임 다시 쓰면 사람이 없는 자리까지 계산·전송하게 된다.
    let used = 0;
    c.agentSlots.forEach((slot) => {
      if (slot + 1 > used) used = slot + 1;
    });
    mesh.count = used;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    c.animStart = performance.now();
    c.animDuration = transitionMs > 0 ? transitionMs : 0;
    c.animating = true;
    // extent가 바뀌면 렌더러 이펙트가 core를 통째로 다시 만든다(agentMesh = null).
    // 그때 이 이펙트가 안 돌면 지도에 사람이 한 명도 안 남는다.
  }, [agents, transitionMs, extent, toLocal]);

  // ── 바깥에서 들어온 뷰포트를 카메라에 반영 ────────────────────
  const applyingExternal = useRef(false);
  useEffect(() => {
    const c = core.current;
    if (!c || !viewCenter || viewZoom === undefined) return;
    const [x, z] = toLocal(viewCenter.lon, viewCenter.lat);
    const nextDistance = baseDistance / Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewZoom));
    const unchanged =
      Math.abs(sharedCamera.targetGoal.x - x) < 0.5 &&
      Math.abs(sharedCamera.targetGoal.z - z) < 0.5 &&
      Math.abs(sharedCamera.distanceGoal - nextDistance) < 0.5;
    if (unchanged) return;
    applyingExternal.current = true;
    sharedCamera.targetGoal.set(x, 0, z);
    sharedCamera.distanceGoal = nextDistance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCenter?.lon, viewCenter?.lat, viewZoom, toLocal, baseDistance]);

  const emitViewport = () => {
    const c = core.current;
    if (!c) return;
    // 바깥에서 넣어준 값 때문에 다시 바깥으로 알리면 두 지도가 서로를 밀어낸다.
    if (applyingExternal.current) {
      applyingExternal.current = false;
      return;
    }
    const [lon, lat] = toLonLat(sharedCamera.targetGoal.x, sharedCamera.targetGoal.z);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, baseDistance / sharedCamera.distanceGoal));
    handlers.current.onViewportChange?.({ lon, lat, zoom });
  };

  // ── 마우스 조작 ──────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let lastHoverAt = 0;
    // 팬을 시작할 때 손으로 "집은" 지면 지점. 드래그 내내 이 점을 커서에 붙인다.
    let grabPoint: THREE.Vector3 | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      dragging = true;
      draggingRef.current = true;
      pointerState.dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      // 드래그가 창 밖으로 나가도 계속 따라오게 한다.
      (e.target as Element).setPointerCapture?.(e.pointerId);

      const c = core.current;
      if (!c) return;
      const rect = mount.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      c.raycaster.setFromCamera(ndc, c.camera);
      const hit = new THREE.Vector3();
      if (!c.raycaster.ray.intersectPlane(c.groundPlane, hit)) {
        grabPoint = null;
        return;
      }

      const panning = e.shiftKey || e.button === 1 || e.button === 2;
      // 이동일 때만 지면 지점을 집는다. 회전은 지금 보고 있는 중심을 그대로 축으로
      // 쓴다. 예전에는 누른 지점으로 축을 옮겼는데, 카메라가 아직 감쇠 중이거나
      // 각도가 한계에 걸리면 그 순간 화면이 튀었다.
      grabPoint = panning ? hit.clone() : null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const c = core.current;
      if (!c) return;

      // 창 밖에서 버튼을 떼거나 포인터 캡처가 풀리면 pointerup을 놓칠 수 있다.
      // 그러면 dragging이 참으로 남아 호버 판정이 영영 건너뛰어진다(툴팁이 안 뜸).
      // 버튼이 하나도 안 눌린 상태면 그 자리에서 푼다.
      if (e.buttons === 0 && (dragging || pointerState.dragging)) {
        dragging = false;
        draggingRef.current = false;
        pointerState.dragging = false;
        grabPoint = null;
      }

      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        lastX = e.clientX;
        lastY = e.clientY;

        const cam = sharedCamera;
        // Shift 또는 오른쪽/가운데 버튼 = 이동(팬). Shift만 있으면 찾기 어렵다.
        const panning = e.shiftKey || (e.buttons & 6) !== 0;
        if (panning) {
          // 지도를 손으로 끄는 느낌을 내려면, 처음 잡은 지면 지점이 드래그 내내
          // 커서에 붙어 있어야 한다. 픽셀을 거리로 환산하는 방식(예전)은 각도와
          // 확대 정도에 따라 손보다 빠르거나 느려져 미끄러지는 느낌이 났다.
          //
          // 매번 "지금 커서 아래 지면 점"을 구해 잡은 점과의 차이만큼 시점을
          // 옮기면, 잡은 점이 정확히 커서를 따라온다.
          const rect2 = mount.getBoundingClientRect();
          const ndc2 = new THREE.Vector2(
            ((e.clientX - rect2.left) / rect2.width) * 2 - 1,
            -((e.clientY - rect2.top) / rect2.height) * 2 + 1,
          );
          c.raycaster.setFromCamera(ndc2, c.camera);
          const under = new THREE.Vector3();
          if (grabPoint && c.raycaster.ray.intersectPlane(c.groundPlane, under)) {
            const mx = grabPoint.x - under.x;
            const mz = grabPoint.z - under.z;
            // 팬은 감쇠 없이 즉시 반영한다. 여기서 늦으면 "끌리는" 느낌이 사라진다.
            cam.target.x += mx;
            cam.target.z += mz;
            cam.targetGoal.x += mx;
            cam.targetGoal.z += mz;
            clampTarget(cam.target, extent);
            clampTarget(cam.targetGoal, extent);
            syncCameraNow(c.camera);
          }
        } else {
          cam.thetaGoal -= dx * 0.0055;
          // 0.06rad(약 3도, 거의 바로 위)에서 1.52rad(약 87도, 거의 눈높이)까지.
          // 예전 범위(0.18~1.45)는 위에서도 옆에서도 충분히 못 봤다.
          cam.phiGoal = Math.max(0.06, Math.min(1.52, cam.phiGoal - dy * 0.0048));
        }
        // 회전은 {lon,lat,zoom}에 담을 수 없고, 매 프레임 부모를 갱신하면
        // 그 값이 되돌아와 조작을 방해한다. 알림은 pointerup에서 한 번만 한다.
        return;
      }

      // 호버 판정은 사람 전원을 훑는다. 어느 지도든 드래그 중이면 건너뛰고
      // (두 지도가 같은 window 이벤트를 듣는다), 포인터가 이 지도 위에 있을
      // 때만, 그것도 60ms에 한 번만 판정한다.
      if (!c.agentMesh || pointerState.dragging) return;
      const now = performance.now();
      if (now - lastHoverAt < 60) return;
      lastHoverAt = now;

      const rect = mount.getBoundingClientRect();
      if (
        e.clientX < rect.left || e.clientX > rect.right
        || e.clientY < rect.top || e.clientY > rect.bottom
      ) {
        if (hoveredRef.current) {
          hoveredRef.current = false;
          setHovered(null);
        }
        return;
      }

      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      c.raycaster.setFromCamera(ndc, c.camera);

      // 기하 충돌(intersectObject) 대신 '광선에 가까운 사람 찾기'로 판정한다.
      //
      // 이유 두 가지.
      //  1) 사람은 반지름 0.36m 캡슐인데 시장은 200m가 넘는다. 전체를 보는 배율에서
      //     화면상 두어 픽셀이라, 정확히 그 위를 찍지 않으면 절대 안 맞는다.
      //  2) InstancedMesh.raycast()는 boundingSphere를 처음 한 번만 계산해 캐시한다.
      //     여기서는 매 프레임 인스턴스 행렬을 직접 갈아끼우고 빈 슬롯을 y=-9999로
      //     치워두기 때문에, 캐시된 구가 실제와 어긋나 광선이 통째로 기각된다.
      //
      // 위치는 이미 agentCurrent에 들고 있으므로 훑기만 하면 된다. 허용 오차는
      // 광선을 따라 멀어질수록 비례해 키워서 화면상 항상 같은 픽셀 수가 되게 한다.
      const ray = c.raycaster.ray;
      const tanPerPixel = 2 * Math.tan((45 * Math.PI) / 360) / Math.max(1, rect.height);
      const tolFactor = tanPerPixel * HOVER_PIXELS;
      const probe = new THREE.Vector3();
      let bestSlot = -1;
      let bestT = Infinity;
      for (let i = 0; i < c.agentMesh.count; i += 1) {
        if (!c.agentActive[i]) continue;
        const o = i * 3;
        probe.set(
          c.agentCurrent[o],
          0.95 * c.agentScale * c.agentScaleMul[i],
          c.agentCurrent[o + 2],
        ).sub(ray.origin);
        const t = probe.dot(ray.direction);
        if (t <= 0 || t >= bestT) continue;          // 뒤에 있거나 이미 더 앞이 있으면 건너뛴다
        const tol = t * tolFactor;
        if (probe.lengthSq() - t * t > tol * tol) continue;
        bestT = t;
        bestSlot = i;
      }
      const hitAgent = bestSlot >= 0 ? c.agentBySlot[bestSlot] : null;
      if (hitAgent) {
        hoveredRef.current = true;
        setHovered({
          agent: hitAgent,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      } else if (hoveredRef.current) {
        // 이미 비어 있는데 또 setState 하면 부모까지 불필요하게 다시 그린다.
        hoveredRef.current = false;
        setHovered(null);
      }
    };

    const handlePointerUp = () => {
      if (dragging) {
        dragging = false;
        draggingRef.current = false;
        pointerState.dragging = false;
        grabPoint = null;
        // 부모(다른 화면과의 연동)에는 드래그가 끝났을 때 한 번만 알린다.
        // 매 프레임 알리면 그 값이 되돌아와 방금 만든 각도를 덮어써 끊긴다.
        emitViewport();
      }
    };

    const handleClick = (e: MouseEvent) => {
      const c = core.current;
      if (!c || moved) return;

      const rect = mount.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      c.raycaster.setFromCamera(ndc, c.camera);

      // 게이트를 먼저 본다. 2D에서 게이트 클릭이 배치보다 우선인 것과 같다.
      const gateHit = c.raycaster.intersectObjects(c.gateMeshes, false)[0];
      if (gateHit) {
        const facilityId = gateHit.object.userData.facilityId;
        if (typeof facilityId === 'number') {
          handlers.current.onGateClick?.(facilityId);
          return;
        }
      }

      const type = handlers.current.placementType;
      const place = handlers.current.onPlaceObject;
      if (!type || !place) return;

      const point = new THREE.Vector3();
      if (!c.raycaster.ray.intersectPlane(c.groundPlane, point)) return;
      const [lon, lat] = toLonLat(point.x, point.z);

      let zoneId: number | null = null;
      for (const zone of zones) {
        const ring = parsePolygon(zone.polygonCoordinates);
        if (ring && pointInPolygon(lon, lat, ring)) {
          zoneId = zone.zoneId;
          break;
        }
      }

      if (type === 'fire') {
        // 화재는 상가 건물에서 나므로 구역 밖(건물 위)을 눌러도 받는다.
        if (zoneId === null) {
          let best = Infinity;
          zones.forEach((zone) => {
            const ring = parsePolygon(zone.polygonCoordinates);
            if (!ring) return;
            const [cx, cy] = polygonCentroid(ring);
            const distance = (cx - lon) ** 2 + (cy - lat) ** 2;
            if (distance < best) {
              best = distance;
              zoneId = zone.zoneId;
            }
          });
        }
        if (zoneId !== null) place(zoneId, lat, lon);
        return;
      }

      // 오브젝트는 구역 안이면서 건물 위가 아닌 지점만 허용한다(2D와 동일).
      if (zoneId === null) return;
      const onBuilding = (buildings ?? []).some((building) => {
        const ring = parsePolygon(building.polygonCoordinates);
        return ring ? pointInPolygon(lon, lat, ring) : false;
      });
      if (onBuilding) return;
      place(zoneId, lat, lon);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = core.current;
      if (!c) return;
      const cam = sharedCamera;

      const before = cam.distanceGoal;
      const after = Math.max(
        baseDistance / MAX_ZOOM,
        Math.min(baseDistance / MIN_ZOOM, before * (e.deltaY > 0 ? 1.12 : 0.9)),
      );
      // 이미 한계면 시점을 건드리지 않는다. 안 그러면 확대가 안 되는데도
      // 화면만 옆으로 밀린다.
      if (after === before) return;

      // 커서 아래 지면 지점을 고정하고 그쪽으로 당긴다(지도 앱과 같은 방식).
      // 궤도 카메라에서는 시선 방향이 그대로이므로,
      //   새 시점 = 기준점 + (옛 시점 - 기준점) x (새 거리 / 옛 거리)
      // 로 두면 그 지점이 화면에서 제자리에 머문다.
      const rect = mount.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      c.raycaster.setFromCamera(ndc, c.camera);
      const anchor = new THREE.Vector3();
      if (c.raycaster.ray.intersectPlane(c.groundPlane, anchor)) {
        const ratio = after / before;
        cam.targetGoal.set(
          anchor.x + (cam.targetGoal.x - anchor.x) * ratio,
          0,
          anchor.z + (cam.targetGoal.z - anchor.z) * ratio,
        );
        clampTarget(cam.targetGoal, extent);
      }

      cam.distanceGoal = after;
      emitViewport();
    };

    mount.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    mount.addEventListener('click', handleClick);
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    mount.addEventListener('contextmenu', blockContextMenu);
    mount.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      mount.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      mount.removeEventListener('click', handleClick);
      mount.removeEventListener('contextmenu', blockContextMenu);
      mount.removeEventListener('wheel', handleWheel);
      // 이 인스턴스가 드래그를 잡은 채로 리스너가 걷히면, 공유 플래그가 참으로
      // 남아 두 지도의 호버가 영영 죽는다. 반드시 풀고 나간다.
      if (dragging) {
        pointerState.dragging = false;
        draggingRef.current = false;
      }
    };
    // ⚠️ agents를 의존성에 넣으면 안 된다.
    //
    // agents는 재생 중 매 스텝(0.5초)마다 바뀐다. 그때마다 이 이펙트가 리스너를
    // 걷었다 다시 달면서 dragging/grabPoint/lastHoverAt 같은 클로저 변수가 전부
    // 0으로 돌아간다. 실제로 이런 일이 벌어졌다.
    //   1) 드래그 도중 스텝이 넘어가면 dragging이 false가 되어 회전이 멈춘다
    //      (재생 중에만 조작이 버벅이고 정지 화면에서는 멀쩡했던 이유).
    //   2) 새 pointerup 핸들러는 dragging이 false라 공유 플래그를 안 푼다.
    //      pointerState.dragging이 참으로 굳어 호버 판정이 영영 건너뛰어진다
    //      (툴팁이 안 뜨던 진짜 원인).
    // 호버는 이제 agents 배열이 아니라 core의 agentBySlot을 읽으므로 여기서
    // agents가 필요 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, buildings, toLonLat, baseDistance, extent]);

  // 2D에 있던 +/- 버튼. 휠을 못 쓰는 환경(터치패드 설정, 노트북)에서 유일한
  // 확대 수단이라 3D에도 있어야 한다. 휠과 달리 화면 중앙 기준으로 당긴다.
  const zoomByButton = (factor: number) => {
    const cam = sharedCamera;
    cam.distanceGoal = Math.max(
      baseDistance / MAX_ZOOM,
      Math.min(baseDistance / MIN_ZOOM, cam.distanceGoal * factor),
    );
    emitViewport();
  };

  const resetView = () => {
    const c = core.current;
    if (!c) return;
    sharedCamera.targetGoal.set(0, 0, 0);
    sharedCamera.thetaGoal = -0.6;
    sharedCamera.phiGoal = 0.92;
    sharedCamera.distanceGoal = baseDistance;
    emitViewport();
  };

  return (
    <div
      ref={mountRef}
      className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-50 touch-none select-none dark:border-slate-700 dark:bg-slate-900"
      style={{
        width,
        height: height || '100%',
        minHeight: height,
        cursor: placementType ? 'crosshair' : 'grab',
      }}
    >
      {/*
        구역 데이터가 아직 없을 때. 2D는 지도 대신 안내 문구를 보여줬는데 3D는
        빈 캔버스만 떠서 "고장난 건지 로딩 중인지" 알 수 없었다. 훅 순서를 지켜야
        해서 조기 반환 대신 덮개로 올린다.
      */}
      {zones.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          구역 데이터를 불러오는 중입니다...
        </div>
      )}

      <div className="pointer-events-none absolute top-2 left-2 z-10 rounded bg-white/80 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900/70 dark:text-slate-400">
        3D · 구역 {zones.length}개 · 유동 인구 {agents.length}명
        {buildings ? ` · 건물 ${buildings.length}개` : ''}
      </div>

      {placementType && (
        <div className="pointer-events-none absolute top-2 right-2 z-10 rounded bg-sky-600/90 px-2 py-1 text-xs text-sky-50 dark:bg-sky-900/90 dark:text-sky-100">
          클릭한 위치에 배치됩니다
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded border border-slate-300 bg-white/95 px-1 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
        <button
          type="button"
          onClick={() => zoomByButton(1 / ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomByButton(ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="축소"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-6 items-center rounded bg-slate-200 px-2 text-[10px] text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          aria-label="보기 초기화"
        >
          초기화
        </button>
        <span className="px-1 text-[10px] text-slate-500 dark:text-slate-400">
          드래그: 각도 회전 · 우클릭/Shift 드래그: 이동 · 휠: 커서 기준 확대
        </span>
      </div>

      {/*
        범례 두 줄.
        윗줄은 구역 바닥색(위험도 4단계), 아랫줄은 사람 점 색이다. 원래는 사람 색만
        설명했는데, 구역 바닥에 위험도 색이 들어가면서 화면에 설명 없는 색이
        생겼다(특히 주황 = high는 사람 색에는 없는 단계다).
        모양도 구분한다 - 구역은 네모, 사람은 동그라미.
      */}
      <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-0.5 rounded border border-slate-300 bg-white/95 px-2 py-1 text-[10px] text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 dark:text-slate-500">구역</span>
          {[
            { label: '낮음', color: '#3b82f6' },
            { label: '보통', color: '#f59e0b' },
            { label: '높음', color: '#f97316' },
            { label: '심각', color: '#ef4444' },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 dark:text-slate-500">사람</span>
          {[
            { label: '안전', color: '#38bdf8' },
            { label: '주의', color: '#eab308' },
            { label: '위험', color: '#ef4444' },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {hovered && (
        <div
          className="pointer-events-none absolute z-20 rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          style={{ left: hovered.x + 10, top: hovered.y + 10 }}
        >
          <div className="mb-1 border-b border-slate-300 pb-1 font-bold dark:border-slate-600">
            Agent #{hovered.agent.agentId}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">유형:</span>{' '}
            {hovered.agent.agentType
              ? hovered.agent.agentType === 'SHOPPING'
                ? '🛍️ 쇼핑형'
                : hovered.agent.agentType === 'FOOD_TOUR'
                  ? '🍔 맛집관광형'
                  : '🚶 통행형'
              : '데이터 없음 (과거 기록)'}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">행동:</span>{' '}
            {hovered.agent.actionState
              ? hovered.agent.actionState === 'STAYING'
                ? '체류 중'
                : hovered.agent.actionState === 'EXITING'
                  ? '퇴장 중'
                  : hovered.agent.actionState === 'ENTERING'
                    ? '진입 중'
                    : '이동 중'
              : '데이터 없음'}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">상태:</span>{' '}
            {hovered.agent.state === 'normal'
              ? '정상'
              : hovered.agent.state === 'congested'
                ? '혼잡'
                : '대피 중'}
          </div>
        </div>
      )}
    </div>
  );
}
