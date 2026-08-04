import { useEffect, useRef, useState } from 'react';
import { loadKakaoSdk } from '../utils/kakaoLoader';

// 2026-08-04 추가 (시설 관리 화면 - 상점 위치 등록)
//
// 기존 프로토타입(store-location-prototype.html)의 손그림 SVG 지도 클릭 방식을
// 실제 카카오맵으로 교체함. KakaoMapView.tsx는 시뮬레이션 구역(zones)/에이전트에
// 강하게 엮여 있어 재사용하기보다, SDK 로더만 공유하고 이 화면 전용의 가벼운
// 지도 컴포넌트를 새로 만듦(클릭 → 위경도, 기존 시설 마커 표시 정도만 필요).

export interface FacilityMarkerPoint {
  facilityId: number;
  name: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

interface FacilityLocationPickerProps {
  centerLat: number;
  centerLng: number;
  markers: FacilityMarkerPoint[];
  pickedLat: number | null;
  pickedLng: number | null;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}

export default function FacilityLocationPicker({
  centerLat,
  centerLng,
  markers,
  pickedLat,
  pickedLng,
  onPick,
  height = 420,
}: FacilityLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any[]>([]);
  const pickedMarkerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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
          level: 3,
        });
        mapRef.current = map;

        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          onPickRef.current(latlng.getLat(), latlng.getLng());
        });

        setReady(true);
      })
      .catch((err: Error) => setLoadError(err.message ?? String(err)));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기존 시설 마커(파란 점) 렌더링
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    markerLayerRef.current.forEach((m) => m.setMap(null));
    markerLayerRef.current = markers.map((f) => {
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(f.latitude, f.longitude),
        map: mapRef.current,
        opacity: f.isActive ? 1 : 0.45,
      });
      const infoWindow = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:4px 8px;font-size:12px;white-space:nowrap;">${f.name}</div>`,
      });
      window.kakao.maps.event.addListener(marker, 'mouseover', () => infoWindow.open(mapRef.current, marker));
      window.kakao.maps.event.addListener(marker, 'mouseout', () => infoWindow.close());
      return marker;
    });
  }, [ready, markers]);

  // 클릭/직접입력으로 선택된 위치(빨간 마커) 렌더링
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (pickedMarkerRef.current) {
      pickedMarkerRef.current.setMap(null);
      pickedMarkerRef.current = null;
    }
    if (pickedLat == null || pickedLng == null) return;

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
  }, [ready, pickedLat, pickedLng]);

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
