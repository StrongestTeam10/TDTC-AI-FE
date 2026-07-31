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
  focusEvent?: EventTrigger | null;
}

declare global {
  interface Window {
    kakao: any;
  }
}

const KAKAO_APP_KEY = import.meta.env.VITE_KAKAO_JS_KEY;

let kakaoLoaderPromise: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (window.kakao?.maps) {
    return Promise.resolve();
  }
  if (kakaoLoaderPromise) {
    return kakaoLoaderPromise;
  }
  if (!KAKAO_APP_KEY) {
    return Promise.reject(new Error('VITE_KAKAO_JS_KEY 환경변수가 설정되지 않았습니다.'));
  }
  kakaoLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('kakao-map-sdk');
    if (existing) {
      existing.addEventListener('load', () => window.kakao.maps.load(() => resolve()));
      existing.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드 실패')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'));
    document.head.appendChild(script);
  });
  return kakaoLoaderPromise;
}

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

function zoneCentroidMap(
    zonePolygonPoints: { zone: Zone; points: LonLat[] }[]
): Map<number, LonLat> {
  return new Map(
      zonePolygonPoints.map(({ zone, points }) => {
        const centroid: LonLat = points.reduce(
            (acc, [lon, lat]) => [acc[0] + lon / points.length, acc[1] + lat / points.length],
            [0, 0] as LonLat
        );
        return [zone.zoneId, centroid] as [number, LonLat];
      })
  );
}

const RISK_COLOR: Record<string, string> = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};
const DEFAULT_ZONE_COLOR = '#64748b';

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

const DEFAULT_CENTER: LonLat = [126.978, 37.5665];

// 2026-07-29 추가: 이벤트가 발동하는 순간, 지도 위에 잠깐 나타났다 사라지는
// 펄스(원이 커지며 옅어지는) 효과용 CSS 애니메이션. 한 번만 <style> 태그로
// 주입한다.
let pulseStyleInjected = false;
function ensurePulseStyle() {
  if (pulseStyleInjected) return;
  pulseStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes kakaoEventPulse {
      0% { transform: scale(0.4); opacity: 0.9; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
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
                                       focusEvent = null,
                                     }: HeatmapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const placementTypeRef = useRef(placementType);
  const onPlaceObjectRef = useRef(onPlaceObject);
  const onGateClickRef = useRef(onGateClick);
  const zonesRef = useRef(zones);
  useEffect(() => { placementTypeRef.current = placementType; }, [placementType]);
  useEffect(() => { onPlaceObjectRef.current = onPlaceObject; }, [onPlaceObject]);
  useEffect(() => { onGateClickRef.current = onGateClick; }, [onGateClick]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

  const zonePolygonPoints = useMemo(() => {
    return zones
        .map((zone) => ({ zone, points: parsePolygon(zone.polygonCoordinates) }))
        .filter((z): z is { zone: Zone; points: LonLat[] } => z.points !== null);
  }, [zones]);

  useEffect(() => {
    let cancelled = false;

    loadKakaoSdk()
        .then(() => {
          if (cancelled || !containerRef.current || mapRef.current) return;

          const first = zonePolygonPoints[0];
          const [centerLon, centerLat] = first
              ? first.points.reduce(
                  (acc, [lon, lat]) => [acc[0] + lon / first.points.length, acc[1] + lat / first.points.length],
                  [0, 0] as LonLat
              )
              : DEFAULT_CENTER;

          const map = new window.kakao.maps.Map(containerRef.current, {
            center: new window.kakao.maps.LatLng(centerLat, centerLon),
            level: 3,
          });
          mapRef.current = map;

          if (zonePolygonPoints.length > 0) {
            const bounds = new window.kakao.maps.LatLngBounds();
            zonePolygonPoints.forEach(({ points }) =>
                points.forEach(([lon, lat]) => bounds.extend(new window.kakao.maps.LatLng(lat, lon)))
            );
            map.setBounds(bounds);
          }

          window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
            const kind = placementTypeRef.current;
            if (!kind || !onPlaceObjectRef.current) return;
            const latlng = mouseEvent.latLng;
            const lat = latlng.getLat();
            const lon = latlng.getLng();
            const containing = zonesRef.current
                .map((zone) => ({ zone, points: parsePolygon(zone.polygonCoordinates) }))
                .find((z): z is { zone: Zone; points: LonLat[] } => z.points !== null && pointInPolygon(lon, lat, z.points));
            if (!containing) return;
            onPlaceObjectRef.current(containing.zone.zoneId, lat, lon);
          });

          setReady(true);
        })
        .catch((err: Error) => setLoadError(err.message ?? String(err)));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zonePolygonsRef = useRef<any[]>([]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    zonePolygonsRef.current.forEach((p) => p.setMap(null));
    zonePolygonsRef.current = [];

    const riskByZoneId = new Map((zoneRisks ?? []).map((r) => [r.zoneId, r]));

    zonePolygonPoints.forEach(({ zone, points }) => {
      const risk = riskByZoneId.get(zone.zoneId);
      const level = risk?.riskLevel?.toLowerCase();
      const color = (level && RISK_COLOR[level]) || DEFAULT_ZONE_COLOR;

      const path = points.map(([lon, lat]) => new window.kakao.maps.LatLng(lat, lon));
      const polygon = new window.kakao.maps.Polygon({
        map: mapRef.current,
        path,
        strokeWeight: 2,
        strokeColor: color,
        strokeOpacity: 0.9,
        fillColor: color,
        fillOpacity: 0.15,
      });
      zonePolygonsRef.current.push(polygon);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zonePolygonPoints, zoneRisks]);

  const corridorLinesRef = useRef<any[]>([]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    corridorLinesRef.current.forEach((l) => l.setMap(null));
    corridorLinesRef.current = [];

    const centroids = zoneCentroidMap(zonePolygonPoints);

    (corridors ?? []).forEach((c) => {
      const line = c.pathCoordinates ? parseLineString(c.pathCoordinates) : null;
      const coords: LonLat[] = line ?? [centroids.get(c.fromZoneId), centroids.get(c.toZoneId)].filter(
          (p): p is LonLat => p !== undefined
      );
      if (coords.length < 2) return;

      const path = coords.map(([lon, lat]) => new window.kakao.maps.LatLng(lat, lon));
      const polyline = new window.kakao.maps.Polyline({
        map: mapRef.current,
        path,
        strokeWeight: 3,
        strokeColor: '#64748b',
        strokeOpacity: 0.7,
        strokeStyle: 'shortdash',
      });
      corridorLinesRef.current.push(polyline);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, corridors, zonePolygonPoints]);

  const gateOverlaysRef = useRef<any[]>([]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    gateOverlaysRef.current.forEach((o) => o.setMap(null));
    gateOverlaysRef.current = [];

    (gates ?? []).forEach((gate) => {
      const isClosed = closedGateIds?.has(gate.facilityId) ?? false;
      const color = isClosed ? GATE_CLOSED_COLOR : GATE_OPEN_COLOR;
      const glyph = isClosed ? '\u2715' : '\u2713';

      const el = document.createElement('div');
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = '50%';
      el.style.background = color;
      el.style.border = '1.5px solid #0f172a';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '11px';
      el.style.fontWeight = 'bold';
      el.style.color = '#0f172a';
      el.style.cursor = onGateClickRef.current ? 'pointer' : 'default';
      el.textContent = glyph;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onGateClickRef.current?.(gate.facilityId);
      });

      const overlay = new window.kakao.maps.CustomOverlay({
        map: mapRef.current,
        position: new window.kakao.maps.LatLng(gate.latitude, gate.longitude),
        content: el,
        yAnchor: 0.5,
      });
      gateOverlaysRef.current.push(overlay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, gates, closedGateIds]);

  const objectOverlaysRef = useRef<any[]>([]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    objectOverlaysRef.current.forEach((o) => o.setMap(null));
    objectOverlaysRef.current = [];

    const centroids = zoneCentroidMap(zonePolygonPoints);

    (placedObjects ?? []).forEach((obj) => {
      const hasCoords =
          obj.latitude !== undefined && obj.latitude !== null && obj.longitude !== undefined && obj.longitude !== null;
      const [lon, lat] = hasCoords
          ? [obj.longitude as number, obj.latitude as number]
          : centroids.get(obj.zoneId) ?? DEFAULT_CENTER;

      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '3px';
      el.style.background = OBJECT_COLOR[obj.objectType];
      el.style.border = '1px solid #0f172a';

      const overlay = new window.kakao.maps.CustomOverlay({
        map: mapRef.current,
        position: new window.kakao.maps.LatLng(lat, lon),
        content: el,
        yAnchor: 0.5,
      });
      objectOverlaysRef.current.push(overlay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, placedObjects, zonePolygonPoints]);

  const eventOverlaysRef = useRef<any[]>([]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    eventOverlaysRef.current.forEach((o) => o.setMap(null));
    eventOverlaysRef.current = [];

    const centroids = zoneCentroidMap(zonePolygonPoints);

    (events ?? []).forEach((ev) => {
      const hasCoords =
          ev.latitude !== undefined && ev.latitude !== null && ev.longitude !== undefined && ev.longitude !== null;
      const [lon, lat] = hasCoords
          ? [ev.longitude as number, ev.latitude as number]
          : centroids.get(ev.zoneId) ?? DEFAULT_CENTER;

      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.background = EVENT_COLOR[ev.eventType];
      el.style.border = '1.5px solid #0f172a';

      const overlay = new window.kakao.maps.CustomOverlay({
        map: mapRef.current,
        position: new window.kakao.maps.LatLng(lat, lon),
        content: el,
        yAnchor: 0.5,
      });
      eventOverlaysRef.current.push(overlay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, events, zonePolygonPoints]);

  // ---------- 이벤트 발동 시점: 지도 자동 이동 + 펄스 강조 ----------
  // 2026-07-29 추가: focusEvent는 "지금 막 발동한 이벤트"만 잠깐 채워지는 값이다
  // (ScenarioPage가 현재 재생 스텝과 triggerStep이 일치하는 순간에만 넘겨줌).
  // 값이 들어오면 그 위치로 지도를 살짝 이동시키고, 눈에 띄는 펄스 원을 잠깐
  // 띄웠다가 자동으로 제거한다.
  useEffect(() => {
    if (!ready || !mapRef.current || !focusEvent) return;

    ensurePulseStyle();

    const centroids = zoneCentroidMap(zonePolygonPoints);
    const hasCoords =
        focusEvent.latitude !== undefined && focusEvent.latitude !== null &&
        focusEvent.longitude !== undefined && focusEvent.longitude !== null;
    const [lon, lat] = hasCoords
        ? [focusEvent.longitude as number, focusEvent.latitude as number]
        : centroids.get(focusEvent.zoneId) ?? DEFAULT_CENTER;
    const position = new window.kakao.maps.LatLng(lat, lon);

    mapRef.current.panTo(position);

    const ringColor = EVENT_COLOR[focusEvent.eventType];
    const ringEl = document.createElement('div');
    ringEl.style.width = '30px';
    ringEl.style.height = '30px';
    ringEl.style.borderRadius = '50%';
    ringEl.style.border = `3px solid ${ringColor}`;
    ringEl.style.boxSizing = 'border-box';
    ringEl.style.animation = 'kakaoEventPulse 1.2s ease-out 2';
    ringEl.style.pointerEvents = 'none';

    const pulseOverlay = new window.kakao.maps.CustomOverlay({
      map: mapRef.current,
      position,
      content: ringEl,
      yAnchor: 0.5,
      zIndex: 50,
    });

    const timeoutId = window.setTimeout(() => {
      pulseOverlay.setMap(null);
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
      pulseOverlay.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusEvent]);

  // ---------- 에이전트: agents 바뀔 때마다(2초 폴링 등) 위치를 부드럽게 보간 이동 ----------
  // 2026-07-27 추가: 카카오 CustomOverlay는 setPosition()으로 옮기면 즉시 순간이동해서
  // CSS transition이 안 먹는다(내부적으로 픽셀 좌표를 다시 계산해서 바로 반영하기
  // 때문). 그래서 requestAnimationFrame으로 이전 위치 -> 새 위치를 직접 보간하며
  // setPosition을 여러 번 호출하는 방식으로 부드러운 이동을 구현한다.
  interface AgentOverlayEntry {
    overlay: any;
    el: HTMLDivElement;
    currentLat: number;
    currentLng: number;
    animFrameId: number | null;
  }
  const agentOverlayMapRef = useRef<Map<number, AgentOverlayEntry>>(new Map());

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const currentIds = new Set(agents.map((a) => a.agentId));

    // 더 이상 없는 에이전트(퇴장 등) 정리
    agentOverlayMapRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        if (entry.animFrameId !== null) cancelAnimationFrame(entry.animFrameId);
        entry.overlay.setMap(null);
        agentOverlayMapRef.current.delete(id);
      }
    });

    agents.forEach((agent) => {
      const color = AGENT_COLOR[agent.state] ?? AGENT_COLOR.normal;
      let entry = agentOverlayMapRef.current.get(agent.agentId);

      if (!entry) {
        const el = document.createElement('div');
        el.style.width = '8px';
        el.style.height = '8px';
        el.style.borderRadius = '50%';
        el.style.border = '0.5px solid #0f172a';
        el.style.background = color;

        const overlay = new window.kakao.maps.CustomOverlay({
          map: mapRef.current,
          position: new window.kakao.maps.LatLng(agent.latitude, agent.longitude),
          content: el,
          yAnchor: 0.5,
        });
        agentOverlayMapRef.current.set(agent.agentId, {
          overlay,
          el,
          currentLat: agent.latitude,
          currentLng: agent.longitude,
          animFrameId: null,
        });
        return;
      }

      entry.el.style.background = color;

      if (entry.animFrameId !== null) {
        cancelAnimationFrame(entry.animFrameId);
        entry.animFrameId = null;
      }

      const startLat = entry.currentLat;
      const startLng = entry.currentLng;
      const endLat = agent.latitude;
      const endLng = agent.longitude;
      const duration = Math.max(transitionMs, 0);

      if (duration === 0) {
        entry.overlay.setPosition(new window.kakao.maps.LatLng(endLat, endLng));
        entry.currentLat = endLat;
        entry.currentLng = endLng;
        return;
      }

      const startTime = performance.now();
      const activeEntry = entry;
      const step = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const lat = startLat + (endLat - startLat) * t;
        const lng = startLng + (endLng - startLng) * t;
        activeEntry.overlay.setPosition(new window.kakao.maps.LatLng(lat, lng));
        activeEntry.currentLat = lat;
        activeEntry.currentLng = lng;
        if (t < 1) {
          activeEntry.animFrameId = requestAnimationFrame(step);
        } else {
          activeEntry.animFrameId = null;
        }
      };
      activeEntry.animFrameId = requestAnimationFrame(step);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, agents, transitionMs]);

  // 컴포넌트 언마운트 시 모든 애니메이션/오버레이 정리
  useEffect(() => {
    return () => {
      agentOverlayMapRef.current.forEach((entry) => {
        if (entry.animFrameId !== null) cancelAnimationFrame(entry.animFrameId);
        entry.overlay.setMap(null);
      });
      agentOverlayMapRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.relayout();
    }
  }, [width, height]);

  if (loadError) {
    return (
        <div
            className="relative rounded-lg border border-red-800 bg-red-950/30 flex items-center justify-center text-red-300 text-sm p-4"
            style={{ width, minHeight: height }}
        >
          카카오맵 로드 실패: {loadError}
        </div>
    );
  }

  return (
      <div className="relative" style={{ width, height }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }} />

        {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-slate-400 text-sm rounded-lg">
              지도를 불러오는 중입니다...
            </div>
        )}

        <div className="absolute top-2 left-2 text-xs text-slate-100 bg-slate-900/80 rounded px-2 py-1 pointer-events-none">
          구역 {zones.length}개 · 유동 인구 {agents.length}명
        </div>

        {placementType && (
            <div className="absolute top-2 right-2 text-xs text-sky-100 bg-sky-900/90 rounded px-2 py-1 pointer-events-none">
              지도를 클릭해서 배치하세요
            </div>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-3 text-[10px] text-slate-100 bg-slate-900/80 rounded px-2 py-1 pointer-events-none">
          {Object.entries(AGENT_COLOR).map(([state, color]) => (
              <span key={state} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {state === 'normal' ? '정상' : state === 'congested' ? '혼잡' : '대피 중'}
          </span>
          ))}
        </div>
      </div>
  );
}