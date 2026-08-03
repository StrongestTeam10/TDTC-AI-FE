import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentState, Zone } from '../types';

// 특정 구역의 위험도 정보 (파이프라인 A: SIM ZoneResult 기반, 선택적)
export interface ZoneRisk {
  zoneId: number;
  riskLevel?: string;
  riskScore?: number;
}

interface HeatmapViewProps {
  zones: Zone[];
  agents: AgentState[];
  zoneRisks?: ZoneRisk[];
  width?: number | string;
  height?: number | string;
  // 프레임이 바뀔 때 점이 순간이동하지 않고 부드럽게 미끄러지도록 하는 트랜지션
  // 시간(ms). FramePlayer가 재생 간격과 맞춰서 넘겨준다. 미지정(0)이면 순간이동.
  transitionMs?: number;
}

const RISK_FILL: Record<string, string> = {
  low: 'rgba(59, 130, 246, 0.25)',      // blue
  medium: 'rgba(245, 158, 11, 0.3)',    // amber
  high: 'rgba(249, 115, 22, 0.35)',     // orange
  critical: 'rgba(239, 68, 68, 0.4)',   // red
};
const RISK_STROKE: Record<string, string> = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};
const DEFAULT_FILL = 'rgba(100, 116, 139, 0.2)'; // slate, 위험도 정보 없을 때
const DEFAULT_STROKE = '#64748b';

const AGENT_COLOR: Record<string, string> = {
  normal: '#38bdf8',
  congested: '#f59e0b',
  evacuating: '#ef4444',
};

// 확대/축소 상태. 지금은 SVG viewBox에 반영하지만, 나중에 구글맵 API로 바꿔도
// 이 zoom/center 개념을 그대로 map.setZoom()/setCenter()에 넘기면 되도록
// "확대 배율 + 중심점"이라는 지도 API 공통 개념으로 설계함 (2026-07-24 추가).
interface Viewport {
  zoom: number;   // 1 = 기본, 커질수록 확대
  panX: number;   // 보이는 영역의 좌상단 x (SVG 로컬 좌표)
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

export default function HeatmapView({
  zones,
  agents,
  zoneRisks,
  width = 640,
  height = 480,
  transitionMs = 0,
}: HeatmapViewProps) {
  const internalWidth = typeof width === 'number' ? width : 640;
  const internalHeight = typeof height === 'number' ? height : 480;
  
  const PADDING = 32;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
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

  const renderWidth = width ?? measuredWidth;

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
      // 화면 중앙을 기준으로 확대/축소
      const oldVbW = internalWidth / v.zoom, oldVbH = internalHeight / v.zoom;
      const newVbW = internalWidth / nextZoom, newVbH = internalHeight / nextZoom;
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

    // 구역 폴리곤 좌표 + 에이전트 좌표를 모두 포함해 경계 산출
    const allLons: number[] = [];
    const allLats: number[] = [];
    zonePolygons.forEach(({ points }) =>
      points.forEach(([lon, lat]) => {
        allLons.push(lon);
        allLats.push(lat);
      })
    );

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
      (internalWidth - PADDING * 2) / lonSpan,
      (internalHeight - PADDING * 2) / latSpan
    );

    const project = ([lon, lat]: LonLat): [number, number] => [
      PADDING + (lon - minLon) * scale,
      PADDING + (maxLat - lat) * scale, // 위도가 클수록(북쪽) 화면 위쪽(작은 y)
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

    return { renderedZones, renderedAgents };
  }, [zones, agents, zoneRisks, internalWidth, internalHeight]);

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
      style={{ width, minHeight: height, cursor: 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg
        viewBox={`${viewport.panX} ${viewport.panY} ${vbWidth} ${vbHeight}`}
        width="100%"
        height={height}
        className="block"
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
      </div>

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
