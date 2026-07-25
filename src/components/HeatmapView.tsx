import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentState, Zone, PlacedObject } from '../types';

// 특정 구역의 위험도 정보 (파이프라인 A: SIM ZoneResult 기반, 선택적)
export interface ZoneRisk {
  zoneId: number;
  riskLevel?: string;
  riskScore?: number;
}

// 2026-07-25 추가: 지도에 그릴 통로(구역 간 연결) 하나. BE ZoneAdjacencyDto와 대응.
export interface CorridorEdge {
  fromZoneId: number;
  toZoneId: number;
  pathCoordinates: string | null; // GeoJSON LineString, 없으면 구역 중심끼리 이어서 대체
}

// 2026-07-25 추가: 통로 클릭 시 현재 어떤 정책이 걸려있는지 색으로 보여주기 위한 맵.
// key는 `${fromZoneId}-${toZoneId}` (양방향 다 넣어주면 편함).
export type CorridorStatusMap = Record<string, 'close' | 'open' | 'one_way'>;

interface HeatmapViewProps {
  zones: Zone[];
  agents: AgentState[];
  zoneRisks?: ZoneRisk[];
  width?: number;
  height?: number;
  transitionMs?: number;
  // 2026-07-25 추가: 통로 표시/클릭
  corridors?: CorridorEdge[];
  corridorStatus?: CorridorStatusMap;
  onCorridorClick?: (fromZoneId: number, toZoneId: number) => void;
  // 2026-07-25 추가: 오브젝트 배치 모드. null이면 배치 모드 아님(지도는 평소처럼 드래그/줌만).
  placementType?: PlacedObject['objectType'] | null;
  onPlaceObject?: (zoneId: number, latitude: number, longitude: number) => void;
  placedObjects?: PlacedObject[];
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

// 2026-07-25 추가: 통로 정책 상태별 색상. undefined(정책 없음)는 회색 점선.
const CORRIDOR_COLOR: Record<'close' | 'open' | 'one_way' | 'default', string> = {
  close: '#ef4444',
  open: '#22c55e',
  one_way: '#f59e0b',
  default: '#94a3b8',
};

// 2026-07-25 추가: 오브젝트 종류별 아이콘 색상 (사각형으로 렌더링).
const OBJECT_COLOR: Record<PlacedObject['objectType'], string> = {
  food_truck: '#f97316',
  event_zone: '#a855f7',
  rest_area: '#22c55e',
  obstacle: '#78350f',
};

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

// 2026-07-25 추가: 통로 중심선(LineString) 파싱. Polygon과 달리 좌표 배열이 한 겹 얕다.
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

// 2026-07-25 추가: 점이 폴리곤 내부에 있는지 판정 (ray casting). 오브젝트를 클릭한
// 지점이 어느 구역에 속하는지 찾는 데 사용.
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
                                        corridorStatus,
                                        onCorridorClick,
                                        placementType = null,
                                        onPlaceObject,
                                        placedObjects,
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
    // 배치 모드에서는 드래그(지도 이동) 대신 클릭으로 오브젝트를 놓으므로 드래그 시작 안 함.
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

    // 2026-07-25 추가: 화면 좌표 -> 위경도 역변환 (오브젝트 배치 클릭용).
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

    // 2026-07-25 추가: 통로 선 좌표 계산. path_coordinates 있으면 그대로, 없으면
    // 두 구역 중심을 직선으로 이어서 대체.
    const renderedCorridors = (corridors ?? []).map((c) => {
      const line = c.pathCoordinates ? parseLineString(c.pathCoordinates) : null;
      const projected = line
          ? line.map(project)
          : [zoneCentroidById.get(c.fromZoneId), zoneCentroidById.get(c.toZoneId)].filter(
              (p): p is [number, number] => p !== undefined
          );
      if (projected.length < 2) return null;
      const midIndex = Math.floor(projected.length / 2);
      return {
        fromZoneId: c.fromZoneId,
        toZoneId: c.toZoneId,
        pointsAttr: projected.map(([x, y]) => `${x},${y}`).join(' '),
        midpoint: projected[midIndex],
      };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    // 2026-07-25 추가: 배치된 오브젝트 좌표. lat/lon 있으면 그걸 쓰고, 없으면(구역
    // 단위로만 추가된 예전 방식 호환) 구역 중심으로 대체.
    const renderedObjects = (placedObjects ?? []).map((obj, index) => {
      const point =
          obj.latitude !== undefined && obj.latitude !== null &&
          obj.longitude !== undefined && obj.longitude !== null
              ? project([obj.longitude, obj.latitude])
              : zoneCentroidById.get(obj.zoneId) ?? [0, 0];
      return { key: `${obj.objectType}-${index}`, x: point[0], y: point[1], objectType: obj.objectType };
    });

    return { renderedZones, renderedAgents, renderedCorridors, renderedObjects, unproject, zonePolygons };
  }, [zones, agents, zoneRisks, width, height, corridors, placedObjects]);

  // 2026-07-25 추가: 배치 모드에서 지도를 클릭하면 그 지점의 위경도를 구하고,
  // 어느 구역에 속하는지 판정해서 onPlaceObject를 호출한다.
  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!placementType || !layout || !onPlaceObject || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const vbWidth = width / viewport.zoom;
    const vbHeight = height / viewport.zoom;
    const svgX = viewport.panX + ((e.clientX - rect.left) / rect.width) * vbWidth;
    const svgY = viewport.panY + ((e.clientY - rect.top) / rect.height) * vbHeight;
    const [lon, lat] = layout.unproject(svgX, svgY);

    // 클릭 지점을 포함하는 구역 찾기. 어느 폴리곤에도 안 들어가면 가장 가까운
    // 구역 중심으로 대체(시장 폴리곤 바깥 여백을 클릭한 경우 대비).
    const containing = layout.zonePolygons.find(({ points }) => pointInPolygon([lon, lat], points));
    let zoneId: number;
    if (containing) {
      zoneId = containing.zone.zoneId;
    } else if (layout.renderedZones.length > 0) {
      zoneId = layout.renderedZones.reduce((closest, z) => {
        const d = (z.centroid[0] - svgX) ** 2 + (z.centroid[1] - svgY) ** 2;
        const dClosest = (closest.centroid[0] - svgX) ** 2 + (closest.centroid[1] - svgY) ** 2;
        return d < dClosest ? z : closest;
      }).zoneId;
    } else {
      return;
    }

    onPlaceObject(zoneId, lat, lon);
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

          {/* 2026-07-25 추가: 통로 선. 배치 모드일 땐 클릭이 오브젝트 배치로만 가게
              pointerEvents를 꺼서 밑에 있는 svg 배경 클릭이 그대로 통과되게 한다. */}
          {layout.renderedCorridors.map((c) => {
            const key = `${c.fromZoneId}-${c.toZoneId}`;
            const reverseKey = `${c.toZoneId}-${c.fromZoneId}`;
            const status = corridorStatus?.[key] ?? corridorStatus?.[reverseKey];
            const color = status ? CORRIDOR_COLOR[status] : CORRIDOR_COLOR.default;
            return (
                <g key={key} style={{ pointerEvents: placementType ? 'none' : 'auto' }}>
                  {/* 클릭 히트 영역을 넓히기 위한 투명한 굵은 선 */}
                  <polyline
                      points={c.pointsAttr}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCorridorClick?.(c.fromZoneId, c.toZoneId);
                      }}
                  />
                  <polyline
                      points={c.pointsAttr}
                      fill="none"
                      stroke={color}
                      strokeWidth={status ? 3 : 2}
                      strokeDasharray={status ? undefined : '4 3'}
                      style={{ pointerEvents: 'none' }}
                  />
                </g>
            );
          })}

          {/* 2026-07-25 추가: 배치된 오브젝트 아이콘 (사각형) */}
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
