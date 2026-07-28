import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentState, Zone, PlacedObject, Gate, EventTrigger } from '../types';

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

interface HeatmapViewProps {
  zones: Zone[];
  agents: AgentState[];
  zoneRisks?: ZoneRisk[];
  width?: number;
  height?: number;
  transitionMs?: number;
  corridors?: CorridorEdge[];
  gates?: Gate[];
  closedGateIds?: Set<number>;
  onGateClick?: (facilityId: number) => void;
  placementType?: PlacedObject['objectType'] | EventTrigger['eventType'] | null;
  onPlaceObject?: (zoneId: number, latitude: number, longitude: number) => void;
  placedObjects?: PlacedObject[];
  events?: EventTrigger[];
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
const EVENT_GLYPH: Record<EventTrigger['eventType'], string> = {
  fire: '\u{1F525}',
  acoustic_anomaly: '!',
};

const GATE_OPEN_COLOR = '#22c55e';
const GATE_CLOSED_COLOR = '#ef4444';

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

function pointInPolygon(point: LonLat, polygon: LonLat[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export default function HeatmapView({
                                        zones,
                                        agents,
                                        zoneRisks,
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
                                      }: HeatmapViewProps) {
  const PADDING = 32;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });

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
        const oldVbW = width / v.zoom;
        const oldVbH = height / v.zoom;
        const newVbW = width / nextZoom;
        const newVbH = height / nextZoom;
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
  }, [width, height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (placementType) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
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
      const oldVbW = width / v.zoom, oldVbH = height / v.zoom;
      const newVbW = width / nextZoom, newVbH = height / nextZoom;
      const centerX = v.panX + oldVbW / 2;
      const centerY = v.panY + oldVbH / 2;
      return { zoom: nextZoom, panX: centerX - newVbW / 2, panY: centerY - newVbH / 2 };
    });
  };

  const resetViewport = () => setViewport({ zoom: 1, panX: 0, panY: 0 });

  const layout = useMemo(() => {
    const zonePolygons = zones
        .map((zone) => ({ zone, points: parsePolygon(zone.polygonCoordinates) }))
        .filter((z): z is { zone: Zone; points: LonLat[] } => z.points !== null);

    const allLons: number[] = [];
    const allLats: number[] = [];
    zonePolygons.forEach(({ points }) =>
        points.forEach(([lon, lat]) => {
          allLons.push(lon);
          allLats.push(lat);
        })
    );
    agents.forEach((a) => {
      allLons.push(a.longitude);
      allLats.push(a.latitude);
    });
    (gates ?? []).forEach((g) => {
      allLons.push(g.longitude);
      allLats.push(g.latitude);
    });

    if (allLons.length === 0) {
      return null;
    }

    const minLon = Math.min(...allLons);
    const maxLon = Math.max(...allLons);
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);

    const lonSpan = maxLon - minLon || 0.0001;
    const latSpan = maxLat - minLat || 0.0001;
    const scale = Math.min(
        (width - PADDING * 2) / lonSpan,
        (height - PADDING * 2) / latSpan
    );

    const project = ([lon, lat]: LonLat): [number, number] => [
      PADDING + (lon - minLon) * scale,
      PADDING + (maxLat - lat) * scale,
    ];

    const unproject = (x: number, y: number): LonLat => [
      minLon + (x - PADDING) / scale,
      maxLat - (y - PADDING) / scale,
    ];

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
        points,
        pointsAttr: projected.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
        centroid,
        fill: (level && RISK_FILL[level]) || DEFAULT_FILL,
        stroke: (level && RISK_STROKE[level]) || DEFAULT_STROKE,
        riskScore: risk?.riskScore,
      };
    });

    const renderedAgents = agents.map((agent) => {
      const [x, y] = project([agent.longitude, agent.latitude]);
      return { ...agent, x, y };
    });

    const zoneCentroidById = new Map(renderedZones.map((z) => [z.zoneId, z.centroid]));

    const renderedCorridors = (corridors ?? []).map((c) => {
      const line = c.pathCoordinates ? parseLineString(c.pathCoordinates) : null;
      const projected = line
          ? line.map(project)
          : [zoneCentroidById.get(c.fromZoneId), zoneCentroidById.get(c.toZoneId)].filter(
              (p): p is [number, number] => p !== undefined
          );
      if (projected.length < 2) return null;
      return {
        key: `${c.fromZoneId}-${c.toZoneId}`,
        pointsAttr: projected.map(([x, y]) => `${x},${y}`).join(' '),
      };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    const renderedGates = (gates ?? []).map((g) => {
      const [x, y] = project([g.longitude, g.latitude]);
      return { ...g, x, y };
    });

    const renderedObjects = (placedObjects ?? []).map((obj, index) => {
      const point =
          obj.latitude !== undefined && obj.latitude !== null &&
          obj.longitude !== undefined && obj.longitude !== null
              ? project([obj.longitude, obj.latitude])
              : zoneCentroidById.get(obj.zoneId) ?? [0, 0];
      return { key: `obj-${obj.objectType}-${index}`, x: point[0], y: point[1], objectType: obj.objectType };
    });

    const renderedEvents = (events ?? []).map((ev, index) => {
      const point =
          ev.latitude !== undefined && ev.latitude !== null &&
          ev.longitude !== undefined && ev.longitude !== null
              ? project([ev.longitude, ev.latitude])
              : zoneCentroidById.get(ev.zoneId) ?? [0, 0];
      return { key: `evt-${ev.eventType}-${index}`, x: point[0], y: point[1], eventType: ev.eventType };
    });

    return {
      renderedZones,
      renderedAgents,
      renderedCorridors,
      renderedGates,
      renderedObjects,
      renderedEvents,
      unproject,
      zonePolygons,
    };
  }, [zones, agents, zoneRisks, width, height, corridors, gates, placedObjects, events]);

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!placementType || !layout || !onPlaceObject || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const vbWidth = width / viewport.zoom;
    const vbHeight = height / viewport.zoom;
    const svgX = viewport.panX + ((e.clientX - rect.left) / rect.width) * vbWidth;
    const svgY = viewport.panY + ((e.clientY - rect.top) / rect.height) * vbHeight;
    const [lon, lat] = layout.unproject(svgX, svgY);

    const containing = layout.zonePolygons.find(({ points }) => pointInPolygon([lon, lat], points));
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

  const vbWidth = width / viewport.zoom;
  const vbHeight = height / viewport.zoom;

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
            onClick={handleMapClick}
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

          {layout.renderedCorridors.map((c) => (
              <polyline
                  key={c.key}
                  points={c.pointsAttr}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: 'none' }}
              />
          ))}

          {layout.renderedObjects.map((obj) => (
              <rect
                  key={obj.key}
                  x={obj.x - 6}
                  y={obj.y - 6}
                  width={12}
                  height={12}
                  fill={OBJECT_COLOR[obj.objectType]}
                  stroke="#0f172a"
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
              />
          ))}

          {layout.renderedEvents.map((ev) => (
              <g key={ev.key} style={{ pointerEvents: 'none' }}>
                <circle
                    cx={ev.x}
                    cy={ev.y}
                    r={9}
                    fill={EVENT_COLOR[ev.eventType]}
                    stroke="#0f172a"
                    strokeWidth={1.5}
                />
                <text
                    x={ev.x}
                    y={ev.y}
                    fill="#0f172a"
                    fontSize={10}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="central"
                >
                  {EVENT_GLYPH[ev.eventType]}
                </text>
              </g>
          ))}

          {layout.renderedGates.map((gate) => {
            const isClosed = closedGateIds?.has(gate.facilityId) ?? false;
            return (
                <g
                    key={gate.facilityId}
                    style={{ cursor: onGateClick ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGateClick?.(gate.facilityId);
                    }}
                >
                  <circle
                      cx={gate.x}
                      cy={gate.y}
                      r={9}
                      fill={isClosed ? GATE_CLOSED_COLOR : GATE_OPEN_COLOR}
                      stroke="#0f172a"
                      strokeWidth={1.5}
                  />
                  <text
                      x={gate.x}
                      y={gate.y}
                      fill="#0f172a"
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: 'none' }}
                  >
                    {isClosed ? '\u2715' : '\u2713'}
                  </text>
                </g>
            );
          })}

          {layout.renderedAgents.map((agent) => (
              <circle
                  key={agent.agentId}
                  cx={agent.x}
                  cy={agent.y}
                  r={3}
                  fill={AGENT_COLOR[agent.state] ?? AGENT_COLOR.normal}
                  stroke="#0f172a"
                  strokeWidth={0.5}
                  style={{
                    pointerEvents: 'none',
                    ...(transitionMs > 0
                        ? { transition: `cx ${transitionMs}ms linear, cy ${transitionMs}ms linear, fill ${transitionMs}ms linear` }
                        : undefined),
                  }}
              />
          ))}
        </svg>

        <div className="absolute top-2 left-2 text-xs text-slate-400 bg-slate-900/70 rounded px-2 py-1">
          구역 {zones.length}개 · 유동 인구 {agents.length}명
        </div>

        {placementType && (
            <div className="absolute top-2 right-2 text-xs text-sky-200 bg-sky-900/80 rounded px-2 py-1">
              지도를 클릭해서 배치하세요
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
      </div>
  );
}