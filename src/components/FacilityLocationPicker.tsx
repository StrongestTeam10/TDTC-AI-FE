import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
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

/**
 * 2026-08-14 추가: 'polygon'(꼭짓점 수 제한 없는 영역)과 'line'(두 점 직선).
 * 시장 등록 화면에서 시장 영역을 그리고, 그 위에 선을 그어 구역으로 나누는 데 쓴다.
 * 셋 다 클릭으로 꼭짓점을 모으는 방식이 같고, 몇 개까지 받을지는 부모가 정한다.
 */
/**
 * 2026-08-14 추가: 'box'는 두 점(남서·북동)으로 축에 나란한 사각형 범위를 정한다.
 * 건물을 받아올 영역을 지도에서 집어내는 데 쓴다 - 반경(원)은 시장 골목처럼 한쪽으로
 * 긴 모양에서 필요 없는 사방까지 함께 가져온다.
 */
export type PickerMode = 'point' | 'rectangle' | 'polygon' | 'line' | 'box';

/** 클릭이 꼭짓점 추가로 동작하는 모드들(그 외에는 onPick으로 위치를 고른다). */
const VERTEX_MODES: readonly PickerMode[] = ['rectangle', 'polygon', 'line', 'box'];

/** 2026-08-14: 장소 검색 결과 한 건. 카카오 Places 응답에서 필요한 것만 추린 형태. */
interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** 목록이 지도를 가리지 않을 만큼만 보여준다. */
const MAX_SEARCH_RESULTS = 6;

/** 검색 결과로 이동했을 때의 확대 단계. 시장 하나가 화면에 들어오는 정도. */
const SEARCH_RESULT_ZOOM_LEVEL = 4;

type SearchState = 'idle' | 'searching' | 'empty' | 'error';

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
  /** 꼭짓점 수집 모드(rectangle·polygon·line)에서 지금까지 찍은 꼭짓점 [위도, 경도] */
  vertices?: Array<[number, number]>;
  /** 꼭짓점 수집 모드에서 꼭짓점을 하나 추가할 때 호출 */
  onAddVertex?: (lat: number, lng: number) => void;
  /**
   * 2026-08-14 추가: 그리는 중인 도형의 색. 시장 등록 화면에서 "영역"과 "자르는 선"을
   * 같은 지도 위에서 구분해야 해서 열어둔다. 기본값은 기존 동작과 같은 빨강.
   */
  draftColor?: string;
  /**
   * 2026-08-14 추가: 이미 확정한 선들([위도, 경도] 점 목록). 구역을 나눌 선을 여러 개
   * 그을 때, 앞서 그은 선을 계속 보여주기 위한 것이다.
   */
  committedLines?: Array<Array<[number, number]>>;
  /** 저장된 CCTV 구역 배경 표시 */
  zoneOverlays?: CctvZoneOverlay[];
  /** 참고용 시뮬레이션 구역 배경 표시(회색 점선). 저장 대상이 아님. */
  simulationZones?: SimulationZoneOverlay[];
  /**
   * 2026-08-14 추가: 건물 폴리곤 배경 표시([위도, 경도] 꼭짓점 목록들).
   *
   * 시장 영역을 그릴 때 어디가 건물이고 어디가 골목인지 보이게 하려는 것이다.
   * 시뮬레이션은 "구역 - 건물"을 실제 통로로 보므로(SIM model.py), 건물 자리는
   * 영역 안에 있어도 사람이 못 다닌다. 그 사실을 그리는 동안 눈으로 확인할 수 있어야 한다.
   */
  buildingOverlays?: Array<Array<[number, number]>>;
  /**
   * CCTV 구역을 그릴 때 벗어나면 안 되는 소속 구역 폴리곤([위도,경도]).
   * 파랗게 강조해 "이 안에만 찍을 수 있다"를 보여준다. 실제 밖 클릭 거부는 부모가 한다.
   */
  constraintPolygon?: Array<[number, number]>;
  /** 시설 마커를 클릭했을 때(수정 진입 등). 지정하면 마커에 포인터 커서가 붙는다. */
  onMarkerClick?: (facilityId: number) => void;
  /** 값이 바뀔 때마다 지도를 constraintPolygon에 다시 맞춘다("선택 구역으로 이동" 버튼용). */
  refitToken?: number;
  /**
   * 2026-08-14 추가: 지도 최초 확대 단계. 기본 2는 좌표를 정밀하게 찍기 위한 값이라
   * 화면에 50m 남짓만 보인다. 아직 위치가 정해지지 않은 새 시장을 지도에서 찾아야
   * 할 때는(시장 등록 화면 1단계) 더 넓게 시작해야 한다.
   */
  initialLevel?: number;
  /**
   * 2026-08-14 추가: 값이 바뀌면 지도를 centerLat/centerLng로 다시 옮긴다.
   * 좌표를 숫자로 직접 입력했을 때 지도가 따라오게 하는 용도.
   */
  recenterToken?: number;
  /**
   * 2026-08-14 추가: 지도 위에 장소 검색창을 띄운다.
   *
   * 새 시장을 등록할 때 위치를 지도에서 손으로 찾아 헤매지 않도록 이름으로 찾아간다
   * ("망원시장"). 기본값이 false라 기존 화면(/facilities)에는 아무 변화가 없다.
   */
  searchable?: boolean;
  /**
   * 2026-08-14 추가: 검색 결과를 골랐을 때. onPick은 좌표만 주는데, 시장 등록 화면은
   * 고른 장소의 <b>이름</b>도 필요해서(시장 이름을 자동으로 채운다) 따로 둔다.
   * point 모드가 아니어도 호출된다 - 지도만 옮기는 경우에도 무엇을 골랐는지는 알아야 한다.
   */
  onPlaceSelected?: (place: { name: string; address: string; lat: number; lng: number }) => void;
  /**
   * 2026-08-14 추가: 지도 배경(일반/위성)과 지적편집도 겹치기 토글을 보여준다.
   *
   * 시장 영역을 그릴 때 기본 로드맵만 보면 골목이 어디부터 어디까지인지 알 수가 없다.
   * 전통시장 경계를 폴리곤으로 주는 공개 API가 없어서(네이버·카카오 모두 검색 결과는
   * 점 하나뿐이다) 데이터로는 못 가져오는데, 위성 사진과 지적편집도를 깔면 눈으로
   * 보면서 그릴 수 있다. 타일 이미지라 좌표를 뽑아낼 수는 없다.
   */
  mapTypeToggle?: boolean;
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
  draftColor = '#dc2626',
  committedLines = [],
  zoneOverlays = [],
  simulationZones = [],
  buildingOverlays = [],
  constraintPolygon,
  onMarkerClick,
  refitToken,
  initialLevel = 2,
  recenterToken,
  searchable = false,
  onPlaceSelected,
  mapTypeToggle = false,
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
  const buildingLayerRef = useRef<any[]>([]);
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

  // 2026-08-14: 장소 검색(searchable일 때만 씀)
  // id는 useId로 만든다 - 한 화면에 지도가 둘 이상 놓여도 label의 htmlFor가 겹치지 않게.
  const searchInputId = useId();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');

  // 2026-08-14: 지도 배경(mapTypeToggle일 때만 씀)
  const [baseMapType, setBaseMapType] = useState<'ROADMAP' | 'HYBRID'>('ROADMAP');
  const [showDistrict, setShowDistrict] = useState(false);

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
          level: initialLevel,
        });
        // 카카오 로드맵의 확대 하한(레벨 1)까지 스크롤로 확대되도록 명시한다.
        // 로드맵은 레벨 1이 최대 확대라 그보다 더는 API가 지원하지 않는다.
        map.setMinLevel(1);
        mapRef.current = map;

        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          const handler = clickHandlerRef.current;
          if (VERTEX_MODES.includes(handler.mode)) {
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

    // (아래는 CCTV 구역 오버레이)
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

  // 2026-08-14: 건물 폴리곤 배경. 시뮬레이션이 "구역 - 건물"을 통로로 보기 때문에,
  // 영역을 그리는 동안 건물 자리가 보여야 어디가 실제로 걸을 수 있는 공간인지 판단할 수 있다.
  // 클릭을 가로채면 안 되므로 채우기만 하고 이벤트는 붙이지 않는다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    buildingLayerRef.current.forEach((p) => p.setMap(null));
    buildingLayerRef.current = buildingOverlays
      .filter((building) => building.length >= 3)
      .map((building) =>
        new window.kakao.maps.Polygon({
          map: mapRef.current,
          path: building.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)),
          strokeWeight: 1,
          strokeColor: '#475569',
          strokeOpacity: 0.85,
          fillColor: '#475569',
          fillOpacity: 0.45,
        })
      );
  }, [ready, buildingOverlays]);

  // 2026-08-14: 지도 배경 전환. 일반/위성은 기본 지도 타입을 바꾸고, 지적편집도는
  // 그 위에 겹치는 오버레이라 add/remove로 따로 다룬다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setMapTypeId(window.kakao.maps.MapTypeId[baseMapType]);
  }, [ready, baseMapType]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const districtType = window.kakao.maps.MapTypeId.USE_DISTRICT;
    if (showDistrict) {
      mapRef.current.addOverlayMapTypeId(districtType);
    } else {
      mapRef.current.removeOverlayMapTypeId(districtType);
    }
  }, [ready, showDistrict]);

  // 2026-08-14: recenterToken이 바뀌면 지도를 현재 centerLat/centerLng로 옮긴다.
  // 좌표를 숫자로 직접 입력했을 때 지도가 따라오게 한다(최초 생성 이펙트는 한 번만 돈다).
  useEffect(() => {
    if (!ready || !mapRef.current || recenterToken === undefined) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(centerLat, centerLng));
    // centerLat/centerLng는 deps에서 제외 - 타이핑 중 매 글자마다 지도가 튀지 않게
    // 오직 토큰(버튼/확정)에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  // "선택 구역으로 이동" 버튼: refitToken이 바뀌면 지도를 소속 구역에 다시 맞춘다.
  // (지도를 패닝해 구역에서 벗어났을 때 되돌아오는 용도)
  //
  // 2026-08-14: constraintPolygon이 없으면 지금 그리고 있는 꼭짓점(vertices)에 맞춘다.
  // 시장 등록 화면에서 OSM 경계를 불러왔을 때 그 폴리곤이 화면에 다 들어오게 하려는 것이다
  // (기존 화면은 refitToken을 쓸 때 항상 constraintPolygon이 있어 동작이 바뀌지 않는다).
  useEffect(() => {
    if (!ready || !mapRef.current || refitToken === undefined) return;
    const target = constraintPolygon && constraintPolygon.length >= 3 ? constraintPolygon : vertices;
    if (target.length < 3) return;

    const bounds = new window.kakao.maps.LatLngBounds();
    target.forEach(([lat, lng]) => bounds.extend(new window.kakao.maps.LatLng(lat, lng)));
    mapRef.current.setBounds(bounds);
    // constraintPolygon은 deps에서 제외 - 그건 위 이펙트가 이미 맞춘다.
    // 여기선 오직 버튼(refitToken)에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitToken]);

  // 꼭짓점 수집 모드에서 지금 찍고 있는 꼭짓점 + 미리보기 도형.
  // 2026-08-14: 확정된 자르는 선(committedLines)도 같은 레이어에서 함께 그린다 -
  // 선을 여러 개 그을 때 앞서 그은 선이 계속 보여야 어디를 더 잘라야 할지 판단할 수 있다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    draftLayerRef.current.forEach((o) => o.setMap(null));
    draftLayerRef.current = [];

    committedLines
      .filter((line) => line.length >= 2)
      .forEach((line) => {
        const polyline = new window.kakao.maps.Polyline({
          map: mapRef.current,
          path: line.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)),
          strokeWeight: 3,
          strokeColor: '#0f766e',
          strokeOpacity: 0.95,
        });
        draftLayerRef.current.push(polyline);
      });

    if (!VERTEX_MODES.includes(mode) || vertices.length === 0) return;

    const positions = vertices.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng));

    // 꼭짓점 번호를 붙여 어떤 순서로 찍었는지 보이게 한다(순서가 뒤집히면 폴리곤이 꼬인다).
    positions.forEach((position, index) => {
      const label = new window.kakao.maps.CustomOverlay({
        map: mapRef.current,
        position,
        content:
          `<div style="width:22px;height:22px;border-radius:50%;background:${draftColor};color:#fff;` +
          `font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;` +
          `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${index + 1}</div>`,
        zIndex: 5,
      });
      draftLayerRef.current.push(label);
    });

    // box 모드: 두 점을 남서/북동 모서리로 보고 축에 나란한 사각형을 그린다.
    if (mode === 'box' && vertices.length === 2) {
      const [[lat1, lng1], [lat2, lng2]] = vertices;
      const south = Math.min(lat1, lat2);
      const north = Math.max(lat1, lat2);
      const west = Math.min(lng1, lng2);
      const east = Math.max(lng1, lng2);

      const box = new window.kakao.maps.Polygon({
        map: mapRef.current,
        path: [
          new window.kakao.maps.LatLng(south, west),
          new window.kakao.maps.LatLng(south, east),
          new window.kakao.maps.LatLng(north, east),
          new window.kakao.maps.LatLng(north, west),
        ],
        strokeWeight: 3,
        strokeColor: draftColor,
        strokeOpacity: 0.9,
        fillColor: draftColor,
        fillOpacity: 0.15,
      });
      draftLayerRef.current.push(box);
      return;
    }

    if (positions.length >= 2) {
      // line 모드는 두 점을 잇는 직선이므로 절대 닫힌 도형으로 만들지 않는다.
      const shape =
        mode !== 'line' && positions.length >= 3
          ? new window.kakao.maps.Polygon({
              map: mapRef.current,
              path: positions,
              strokeWeight: 3,
              strokeColor: draftColor,
              strokeOpacity: 0.9,
              fillColor: draftColor,
              fillOpacity: 0.2,
            })
          : new window.kakao.maps.Polyline({
              map: mapRef.current,
              path: positions,
              strokeWeight: 3,
              strokeColor: draftColor,
              strokeOpacity: 0.9,
            });
      draftLayerRef.current.push(shape);
    }
  }, [ready, mode, vertices, draftColor, committedLines]);

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

  /**
   * 카카오 장소 검색(kakao.maps.services.Places). SDK를 libraries=services로 불러야
   * 쓸 수 있고(kakaoLoader 참고), 실패해도 지도 자체는 계속 쓸 수 있어야 하므로
   * 검색 실패는 이 영역 안의 안내로만 처리한다.
   */
  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query || !ready) return;

    const services = window.kakao?.maps?.services;
    if (!services?.Places) {
      setSearchResults([]);
      setSearchState('error');
      return;
    }

    setSearchState('searching');
    new services.Places().keywordSearch(query, (data: any[], status: string) => {
      if (status === services.Status.OK) {
        setSearchResults(
          data.slice(0, MAX_SEARCH_RESULTS).map((place) => ({
            id: String(place.id),
            name: String(place.place_name ?? ''),
            address: String(place.road_address_name || place.address_name || ''),
            // Places는 x가 경도, y가 위도다(GeoJSON과 같은 순서, 카카오 지도 API와는 반대).
            lat: Number(place.y),
            lng: Number(place.x),
          }))
        );
        setSearchState('idle');
        return;
      }
      setSearchResults([]);
      setSearchState(status === services.Status.ZERO_RESULT ? 'empty' : 'error');
    });
  }

  function handleSelectPlace(place: PlaceSearchResult) {
    if (!mapRef.current) return;

    const position = new window.kakao.maps.LatLng(place.lat, place.lng);
    mapRef.current.setLevel(SEARCH_RESULT_ZOOM_LEVEL);
    mapRef.current.setCenter(position);

    // 꼭짓점을 찍는 모드에서는 지도만 옮긴다 - 검색 결과가 꼭짓점이 되면 안 된다.
    if (!VERTEX_MODES.includes(mode)) {
      onPick(place.lat, place.lng);
    }
    onPlaceSelected?.(place);

    setSearchResults([]);
    setSearchState('idle');
    setSearchQuery(place.name);
  }

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

  // ⚠️ searchable 값과 무관하게 항상 같은 구조를 돌려준다.
  //
  // 2026-08-14 버그: 검색창이 있을 때만 <div class="space-y-2">로 감싸고 없을 때는
  // 지도 div를 최상위로 돌려줬더니, searchable이 바뀌는 순간(시장 등록 1단계 -> 2단계)
  // React가 같은 자리의 같은 태그(div)를 재사용하면서 바깥 wrapper를 지도 컨테이너로
  // 바꿔버렸다. 그 결과 카카오 지도가 붙어 있던 안쪽 div가 자식째 제거되고 지도가
  // 빈 상자가 됐다(지도 생성 이펙트는 deps가 []라 다시 돌지 않는다).
  // 컨테이너 div의 위치를 고정해 두면 DOM 노드가 그대로 유지된다.
  return (
    <div className="space-y-2">
      {searchable && (
      <form role="search" onSubmit={handleSearch} className="flex gap-2">
        <label htmlFor={searchInputId} className="sr-only">
          장소 검색
        </label>
        <input
          id={searchInputId}
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (searchState !== 'idle') setSearchState('idle');
          }}
          placeholder="시장 이름이나 주소로 찾기 (예: 망원시장)"
          disabled={!ready}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800"
        />
        <button
          type="submit"
          disabled={!ready || searchQuery.trim().length === 0 || searchState === 'searching'}
          className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:focus:ring-offset-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
        >
          {searchState === 'searching' ? '찾는 중' : '검색'}
        </button>
      </form>
      )}

      {searchable && (
      <div aria-live="polite">
        {searchState === 'empty' && (
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            검색 결과가 없습니다. 시장 이름 대신 주소로 찾아보세요.
          </p>
        )}
        {searchState === 'error' && (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            장소를 검색하지 못했습니다. 지도를 직접 움직여 위치를 찾아주세요.
          </p>
        )}
        {searchResults.length > 0 && (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {searchResults.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => handleSelectPlace(place)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 dark:hover:bg-slate-800"
                >
                  <span className="block text-sm text-slate-900 dark:text-slate-100">{place.name}</span>
                  {place.address && (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{place.address}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {mapTypeToggle && (
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="지도 배경" className="flex gap-1">
            {([
              ['ROADMAP', '일반'],
              ['HYBRID', '위성'],
            ] as const).map(([type, label]) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={baseMapType === type}
                onClick={() => setBaseMapType(type)}
                disabled={!ready}
                className={`rounded px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:text-slate-400 ${
                  baseMapType === type
                    ? 'bg-blue-600 font-medium text-white'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showDistrict}
              onChange={(e) => setShowDistrict(e.target.checked)}
              disabled={!ready}
              className="rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600 dark:border-slate-600"
            />
            지적편집도
          </label>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            위성 사진과 필지 경계는 보는 용도입니다. 좌표는 직접 찍어야 합니다.
          </span>
        </div>
      )}

      {/* 이 div의 위치는 searchable과 무관하게 고정이다. 위 블록들은 꺼져 있어도
          자리를 차지하므로(조건부 렌더링은 null을 남긴다) DOM 노드가 교체되지 않는다. */}
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800"
      />
    </div>
  );
}
