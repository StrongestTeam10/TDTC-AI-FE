import { useEffect, useMemo, useRef, useState } from 'react';
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

const AGENT_COLOR: Record<string, string> = {
  normal: '#38bdf8',
  congested: '#f59e0b',
  evacuating: '#ef4444',
};

const OBJECT_COLOR: Record<PlacedObject['objectType'], string> = {
  food_truck: '#f97316',
  event_zone: '#a855f7',
  rest_area: '#22c55e',
  obstacle: '#78350f',
};

const EVENT_COLOR: Record<EventTrigger['eventType'], string> = {
  fire: '#dc2626',
  acoustic_anomaly: '#eab308',
};

const GATE_OPEN_COLOR = '#22c55e';
const GATE_CLOSED_COLOR = '#ef4444';

const BUILDING_FILL_MEASURED = 'rgba(148, 163, 184, 0.45)';
const BUILDING_STROKE_MEASURED = '#94a3b8';
const BUILDING_FILL_ESTIMATED = 'rgba(148, 163, 184, 0.2)';
const BUILDING_STROKE_ESTIMATED = '#64748b';

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

const MIN_ZOOM = 0.5;
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
  const internalWidth = typeof width === 'number' ? width : 640;
  const internalHeight = typeof height === 'number' ? height : 480;

  const PADDING = 32;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const isApplyingExternalRef = useRef(false);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const [hoveredAgent, setHoveredAgent] = useState<{ agent: AgentState; x: number; y: number } | null>(null);

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
        return {
          zoom: nextZoom,
          panX: anchorX - newVbW * ratioX,
          panY: anchorY - newVbH * ratioY,
        };
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
    setViewport((v) => ({
      ...v,
      panX: v.panX - dx / v.zoom,
      panY: v.panY - dy / v.zoom,
    }));
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
      return { zoom: nextZoom, panX: centerX - newVbW / 2, panY: centerY - newVbH / 2 };
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

    const minLon = Math.min(...allLons);
    const maxLon = Math.max(...allLons);
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);

    const lonSpan = maxLon - minLon || 0.0001;
    const latSpan = maxLat - minLat || 0.0001;
    const scale = Math.min(
      (internalWidth - PADDING * 2) / lonSpan,
      (internalHeight - PADDING * 2) / latSpan
    );

    const project = ([lon, lat]: LonLat): [number, number] => [
      PADDING + (lon - minLon) * scale,
      PADDING + (maxLat - lat) * scale,
    ];

    const unproject = (x: number, y: number): LonLat => [
      minLon + (x - PADDING) / scale,
      maxLat - (y - PADDING) / scale,
    ];

    return { zonePolygons, buildingLonLat, minLon, maxLat, scale, project, unproject };
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
    const { minLon, maxLat, scale } = bounds;
    const vbW = internalWidth / viewZoom;
    const vbH = internalHeight / viewZoom;
    const centerLocalX = PADDING + (viewCenter.lon - minLon) * scale;
    const centerLocalY = PADDING + (maxLat - viewCenter.lat) * scale;
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
    const { minLon, maxLat, scale } = bounds;
    const vbW = internalWidth / viewport.zoom;
    const vbH = internalHeight / viewport.zoom;
    const centerLocalX = viewport.panX + vbW / 2;
    const centerLocalY = viewport.panY + vbH / 2;
    const lon = minLon + (centerLocalX - PADDING) / scale;
    const lat = maxLat - (centerLocalY - PADDING) / scale;
    onViewportChange({ lon, lat, zoom: viewport.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, bounds, internalWidth, internalHeight]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    if (!placementType || !onPlaceObject || !layout) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbWidth = internalWidth / viewport.zoom;
    const vbHeight = internalHeight / viewport.zoom;
    const svgX = viewport.panX + ((e.clientX - rect.left) / rect.width) * vbWidth;
    const svgY = viewport.panY + ((e.clientY - rect.top) / rect.height) * vbHeight;
    const [lon, lat] = layout.unproject(svgX, svgY);
    const containing = layout.zonePolygons.find(({ points }) => pointInPolygon(lon, lat, points));
    if (!containing) return;
    onPlaceObject(containing.zone.zoneId, lat, lon);
  };

  if (!layout) {
    return (
      <div
        ref={containerRef}
        className="relative rounded-lg border border-slate-700 bg-slate-900 flex items-center justify-center text-slate-500 text-sm"
        style={{ width, minHeight: height }}
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
      className="relative rounded-lg border border-slate-700 bg-slate-900 overflow-hidden touch-none select-none"
      style={{ width, minHeight: height, cursor: placementType ? 'crosshair' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg
        ref={svgRef}
        viewBox={`${viewport.panX} ${viewport.panY} ${vbWidth} ${vbHeight}`}
        width="100%"
        height={height}
        className="block"
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
              fill="#e2e8f0"
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
            stroke="#334155"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ))}

        {layout.renderedBuildings.map((b) => (
          <polygon
            key={b.buildingId}
            points={b.pointsAttr}
            fill={b.heightEstimated ? BUILDING_FILL_ESTIMATED : BUILDING_FILL_MEASURED}
            stroke={b.heightEstimated ? BUILDING_STROKE_ESTIMATED : BUILDING_STROKE_MEASURED}
            strokeWidth={0.75}
            strokeDasharray={b.heightEstimated ? '3 2' : undefined}
          />
        ))}

        {layout.renderedObjects.map((obj) => (
          <circle
            key={`obj-${obj.idx}`}
            cx={obj.x}
            cy={obj.y}
            r={5}
            fill={OBJECT_COLOR[obj.objectType]}
            stroke="#0f172a"
            strokeWidth={1}
          />
        ))}

        {layout.renderedEvents.map((ev) => (
          <circle
            key={`ev-${ev.idx}`}
            cx={ev.x}
            cy={ev.y}
            r={6}
            fill="none"
            stroke={EVENT_COLOR[ev.eventType]}
            strokeWidth={2}
          />
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
              <rect
                x={gate.x - 5}
                y={gate.y - 5}
                width={10}
                height={10}
                fill={isClosed ? GATE_CLOSED_COLOR : GATE_OPEN_COLOR}
                stroke="#0f172a"
                strokeWidth={1}
              />
            </g>
          );
        })}

        {layout.renderedAgents.map((agent) => (
          <g key={agent.agentId}>
            <circle
              cx={agent.x}
              cy={agent.y}
              r={2}
              fill={AGENT_COLOR[agent.state] ?? AGENT_COLOR.normal}
              stroke={agent.actionState === 'STAYING' ? '#ffffff' : '#0f172a'}
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

      <div className="absolute top-2 left-2 text-xs text-slate-400 bg-slate-900/70 rounded px-2 py-1">
        구역 {zones.length}개 · 유동 인구 {agents.length}명
        {buildings ? ` · 건물 ${buildings.length}개` : ''}
      </div>

      {placementType && (
        <div className="absolute top-2 right-2 text-xs text-sky-100 bg-sky-900/90 rounded px-2 py-1 pointer-events-none">
          클릭한 위치에 배치됩니다
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-slate-900/70 px-1 py-1">
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-200 text-sm hover:bg-slate-700"
          aria-label="확대"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-200 text-sm hover:bg-slate-700"
          aria-label="축소"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetViewport}
          className="px-2 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-400 text-[10px] hover:bg-slate-700"
          aria-label="보기 초기화"
        >
          초기화
        </button>
      </div>

      <div className="absolute bottom-2 right-2 flex items-center gap-3 text-[10px] text-slate-400 bg-slate-900/70 rounded px-2 py-1">
        {Object.entries(AGENT_COLOR).map(([state, color]) => (
          <span key={state} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {state === 'normal' ? '정상' : state === 'congested' ? '혼잡' : '대피 중'}
          </span>
        ))}
      </div>

      {hoveredAgent && (
        <div
          className="absolute z-10 pointer-events-none rounded bg-slate-800 border border-slate-600 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: hoveredAgent.x + 10, top: hoveredAgent.y + 10 }}
        >
          <div className="font-bold mb-1 border-b border-slate-600 pb-1">Agent #{hoveredAgent.agent.agentId}</div>
          <div>
            <span className="text-slate-400">유형:</span>{' '}
            {hoveredAgent.agent.agentType
              ? hoveredAgent.agent.agentType === 'SHOPPING'
                ? '🛍️ 쇼핑형'
                : hoveredAgent.agent.agentType === 'FOOD_TOUR'
                  ? '🍔 맛집관광형'
                  : '🚶 통행형'
              : '데이터 없음 (과거 기록)'}
          </div>
          <div>
            <span className="text-slate-400">행동:</span>{' '}
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
            <span className="text-slate-400">상태:</span>{' '}
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