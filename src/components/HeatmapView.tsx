import { useEffect, useMemo, useRef, useState } from 'react';
import { useThemeStore } from '../store/themeStore';
import type { AgentState, Zone, PlacedObject, Gate, EventTrigger, Building } from '../types';

// 특정 구역의 위험도 정보 (파이프라인 A: SIM ZoneResult 기반, 선택적)
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

// 2026-08-XX 변경: BE가 실제로 내려주는 형태(GeoJSON [경도,위도] 문자열, Zone과 동일 형식)로
// 맞췄다. 예전엔 origin+로컬미터 vertices를 상정했었는데, 실제 BuildingDto(= types의
// Building)는 polygonCoordinates가 Zone.polygonCoordinates와 똑같은 GeoJSON이라
// 별도 좌표 변환이 필요 없다 - parsePolygon()을 그대로 재사용한다.

interface HeatmapViewProps {
  zones: Zone[];
  agents: AgentState[];
  zoneRisks?: ZoneRisk[];
  buildings?: Building[];
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

const RISK_FILL: Record<string, string> = {
  low: 'rgba(59, 130, 246, 0.25)',
  medium: 'rgba(245, 158, 11, 0.3)',
  high: 'rgba(249, 115, 22, 0.35)',
  critical: 'rgba(239, 68, 68, 0.4)',
};
const RISK_STROKE: Record<string, string> = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};
const DEFAULT_FILL = 'rgba(100, 116, 139, 0.2)';
const DEFAULT_STROKE = '#64748b';

// 2026-08-XX: 에이전트 색을 위험도(dangerLevel, 0~100)에 따라 빨강/노랑/파랑으로.
// 화재 발생 구역이 가장 빨갛고(위험), 확산 감쇠에 따라 주변이 노랑->파랑(안전)으로.
const AGENT_DANGER_RED = '#ef4444';
const AGENT_DANGER_YELLOW = '#eab308';
const AGENT_DANGER_BLUE = '#38bdf8';
function agentColorByDanger(dangerLevel: number | undefined): string {
  const d = dangerLevel ?? 0;
  if (d >= 60) return AGENT_DANGER_RED;
  if (d >= 30) return AGENT_DANGER_YELLOW;
  return AGENT_DANGER_BLUE;
}

// 2026-08-XX: 오브젝트/이벤트/게이트를 색 도형 대신 이모지 아이콘으로 표시.
const OBJECT_EMOJI: Record<PlacedObject['objectType'], string> = {
  food_truck: '🚚',
  event_zone: '🎪',
  rest_area: '🪑',
  obstacle: '📦',
};

const EVENT_COLOR: Record<EventTrigger['eventType'], string> = {
  fire: '#dc2626',
};

const EVENT_EMOJI: Record<EventTrigger['eventType'], string> = {
  fire: '🔥',
};

const GATE_OPEN_EMOJI = '🚪';
const GATE_CLOSED_EMOJI = '🚫';

// 2026-08-10 (라이트모드): 지도 바탕이 남색(다크)일 때와 흰색(라이트)일 때 같은 회색
// 계열을 쓰면 건물/길이 배경에 묻힌다. SVG 속성 색은 Tailwind dark: variant가 닿지
// 않는 자리라(클래스가 아니라 값이라서) 테마별 팔레트를 값으로 들고 골라 쓴다.
// 구역 위험도색(RISK_*)과 에이전트 색은 채도가 높아 두 배경 모두에서 읽히므로 공통.
const MAP_PALETTE = {
  dark: {
    zoneLabel: '#e2e8f0',
    corridor: '#334155',
    buildingFillMeasured: 'rgba(148, 163, 184, 0.45)',
    buildingStrokeMeasured: '#94a3b8',
    buildingFillEstimated: 'rgba(148, 163, 184, 0.2)',
    buildingStrokeEstimated: '#64748b',
    agentOutline: '#0f172a',
    agentOutlineStaying: '#ffffff',
  },
  light: {
    zoneLabel: '#0f172a',
    corridor: '#94a3b8',
    buildingFillMeasured: 'rgba(100, 116, 139, 0.35)',
    buildingStrokeMeasured: '#64748b',
    buildingFillEstimated: 'rgba(100, 116, 139, 0.15)',
    buildingStrokeEstimated: '#94a3b8',
    agentOutline: '#ffffff',
    agentOutlineStaying: '#0f172a',
  },
} as const;

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

// 2026-08-12 (UIUX 피드백 p01 "일정 크기 이하로 축소 X"): 하한이 0.5여서 끝까지
// 축소하면 시장이 화면 한가운데 손톱만 하게 남고, 구역·에이전트가 서로 겹쳐 아무것도
// 읽히지 않았다. 되돌리려면 초기화를 눌러야 해서 실수로 한 번 굴리면 번거로웠다.
// 시장 전체가 화면에 들어오는 배율이 1이므로, 그보다 조금만 더 넓게 보는 선에서 막는다.
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

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

export default function HeatmapView({
  zones,
  agents,
  zoneRisks,
  buildings,
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
  focusEvent = null,
  viewCenter,
  viewZoom,
  onViewportChange,
}: HeatmapViewProps) {
  const mapColors = MAP_PALETTE[useThemeStore((s) => s.resolvedTheme)];
  const PADDING = 32;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const isApplyingExternalRef = useRef(false);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const [hoveredAgent, setHoveredAgent] = useState<{ agent: AgentState; x: number; y: number } | null>(null);

  // 70도 고정 회전
  const MAP_ROTATION_DEG = 70;

  // 2026-07-27: width를 고정 픽셀로 강제하던 것을 제거하고, width prop을 명시적으로
  // 넘기지 않으면(예: 대시보드에서 그리드 셀을 꽉 채우고 싶은 경우) 컨테이너의 실제
  // 렌더링 너비를 ResizeObserver로 관찰해서 그 값을 내부 좌표 계산(viewBox/투영)에
  // 사용한다. 640은 컨테이너가 측정되기 전(최초 렌더) 임시 fallback일 뿐이다.
  const [measuredWidth, setMeasuredWidth] = useState(640);

  useEffect(() => {
    if (width !== undefined) return; // 명시적 width가 있으면 컨테이너 측정 불필요
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setMeasuredWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  // 2026-08-04 수정: renderWidth가 계산만 되고 실제로는 안 쓰이고 있었음(CI
  // tsc -b가 미사용 변수로 빌드 자체를 막음). internalWidth가 원래 width prop만
  // 보고 있던 걸 renderWidth(= 명시적 width 우선, 없으면 ResizeObserver로 측정한
  // 값)를 보도록 고쳐서 위 주석에 적힌 반응형 동작이 실제로 동작하게 함.
  const renderWidth = width ?? measuredWidth;
  const internalWidth = typeof renderWidth === 'number' ? renderWidth : 640;
  const internalHeight = typeof height === 'number' ? height : 480;

  // 마우스 휠 확대/축소. React의 합성 onWheel은 기본적으로 passive라 preventDefault가
  // 안 먹혀서(경고 발생) 네이티브 리스너를 직접 붙인다. 커서 위치를 기준으로 확대해서
  // 커서 아래 지점이 화면에서 안 움직이게 한다 (구글맵과 동일한 조작감).

  const constrainPan = (panX: number, panY: number, zoom: number) => {
    const vbW = internalWidth / zoom;
    const vbH = internalHeight / zoom;
    const margin = 0.15; // 화면 밖으로 나갈 수 있는 최대 여백 (15%)

    const minXBound = -vbW * margin;
    const maxXBound = internalWidth - vbW * (1 - margin);
    const minYBound = -vbH * margin;
    const maxYBound = internalHeight - vbH * (1 - margin);

    const minPanX = Math.min(minXBound, maxXBound);
    const maxPanX = Math.max(minXBound, maxXBound);
    const minPanY = Math.min(minYBound, maxYBound);
    const maxPanY = Math.max(minYBound, maxYBound);

    return {
      panX: Math.max(minPanX, Math.min(maxPanX, panX)),
      panY: Math.max(minPanY, Math.min(maxPanY, panY)),
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratioX = (e.clientX - rect.left) / rect.width;
      const ratioY = (e.clientY - rect.top) / rect.height;

      setViewport((v) => {
        const nextZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, v.zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
        );
        const oldVbW = internalWidth / v.zoom;
        const oldVbH = internalHeight / v.zoom;
        const newVbW = internalWidth / nextZoom;
        const newVbH = internalHeight / nextZoom;
        const anchorX = v.panX + oldVbW * ratioX;
        const anchorY = v.panY + oldVbH * ratioY;

        const nextPanX = anchorX - newVbW * ratioX;
        const nextPanY = anchorY - newVbH * ratioY;

        return { zoom: nextZoom, ...constrainPan(nextPanX, nextPanY, nextZoom) };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [internalWidth, internalHeight]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const DRAG_THRESHOLD_PX = 4;
  const pointerMovedRef = useRef(false);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      pointerMovedRef.current = true;
    }
    dragRef.current = { x: e.clientX, y: e.clientY };
    setViewport((v) => {
      const nextPanX = v.panX - dx / v.zoom;
      const nextPanY = v.panY - dy / v.zoom;
      return { ...v, ...constrainPan(nextPanX, nextPanY, v.zoom) };
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const zoomBy = (factor: number) => {
    setViewport((v) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const oldVbW = internalWidth / v.zoom, oldVbH = internalHeight / v.zoom;
      const newVbW = internalWidth / nextZoom, newVbH = internalHeight / nextZoom;
      const centerX = v.panX + oldVbW / 2;
      const centerY = v.panY + oldVbH / 2;

      const nextPanX = centerX - newVbW / 2;
      const nextPanY = centerY - newVbH / 2;

      return { zoom: nextZoom, ...constrainPan(nextPanX, nextPanY, nextZoom) };
    });
  };

  const resetViewport = () => setViewport({ zoom: 1, panX: 0, panY: 0 });

  const bounds = useMemo(() => {
    const zonePolygons = zones
      .map((zone) => ({ zone, points: parsePolygon(zone.polygonCoordinates) }))
      .filter((z): z is { zone: Zone; points: LonLat[] } => z.points !== null);

    const buildingLonLat = (buildings ?? [])
      .map((b) => ({ ...b, points: parsePolygon(b.polygonCoordinates) }))
      .filter((b): b is Building & { points: LonLat[] } => b.points !== null);

    const allLons: number[] = [];
    const allLats: number[] = [];
    zonePolygons.forEach(({ points }) =>
      points.forEach(([lon, lat]) => {
        allLons.push(lon);
        allLats.push(lat);
      })
    );
    buildingLonLat.forEach(({ points }) =>
      points.forEach(([lon, lat]) => {
        allLons.push(lon);
        allLats.push(lat);
      })
    );

    if (allLons.length === 0) return null;

    const origMinLon = Math.min(...allLons);
    const origMaxLon = Math.max(...allLons);
    const origMinLat = Math.min(...allLats);
    const origMaxLat = Math.max(...allLats);

    const cx = (origMinLon + origMaxLon) / 2;
    const cy = (origMinLat + origMaxLat) / 2;

    const rotate = (lon: number, lat: number, deg: number = MAP_ROTATION_DEG): LonLat => {
      if (deg === 0) return [lon, lat];
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = lon - cx;
      const dy = lat - cy;
      return [
        cx + dx * cos - dy * sin,
        cy + dx * sin + dy * cos
      ];
    };

    const rotatedLons: number[] = [];
    const rotatedLats: number[] = [];
    for (let i = 0; i < allLons.length; i++) {
      const [rlon, rlat] = rotate(allLons[i], allLats[i]);
      rotatedLons.push(rlon);
      rotatedLats.push(rlat);
    }

    const minLon = Math.min(...rotatedLons);
    const maxLon = Math.max(...rotatedLons);
    const minLat = Math.min(...rotatedLats);
    const maxLat = Math.max(...rotatedLats);

    const lonSpan = maxLon - minLon || 0.0001;
    const latSpan = maxLat - minLat || 0.0001;
    const scale = Math.min(
      (internalWidth - PADDING * 2) / lonSpan,
      (internalHeight - PADDING * 2) / latSpan
    );

    const actualWidth = lonSpan * scale;
    const actualHeight = latSpan * scale;
    const offsetX = (internalWidth - actualWidth) / 2;
    const offsetY = (internalHeight - actualHeight) / 2;

    const project = ([lon, lat]: LonLat): [number, number] => {
      const [rlon, rlat] = rotate(lon, lat);
      return [
        offsetX + (rlon - minLon) * scale,
        offsetY + (maxLat - rlat) * scale,
      ];
    };

    const unproject = (x: number, y: number): LonLat => {
      const rlon = minLon + (x - offsetX) / scale;
      const rlat = maxLat - (y - offsetY) / scale;
      return rotate(rlon, rlat, -MAP_ROTATION_DEG);
    };

    return { zonePolygons, buildingLonLat, minLon, maxLat, scale, offsetX, offsetY, project, unproject };
  }, [zones, buildings, internalWidth, internalHeight]);

  const layout = useMemo(() => {
    if (!bounds) return null;
    const { zonePolygons, buildingLonLat, project, unproject, minLon, maxLat, scale } = bounds;

    const riskByZoneId = new Map((zoneRisks ?? []).map((r) => [r.zoneId, r]));

    const renderedZones = zonePolygons.map(({ zone, points }) => {
      const projected = points.map(project);
      const centroid = projected.reduce(
        (acc, [x, y]) => [acc[0] + x / projected.length, acc[1] + y / projected.length],
        [0, 0]
      );
      const risk = riskByZoneId.get(zone.zoneId);
      const level = risk?.riskLevel?.toLowerCase();
      return {
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
        pointsAttr: projected.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
        centroid,
        fill: (level && RISK_FILL[level]) || DEFAULT_FILL,
        stroke: (level && RISK_STROKE[level]) || DEFAULT_STROKE,
        riskScore: risk?.riskScore,
      };
    });

    const renderedBuildings = buildingLonLat.map((b) => {
      const projected = b.points.map(project);
      return {
        buildingId: b.buildingId,
        pointsAttr: projected.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
        heightEstimated: b.heightEstimated,
        height: b.heightM,
        floors: b.floors,
      };
    });

    const renderedAgents = agents.map((agent) => {
      const [x, y] = project([agent.longitude, agent.latitude]);
      return { ...agent, x, y };
    });

    const renderedCorridors = (corridors ?? [])
      .map((c) => (c.pathCoordinates ? parseLineString(c.pathCoordinates) : null))
      .filter((pts): pts is LonLat[] => pts !== null)
      .map((pts) => pts.map(project).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));

    const renderedGates = (gates ?? []).map((gate) => {
      const [x, y] = project([gate.longitude, gate.latitude]);
      return { ...gate, x, y };
    });

    const renderedObjects = (placedObjects ?? []).map((obj, idx) => {
      const lonLat: LonLat | null =
        obj.latitude !== undefined && obj.longitude !== undefined
          ? [obj.longitude, obj.latitude]
          : null;
      if (!lonLat) return null;
      const [x, y] = project(lonLat);
      return { ...obj, idx, x, y };
    }).filter((o): o is NonNullable<typeof o> => o !== null);

    const renderedEvents = (events ?? []).map((ev, idx) => {
      const lonLat: LonLat | null =
        ev.latitude !== undefined && ev.longitude !== undefined
          ? [ev.longitude, ev.latitude]
          : null;
      if (!lonLat) return null;
      const [x, y] = project(lonLat);
      return { ...ev, idx, x, y };
    }).filter((e): e is NonNullable<typeof e> => e !== null);

    let renderedFocusEvent: { x: number; y: number; eventType: EventTrigger['eventType'] } | null = null;
    if (focusEvent) {
      const hasCoords = focusEvent.latitude != null && focusEvent.longitude != null;
      const lonLat: LonLat | undefined = hasCoords
        ? [focusEvent.longitude as number, focusEvent.latitude as number]
        : zonePolygons.find(({ zone }) => zone.zoneId === focusEvent.zoneId)?.points.reduce(
          (acc, [lon, lat], _i, arr) => [acc[0] + lon / arr.length, acc[1] + lat / arr.length],
          [0, 0] as LonLat
        );
      if (lonLat) {
        const [x, y] = project(lonLat);
        renderedFocusEvent = { x, y, eventType: focusEvent.eventType };
      }
    }

    return {
      renderedZones,
      renderedBuildings,
      renderedCorridors,
      renderedAgents,
      renderedGates,
      renderedObjects,
      renderedEvents,
      renderedFocusEvent,
      unproject,
      zonePolygons,
      minLon,
      maxLat,
      scale,
    };
  }, [bounds, agents, zoneRisks, gates, placedObjects, events, focusEvent, corridors]);

  useEffect(() => {
    if (viewCenter === undefined || viewZoom === undefined || !bounds) return;
    const vbW = internalWidth / viewZoom;
    const vbH = internalHeight / viewZoom;
    const [centerLocalX, centerLocalY] = bounds.project([viewCenter.lon, viewCenter.lat]);
    const nextPanX = centerLocalX - vbW / 2;
    const nextPanY = centerLocalY - vbH / 2;

    setViewport((v) => {
      const unchanged =
        Math.abs(v.panX - nextPanX) < 0.05 &&
        Math.abs(v.panY - nextPanY) < 0.05 &&
        Math.abs(v.zoom - viewZoom) < 0.001;
      if (unchanged) return v;
      isApplyingExternalRef.current = true;
      return { zoom: viewZoom, panX: nextPanX, panY: nextPanY };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCenter?.lon, viewCenter?.lat, viewZoom, bounds, internalWidth, internalHeight]);

  useEffect(() => {
    if (!onViewportChange || !bounds) return;
    if (isApplyingExternalRef.current) {
      isApplyingExternalRef.current = false;
      return;
    }
    const vbW = internalWidth / viewport.zoom;
    const vbH = internalHeight / viewport.zoom;
    const centerLocalX = viewport.panX + vbW / 2;
    const centerLocalY = viewport.panY + vbH / 2;
    const [lon, lat] = bounds.unproject(centerLocalX, centerLocalY);
    onViewportChange({ lon, lat, zoom: viewport.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, bounds, internalWidth, internalHeight]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    if (!placementType || !onPlaceObject || !layout || !bounds) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbWidth = internalWidth / viewport.zoom;
    const vbHeight = internalHeight / viewport.zoom;
    const svgX = viewport.panX + ((e.clientX - rect.left) / rect.width) * vbWidth;
    const svgY = viewport.panY + ((e.clientY - rect.top) / rect.height) * vbHeight;
    const [lon, lat] = layout.unproject(svgX, svgY);
    const containing = layout.zonePolygons.find(({ points }) => pointInPolygon(lon, lat, points));
    const isEvent = placementType === 'fire';

    if (isEvent) {
      // 화재 등 이벤트: 상가 건물에서 나야 하므로 구역 밖(건물 위)을 클릭해도
      // 가장 가까운 구역으로 배치를 허용한다(배치 위치는 상위에서 건물로 스냅).
      let zoneId: number | null = containing ? containing.zone.zoneId : null;
      if (zoneId === null) {
        let bestD = Infinity;
        for (const zp of layout.zonePolygons) {
          let cx = 0, cy = 0;
          for (const [px, py] of zp.points) { cx += px; cy += py; }
          cx /= zp.points.length; cy /= zp.points.length;
          const d = (cx - lon) ** 2 + (cy - lat) ** 2;
          if (d < bestD) { bestD = d; zoneId = zp.zone.zoneId; }
        }
      }
      if (zoneId === null) return;
      onPlaceObject(zoneId, lat, lon);
      return;
    }

    // 오브젝트(푸드트럭/행사장/휴게공간/적재물): 반드시 시장 통로 안에만 배치.
    // = 구역 폴리곤 안이면서 + 건물 폴리곤 위가 아닌 지점만 허용.
    if (!containing) return;
    const onBuilding = bounds.buildingLonLat.some((b) => pointInPolygon(lon, lat, b.points));
    if (onBuilding) return;
    onPlaceObject(containing.zone.zoneId, lat, lon);
  };

  if (!layout) {
    return (
      <div
        ref={containerRef}
        className="relative flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900"
        style={{ width, height: height || '100%', minHeight: height }}
      >
        구역 데이터를 불러오는 중입니다...
      </div>
    );
  }

  const vbWidth = internalWidth / viewport.zoom;
  const vbHeight = internalHeight / viewport.zoom;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-50 touch-none select-none dark:border-slate-700 dark:bg-slate-900"
      style={{ width, height: height || '100%', minHeight: height, cursor: placementType ? 'crosshair' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg
        ref={svgRef}
        viewBox={`${viewport.panX} ${viewport.panY} ${vbWidth} ${vbHeight}`}
        className="block w-full h-full"
        style={{ minHeight: height }}
        onClick={handleSvgClick}
      >
        {layout.renderedZones.map((z) => (
          <g key={z.zoneId}>
            <polygon
              points={z.pointsAttr}
              fill={z.fill}
              stroke={z.stroke}
              strokeWidth={1.5}
            />
            <text
              x={z.centroid[0]}
              y={z.centroid[1]}
              fill={mapColors.zoneLabel}
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {z.zoneName}
              {z.riskScore !== undefined ? ` (${z.riskScore.toFixed(1)})` : ''}
            </text>
          </g>
        ))}

        {layout.renderedCorridors.map((pointsAttr, idx) => (
          <polyline
            key={`corridor-${idx}`}
            points={pointsAttr}
            fill="none"
            stroke={mapColors.corridor}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ))}

        {layout.renderedBuildings.map((b) => (
          <polygon
            key={b.buildingId}
            points={b.pointsAttr}
            fill={b.heightEstimated ? mapColors.buildingFillEstimated : mapColors.buildingFillMeasured}
            stroke={b.heightEstimated ? mapColors.buildingStrokeEstimated : mapColors.buildingStrokeMeasured}
            strokeWidth={0.75}
            strokeDasharray={b.heightEstimated ? '3 2' : undefined}
          />
        ))}

        {layout.renderedObjects.map((obj) => (
          <text
            key={`obj-${obj.idx}`}
            x={obj.x}
            y={obj.y}
            fontSize={11}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {OBJECT_EMOJI[obj.objectType]}
          </text>
        ))}

        {layout.renderedEvents.map((ev) => (
          <text
            key={`ev-${ev.idx}`}
            x={ev.x}
            y={ev.y}
            fontSize={13}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {EVENT_EMOJI[ev.eventType]}
          </text>
        ))}

        {layout.renderedFocusEvent && (
          <circle
            cx={layout.renderedFocusEvent.x}
            cy={layout.renderedFocusEvent.y}
            r={14}
            fill="none"
            stroke={EVENT_COLOR[layout.renderedFocusEvent.eventType]}
            strokeWidth={2}
            opacity={0.7}
          />
        )}

        {layout.renderedGates.map((gate) => {
          const isClosed = closedGateIds?.has(gate.facilityId) ?? false;
          return (
            <g
              key={gate.facilityId}
              onClick={(e) => {
                e.stopPropagation();
                onGateClick?.(gate.facilityId);
              }}
              style={{ cursor: onGateClick ? 'pointer' : 'default' }}
            >
              {/* 클릭 영역 확보용 투명 사각형 + 이모지 아이콘 */}
              <rect x={gate.x - 6} y={gate.y - 6} width={12} height={12} fill="transparent" />
              <text
                x={gate.x}
                y={gate.y}
                fontSize={11}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ userSelect: 'none' }}
              >
                {isClosed ? GATE_CLOSED_EMOJI : GATE_OPEN_EMOJI}
              </text>
            </g>
          );
        })}

        {layout.renderedAgents.map((agent) => (
          <g key={agent.agentId}>
            <circle
              cx={agent.x}
              cy={agent.y}
              r={2}
              fill={agentColorByDanger(agent.dangerLevel)}
              stroke={agent.actionState === 'STAYING' ? mapColors.agentOutlineStaying : mapColors.agentOutline}
              strokeWidth={agent.actionState === 'STAYING' ? 0.5 : 0.4}
              style={
                transitionMs > 0
                  ? { transition: `cx ${transitionMs}ms linear, cy ${transitionMs}ms linear, fill ${transitionMs}ms linear` }
                  : undefined
              }
              onPointerEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                  setHoveredAgent({ agent, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
              }}
              onPointerLeave={() => setHoveredAgent(null)}
            />
          </g>
        ))}
      </svg>

      <div className="absolute top-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900/70 dark:text-slate-400">
        구역 {zones.length}개 · 유동 인구 {agents.length}명
        {buildings ? ` · 건물 ${buildings.length}개` : ''}
      </div>

      {placementType && (
        <div className="pointer-events-none absolute top-2 right-2 rounded bg-sky-600/90 px-2 py-1 text-xs text-sky-50 dark:bg-sky-900/90 dark:text-sky-100">
          클릭한 위치에 배치됩니다
        </div>
      )}

      {/* 2026-08-12 (UIUX 피드백 p02 ② "⊞⊟초기화 버튼/범례 표기되도록"):
          bg-white/80은 지도 위 폴리곤이 밝은 색일 때 버튼 테두리가 배경에 묻혀
          있는지 없는지 알기 어려웠다. 불투명도를 올리고 그림자·테두리를 줘서
          지도 위에 떠 있는 조작 도구라는 것이 분명해지게 한다. */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded border border-slate-300 bg-white/95 px-1 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 z-10">
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-sm text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="축소"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetViewport}
          className="flex h-6 items-center justify-center rounded bg-slate-200 px-2 text-[10px] text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          aria-label="보기 초기화"
        >
          초기화
        </button>
      </div>

      {/* 위험도 범례. 점 색이 무엇을 뜻하는지 알려주는 유일한 곳이라 항상 보여야 한다. */}
      <div className="absolute bottom-2 right-2 flex items-center gap-3 rounded border border-slate-300 bg-white/95 px-2 py-1 text-[10px] text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-400 z-10">
        {[
          { label: '안전', color: AGENT_DANGER_BLUE },
          { label: '주의', color: AGENT_DANGER_YELLOW },
          { label: '위험', color: AGENT_DANGER_RED },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>

      {hoveredAgent && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          style={{ left: hoveredAgent.x + 10, top: hoveredAgent.y + 10 }}
        >
          <div className="mb-1 border-b border-slate-300 pb-1 font-bold dark:border-slate-600">Agent #{hoveredAgent.agent.agentId}</div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">유형:</span>{' '}
            {hoveredAgent.agent.agentType
              ? hoveredAgent.agent.agentType === 'SHOPPING'
                ? '🛍️ 쇼핑형'
                : hoveredAgent.agent.agentType === 'FOOD_TOUR'
                  ? '🍔 맛집관광형'
                  : '🚶 통행형'
              : '데이터 없음 (과거 기록)'}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">행동:</span>{' '}
            {hoveredAgent.agent.actionState
              ? hoveredAgent.agent.actionState === 'STAYING'
                ? '체류 중'
                : hoveredAgent.agent.actionState === 'EXITING'
                  ? '퇴장 중'
                  : hoveredAgent.agent.actionState === 'ENTERING'
                    ? '진입 중'
                    : '이동 중'
              : '데이터 없음'}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">상태:</span>{' '}
            {hoveredAgent.agent.state === 'normal'
              ? '정상'
              : hoveredAgent.agent.state === 'congested'
                ? '혼잡'
                : '대피 중'}
          </div>
        </div>
      )}
    </div>
  );
}