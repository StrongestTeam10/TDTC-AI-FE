import { useEffect, useRef, useState } from 'react';
import { loadKakaoSdk } from '../utils/kakaoLoader';
import { zoneColor } from '../utils/cctvZonePolygon';

// 2026-08-04 추가 (시설 관리 화면 - 상점 위치 등록)
//
// 기존 프로토타입(store-location-prototype.html)의 손그림 SVG 지도 클릭 방식을
// 실제 카카오맵으로 교체함. 시뮬레이션 지도(HeatmapView)는 구역(zones)/에이전트에
// 강하게 엮여 있어 재사용하기보다, SDK 로더만 공유하고 이 화면 전용의 가벼운
// 지도 컴포넌트를 새로 만듦(클릭 → 위경도, 기존 시설 마커 표시 정도만 필요).
//
// 2026-08-11 추가: CCTV 관제 구역을 그리기 위해 mode를 받는다.
//   - 'point'     : 기존 동작. 클릭 한 번에 위경도 하나(출입구/상점)
//   - 'rectangle' : 클릭 네 번으로 사각형 꼭짓점을 찍는다(CCTV 호모그래피 ROI)
// 저장된 CCTV 구역들은 mode와 무관하게 배경 폴리곤으로 깔아준다 - 새 구역을 그릴 때
// 이미 잡아둔 구역과 겹치는지 눈으로 확인할 수 있어야 하기 때문.

export interface FacilityMarkerPoint {
  facilityId: number;
  name: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

/** 지도에 배경으로 깔아줄 이미 저장된 CCTV 구역. */
export interface CctvZoneOverlay {
  zoneNo: number;
  zoneName: string;
  /** [위도, 경도] 꼭짓점 목록 */
  vertices: Array<[number, number]>;
  /** 지금 편집 중인 구역이면 강조해서 그린다. */
  isEditing: boolean;
}

/**
 * 참고용으로 깔아줄 시뮬레이션 구역(mrkaddr01d). CCTV 구역과는 다른 데이터라
 * 저장 대상이 아니라 "여기에 시뮬레이션 구역이 있다"만 보여주는 배경이다.
 * 시뮬레이션 비교 화면(HeatmapView)의 구역 폴리곤과 같은 좌표를 쓴다.
 */
export interface SimulationZoneOverlay {
  zoneId: number;
  zoneName: string;
  /** [위도, 경도] 꼭짓점 목록 */
  vertices: Array<[number, number]>;
}

export type PickerMode = 'point' | 'rectangle';

/**
 * 작은 원형 마커 이미지(data URI). 기본 카카오 핀은 크고 서로 겹쳐서, 작은 점으로 바꿔
 * 상점이 밀집해도 덜 겹치고 개별 선택이 쉽게 한다. active 여부로 색을 구분한다.
 */
function dotMarkerSvg(active: boolean): string {
  const fill = active ? '#2563eb' : '#94a3b8'; // blue-600 / slate-400
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">` +
    `<circle cx="8" cy="8" r="5.5" fill="${fill}" stroke="#ffffff" stroke-width="2"/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

/** 꼭짓점 [위도, 경도] 목록의 단순 평균 중심점. 라벨 위치용이라 정밀도는 필요 없다. */
function polygonCentroid(vertices: Array<[number, number]>): [number, number] | null {
  if (vertices.length === 0) return null;
  const sum = vertices.reduce(
    (acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng] as [number, number],
    [0, 0] as [number, number]
  );
  return [sum[0] / vertices.length, sum[1] / vertices.length];
}

interface FacilityLocationPickerProps {
  centerLat: number;
  centerLng: number;
  markers: FacilityMarkerPoint[];
  pickedLat: number | null;
  pickedLng: number | null;
  onPick: (lat: number, lng: number) => void;
  height?: number;
  mode?: PickerMode;
  /** rectangle 모드에서 지금까지 찍은 꼭짓점 [위도, 경도] */
  vertices?: Array<[number, number]>;
  /** rectangle 모드에서 꼭짓점을 하나 추가할 때 호출 */
  onAddVertex?: (lat: number, lng: number) => void;
  /** 저장된 CCTV 구역 배경 표시 */
  zoneOverlays?: CctvZoneOverlay[];
  /** 참고용 시뮬레이션 구역 배경 표시(회색 점선). 저장 대상이 아님. */
  simulationZones?: SimulationZoneOverlay[];
  /**
   * CCTV 구역을 그릴 때 벗어나면 안 되는 소속 구역 폴리곤([위도,경도]).
   * 파랗게 강조해 "이 안에만 찍을 수 있다"를 보여준다. 실제 밖 클릭 거부는 부모가 한다.
   */
  constraintPolygon?: Array<[number, number]>;
  /** 시설 마커를 클릭했을 때(수정 진입 등). 지정하면 마커에 포인터 커서가 붙는다. */
  onMarkerClick?: (facilityId: number) => void;
  /** 값이 바뀔 때마다 지도를 constraintPolygon에 다시 맞춘다("선택 구역으로 이동" 버튼용). */
  refitToken?: number;
}

export default function FacilityLocationPicker({
  centerLat,
  centerLng,
  markers,
  pickedLat,
  pickedLng,
  onPick,
  height = 420,
  mode = 'point',
  vertices = [],
  onAddVertex,
  zoneOverlays = [],
  simulationZones = [],
  constraintPolygon,
  onMarkerClick,
  refitToken,
}: FacilityLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any[]>([]);
  // 마커별 호버 정보창. InfoWindow는 marker와 별개 객체라 marker.setMap(null)로는
  // 안 닫혀서 따로 추적해 닫아야 한다(안 그러면 마커가 다시 그려질 때마다 예전
  // 정보창이 지도 위에 계속 쌓인다).
  const infoWindowLayerRef = useRef<any[]>([]);
  // 지금 열려 있는 정보창 하나만 추적해, 다른 마커에 올리면 이전 것부터 닫는다.
  const openInfoWindowRef = useRef<any>(null);
  const pickedMarkerRef = useRef<any>(null);
  const zonePolygonLayerRef = useRef<any[]>([]);
  const simZoneLayerRef = useRef<any[]>([]);
  const constraintLayerRef = useRef<any>(null);
  const draftLayerRef = useRef<any[]>([]);

  // 지도 클릭 핸들러는 최초 1회만 등록하므로, 최신 mode/콜백을 ref로 넘겨준다.
  // (의존성에 넣어 재등록하면 클릭 리스너가 중복으로 쌓인다)
  const clickHandlerRef = useRef({ mode, onPick, onAddVertex });
  clickHandlerRef.current = { mode, onPick, onAddVertex };
  // 마커 클릭 콜백도 마커를 매번 다시 그리지 않도록 ref로 넘긴다.
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 지도 최초 생성 (센터/마커 변경에 매번 재생성하지 않음)
  useEffect(() => {
    let cancelled = false;

    loadKakaoSdk()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(centerLat, centerLng),
          // 2026-08-11: 폴리곤 좌표를 더 정밀하게 찍을 수 있도록 초기 확대를 한 칸 더
          // 당긴다(기존 3 → 2). CCTV 구역을 그릴 땐 아래 constraintPolygon 이펙트가
          // 선택한 구역에 맞춰 화면을 꽉 채워(setBounds) 최대한 크게 보여준다.
          level: 2,
        });
        // 카카오 로드맵의 확대 하한(레벨 1)까지 스크롤로 확대되도록 명시한다.
        // 로드맵은 레벨 1이 최대 확대라 그보다 더는 API가 지원하지 않는다.
        map.setMinLevel(1);
        mapRef.current = map;

        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          const handler = clickHandlerRef.current;
          if (handler.mode === 'rectangle') {
            handler.onAddVertex?.(latlng.getLat(), latlng.getLng());
          } else {
            handler.onPick(latlng.getLat(), latlng.getLng());
          }
        });

        setReady(true);
      })
      .catch((err: Error) => setLoadError(err.message ?? String(err)));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기존 시설 마커(작은 점) 렌더링. 클릭하면 onMarkerClick으로 수정 진입.
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    markerLayerRef.current.forEach((m) => m.setMap(null));
    // 이전 마커에 딸려 있던 정보창도 전부 닫는다(마커만 지워선 안 닫힘 - 위 주석 참고).
    infoWindowLayerRef.current.forEach((iw) => iw.close());
    infoWindowLayerRef.current = [];
    openInfoWindowRef.current = null;

    markerLayerRef.current = markers.map((f) => {
      const image = new window.kakao.maps.MarkerImage(
        dotMarkerSvg(f.isActive),
        new window.kakao.maps.Size(16, 16),
        { offset: new window.kakao.maps.Point(8, 8) }
      );
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(f.latitude, f.longitude),
        map: mapRef.current,
        image,
        title: f.name, // 마우스오버 시 브라우저 기본 툴팁으로 이름 표시
        clickable: true,
      });

      // 호버 시 이름 말풍선, 클릭 시 수정 진입.
      const infoWindow = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:3px 8px;font-size:12px;white-space:nowrap;">${f.name}</div>`,
      });
      infoWindowLayerRef.current.push(infoWindow);

      window.kakao.maps.event.addListener(marker, 'mouseover', () => {
        // 새 정보창을 열기 전에, 다른 마커에서 열려 있던 이전 정보창을 먼저 닫는다.
        if (openInfoWindowRef.current && openInfoWindowRef.current !== infoWindow) {
          openInfoWindowRef.current.close();
        }
        infoWindow.open(mapRef.current, marker);
        openInfoWindowRef.current = infoWindow;
      });
      window.kakao.maps.event.addListener(marker, 'mouseout', () => {
        infoWindow.close();
        if (openInfoWindowRef.current === infoWindow) openInfoWindowRef.current = null;
      });
      window.kakao.maps.event.addListener(marker, 'click', () => {
        // 카카오맵은 마커 클릭이 기본적으로 지도 클릭 이벤트로도 전파된다. 막지 않으면
        // 바로 뒤이어 지도의 click 리스너(onPick)가 또 실행되어, 방금 고른 시설의 정확한
        // 좌표를 클릭 지점의 대략적 좌표로 덮어써버린다("클릭할 때마다 좌표가 바뀐다"의 원인).
        window.kakao.maps.event.preventMap();
        infoWindow.close();
        if (openInfoWindowRef.current === infoWindow) openInfoWindowRef.current = null;
        onMarkerClickRef.current?.(f.facilityId);
      });
      return marker;
    });
  }, [ready, markers]);

  // 참고용 시뮬레이션 구역(회색 점선) 렌더링. 저장 대상이 아니라 배경일 뿐이라
  // CCTV 구역보다 먼저(아래에) 깔아 CCTV 구역이 위에 오도록 한다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    simZoneLayerRef.current.forEach((o) => o.setMap(null));
    simZoneLayerRef.current = [];

    simulationZones
      .filter((zone) => zone.vertices.length >= 3)
      .forEach((zone) => {
        const path = zone.vertices.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng));
        const polygon = new window.kakao.maps.Polygon({
          map: mapRef.current,
          path,
          strokeWeight: 2,
          strokeColor: '#64748b', // slate-500
          strokeOpacity: 0.8,
          strokeStyle: 'shortdash', // CCTV 구역(실선)과 구분되도록 점선
          fillColor: '#64748b',
          fillOpacity: 0.06,
        });
        simZoneLayerRef.current.push(polygon);

        // 구역 이름을 중심점에 옅게 표시(어느 시뮬레이션 구역인지 알아볼 수 있도록)
        const centerLatLng = polygonCentroid(zone.vertices);
        if (centerLatLng) {
          const label = new window.kakao.maps.CustomOverlay({
            map: mapRef.current,
            position: new window.kakao.maps.LatLng(centerLatLng[0], centerLatLng[1]),
            content:
              `<div style="padding:2px 7px;border-radius:10px;background:rgba(100,116,139,.85);` +
              `color:#fff;font-size:11px;font-weight:600;white-space:nowrap;` +
              `box-shadow:0 1px 3px rgba(0,0,0,.3)">🗺️ ${zone.zoneName}</div>`,
            zIndex: 2,
          });
          simZoneLayerRef.current.push(label);
        }
      });
  }, [ready, simulationZones]);

  // 저장된 CCTV 구역 폴리곤 렌더링
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    zonePolygonLayerRef.current.forEach((p) => p.setMap(null));
    zonePolygonLayerRef.current = zoneOverlays
      .filter((zone) => zone.vertices.length >= 3)
      .map((zone) => {
        const color = zoneColor(zone.zoneNo);
        const polygon = new window.kakao.maps.Polygon({
          map: mapRef.current,
          path: zone.vertices.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)),
          strokeWeight: zone.isEditing ? 3 : 2,
          strokeColor: color,
          strokeOpacity: zone.isEditing ? 0.95 : 0.55,
          // 편집 중이 아닌 구역은 옅게 깔아 새 구역을 그리는 데 방해되지 않게 한다.
          fillColor: color,
          fillOpacity: zone.isEditing ? 0.28 : 0.1,
        });
        return polygon;
      });
  }, [ready, zoneOverlays]);

  // CCTV 구역을 그릴 때 벗어나면 안 되는 소속 구역(파란 강조). 클릭 가능 영역을 보여준다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (constraintLayerRef.current) {
      constraintLayerRef.current.setMap(null);
      constraintLayerRef.current = null;
    }
    if (!constraintPolygon || constraintPolygon.length < 3) return;

    const path = constraintPolygon.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng));

    constraintLayerRef.current = new window.kakao.maps.Polygon({
      map: mapRef.current,
      path,
      strokeWeight: 3,
      strokeColor: '#2563eb', // blue-600
      strokeOpacity: 0.9,
      fillColor: '#3b82f6',
      fillOpacity: 0.08,
    });

    // 선택한 소속 구역이 화면을 꽉 채우도록 지도를 그 구역에 맞춘다. 구역이 시장 중심에서
    // 떨어져 있어도 바로 보이고, 그만큼 크게 확대돼 좌표를 정밀하게 찍을 수 있다.
    // (constraintPolygon 참조는 소속 구역이 바뀔 때만 바뀌므로 매 클릭마다 튀지 않는다)
    const bounds = new window.kakao.maps.LatLngBounds();
    path.forEach((latLng) => bounds.extend(latLng));
    mapRef.current.setBounds(bounds);
  }, [ready, constraintPolygon]);

  // "선택 구역으로 이동" 버튼: refitToken이 바뀌면 지도를 소속 구역에 다시 맞춘다.
  // (지도를 패닝해 구역에서 벗어났을 때 되돌아오는 용도)
  useEffect(() => {
    if (!ready || !mapRef.current || refitToken === undefined) return;
    if (!constraintPolygon || constraintPolygon.length < 3) return;

    const bounds = new window.kakao.maps.LatLngBounds();
    constraintPolygon.forEach(([lat, lng]) => bounds.extend(new window.kakao.maps.LatLng(lat, lng)));
    mapRef.current.setBounds(bounds);
    // constraintPolygon은 deps에서 제외 - 그건 위 이펙트가 이미 맞춘다.
    // 여기선 오직 버튼(refitToken)에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitToken]);

  // rectangle 모드에서 지금 찍고 있는 꼭짓점 + 미리보기 도형
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    draftLayerRef.current.forEach((o) => o.setMap(null));
    draftLayerRef.current = [];
    if (mode !== 'rectangle' || vertices.length === 0) return;

    const positions = vertices.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng));

    // 꼭짓점 번호를 붙여 어떤 순서로 찍었는지 보이게 한다(순서가 뒤집히면 폴리곤이 꼬인다).
    positions.forEach((position, index) => {
      const label = new window.kakao.maps.CustomOverlay({
        map: mapRef.current,
        position,
        content:
          `<div style="width:22px;height:22px;border-radius:50%;background:#dc2626;color:#fff;` +
          `font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;` +
          `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${index + 1}</div>`,
        zIndex: 5,
      });
      draftLayerRef.current.push(label);
    });

    if (positions.length >= 2) {
      const shape =
        positions.length >= 3
          ? new window.kakao.maps.Polygon({
              map: mapRef.current,
              path: positions,
              strokeWeight: 3,
              strokeColor: '#dc2626',
              strokeOpacity: 0.9,
              fillColor: '#dc2626',
              fillOpacity: 0.2,
            })
          : new window.kakao.maps.Polyline({
              map: mapRef.current,
              path: positions,
              strokeWeight: 3,
              strokeColor: '#dc2626',
              strokeOpacity: 0.9,
            });
      draftLayerRef.current.push(shape);
    }
  }, [ready, mode, vertices]);

  // 클릭/직접입력으로 선택된 위치(빨간 마커) 렌더링 - point 모드 전용
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (pickedMarkerRef.current) {
      pickedMarkerRef.current.setMap(null);
      pickedMarkerRef.current = null;
    }
    if (mode !== 'point' || pickedLat == null || pickedLng == null) return;

    const position = new window.kakao.maps.LatLng(pickedLat, pickedLng);
    pickedMarkerRef.current = new window.kakao.maps.Marker({
      position,
      map: mapRef.current,
      image: new window.kakao.maps.MarkerImage(
        'data:image/svg+xml;base64,' +
          btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="9" fill="#dc2626" stroke="#ffffff" stroke-width="2.5"/></svg>'
          ),
        new window.kakao.maps.Size(28, 28),
        { offset: new window.kakao.maps.Point(14, 14) }
      ),
    });
    mapRef.current.panTo(position);
  }, [ready, mode, pickedLat, pickedLng]);

  if (loadError) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300"
      >
        지도를 불러오지 못했습니다: {loadError}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800"
    />
  );
}
