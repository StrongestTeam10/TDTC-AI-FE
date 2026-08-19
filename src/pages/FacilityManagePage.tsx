import { useEffect, useMemo, useState, type FormEvent } from 'react';
import TabButton from '../components/ui/TabButton';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import FacilityLocationPicker from '../components/FacilityLocationPicker';
import type { SimulationZoneOverlay } from '../components/FacilityLocationPicker';
import MarketObjectEditor from '../components/MarketObjectEditor';
import { useAuthStore } from '../store/authStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import {
  CCTV_ZONE_VERTEX_COUNT,
  geoJsonToVertices,
  verticesToGeoJson,
  type LatLng,
} from '../utils/cctvZonePolygon';
import { snapPointIntoPolygon } from '../utils/polygonGeometry';
import type { Market, Zone } from '../types';
import {
  fetchMarkets,
  fetchZones,
  fetchFacilities,
  createFacility,
  updateFacility,
  deleteFacility,
  previewFacilityPhotoExif,
  saveFacilityPhoto,
  fetchFacilityPhotos,
  deleteFacilityPhoto,
  fetchCctvZones,
  createCctvZone,
  updateCctvZone,
  deleteCctvZone,
} from '../api/client';
import type { Facility, FacilityPhoto, CctvZone } from '../api/client';
import type { PageResponse } from '../types/board';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// 2026-08-04 추가 (상점 위치 등록 화면). 08-11 대상 선택기/CCTV 구역 추가.
//
// 2026-08-11(2차) 변경:
//   - CCTV 구역을 고정 1~4가 아니라 "등록마다 추가"되는 단일 항목으로 바꿈.
//     각 CCTV 구역은 소속 시뮬레이션 구역(zone_id)에 붙고, 그 구역 폴리곤 안에서만
//     4점을 찍을 수 있다(밖으로 나가는 점/변은 거부).
//   - 하단 목록에 게시판식 페이징 추가(CCTV는 서버 페이징, 시설은 클라이언트 페이징 —
//     지도가 전체 마커를 필요로 해 시설은 전량을 받아두고 목록만 잘라 보여줌).
//   - CCTV 사용/미사용, 출입구 개방/폐쇄(둘 다 is_active) 노출.
//
// ⚠️ CCTV 구역(mrkcctv01m)은 시뮬레이션 구역(mrkaddr01d)과 별개 테이블이다. 여기서
// 등록해도 시뮬레이션 비교 화면/SIM 계산에는 영향이 없다(자세한 이유는 BE 주석 참고).

// 2026-08-11: 출입구(GATE)를 대상 선택기에서 제거하고 '시장 오브젝트'로 흡수(그 안에서
// 하위 종류로 다룸). 타입에는 'GATE'를 남겨둔다 - 상점 폼이 GATE와 마크업을 공유해
// targetKind === 'GATE' 비교가 여러 곳에 있는데, 지금은 GATE를 고를 수 없어 도달하지
// 않을 뿐 타입은 유효해야 하기 때문(상점 전용으로 정리하는 건 UIUX 세부 단계에서).
type TargetKind = 'GATE' | 'STALL' | 'CCTV_ZONE' | 'MARKET_OBJECT';

const TARGET_OPTIONS: { key: TargetKind; label: string }[] = [
  { key: 'STALL', label: '상점' },
  { key: 'CCTV_ZONE', label: 'CCTV 구역' },
  { key: 'MARKET_OBJECT', label: '시장 오브젝트' },
];

// 상점으로 등록할 수 있는 업종. 출입구(GATE)는 대상 선택기에서 이미 갈라진다.
const STALL_TYPE_OPTIONS = [
  { value: 'STALL', label: '상점 (일반 점포)' },
  { value: 'RESTAURANT', label: '음식점' },
  { value: 'RESTROOM', label: '화장실' },
  { value: 'OTHER', label: '기타 시설' },
];

const ALL_FACILITY_TYPE_LABELS: Record<string, string> = {
  STALL: '상점 (일반 점포)',
  RESTAURANT: '음식점',
  RESTROOM: '화장실',
  GATE: '출입구',
  OTHER: '기타 시설',
};

const DIRECTION_OPTIONS = [
  { value: 'DIRNO', label: '북' },
  { value: 'DIREA', label: '동' },
  { value: 'DIRSO', label: '남' },
  { value: 'DIRWE', label: '서' },
];

const PAGE_SIZE = 10;

/** "전체"를 뜻하는 필터 내부값. 실제 코드값과 겹치지 않게 'all'을 쓴다. */
const ALL_FILTER = 'all';

function facilityTypeLabel(value: string): string {
  return ALL_FACILITY_TYPE_LABELS[value] ?? value;
}

function directionLabel(value: string): string {
  return DIRECTION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

const emptyForm = {
  name: '',
  facilityType: 'STALL',
  rmk: '',
  isActive: true,
};

/** 게시판과 같은 번호 페이저. 총 페이지가 2개 이상일 때만 보인다. */
function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-1">
      {Array.from({ length: totalPages }, (_, i) => i).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`h-8 w-8 rounded text-sm ${
            p === page
              ? 'bg-blue-600 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {p + 1}
        </button>
      ))}
    </div>
  );
}

export default function FacilityManagePage() {
  useDocumentTitle('시장 구조 등록');
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<number | undefined>(undefined);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  // 참고/제약용 시뮬레이션 구역(mrkaddr01d).
  const [simulationZones, setSimulationZones] = useState<Zone[]>([]);
  const [showSimulationZones, setShowSimulationZones] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ---- 등록 대상 ----
  const [targetKind, setTargetKind] = useState<TargetKind>('STALL');
  const isCctvZoneTarget = targetKind === 'CCTV_ZONE';

  // ---- 시설(출입구/상점) 폼 ----
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const [facilityPage, setFacilityPage] = useState(0);
  // 상점 목록 이름 검색(상점 대상에서만 노출). stallSearchInput은 입력 중인 값,
  // stallSearch는 검색 버튼(또는 Enter)을 눌러야 반영되는 실제 적용값이다 -
  // 타이핑마다 즉시 필터링하면 원치 않는다는 피드백에 따라 분리함.
  const [stallSearchInput, setStallSearchInput] = useState('');
  const [stallSearch, setStallSearch] = useState('');
  // 2026-08-12 추가: 상점 목록 업종/상태 필터. 검색어와 달리 고르는 즉시 반영된다
  // (드롭다운은 고르는 행위 자체가 확정이라, 따로 "적용"을 누르게 하면 번거롭다).
  const [stallTypeFilter, setStallTypeFilter] = useState<string>(ALL_FILTER);
  const [stallActiveFilter, setStallActiveFilter] = useState<'all' | 'active' | 'inactive'>(ALL_FILTER);
  // "선택 구역으로 이동" 버튼: 값이 바뀌면 지도가 소속 구역에 다시 맞춰진다.
  const [refitToken, setRefitToken] = useState(0);

  // ---- CCTV 구역 폼 ----
  const [editingCctvZoneId, setEditingCctvZoneId] = useState<number | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | undefined>(undefined);
  const [vertices, setVertices] = useState<LatLng[]>([]);
  const [cctvIsActive, setCctvIsActive] = useState(true);
  const [cctvRmk, setCctvRmk] = useState('');
  const [cctvPageData, setCctvPageData] = useState<PageResponse<CctvZone> | null>(null);
  const [cctvPage, setCctvPage] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ---- 사진 관리 ----
  const [photoTarget, setPhotoTarget] = useState<Facility | null>(null);
  const [photos, setPhotos] = useState<FacilityPhoto[]>([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // 사진을 상자 위로 끌어왔는지. 테두리를 강조해 여기에 놓으면 된다는 걸 알린다.
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [photoDirection, setPhotoDirection] = useState('DIRNO');
  const [photoLat, setPhotoLat] = useState('');
  const [photoLng, setPhotoLng] = useState('');
  const [photoExifNote, setPhotoExifNote] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const loadMarkets = () => {
    fetchMarkets()
      .then((list) => {
        setMarkets(list);
        setSelectedMarketId((prev) => prev ?? list[0]?.marketId);
      })
      .catch((err) => setLoadError(toDisplayErrorMessage(err, '시장 목록을 불러오지 못했습니다.')));
  };

  useEffect(loadMarkets, []);

  // 시설 + 시뮬레이션 구역: 지도가 전량을 필요로 해 한 번에 전부 받는다.
  const loadStaticData = () => {
    if (selectedMarketId === undefined) return;
    setIsLoading(true);
    setLoadError('');
    Promise.allSettled([fetchFacilities(selectedMarketId), fetchZones(selectedMarketId)])
      .then(([facilityResult, simZoneResult]) => {
        if (facilityResult.status === 'fulfilled') setFacilities(facilityResult.value);
        setSimulationZones(simZoneResult.status === 'fulfilled' ? simZoneResult.value : []);
        if (facilityResult.status === 'rejected') {
          setLoadError(toDisplayErrorMessage(facilityResult.reason, '시설 목록을 불러오지 못했습니다.'));
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(loadStaticData, [selectedMarketId]);

  // CCTV 구역: 등록마다 늘어나므로 서버 페이징으로 따로 받는다.
  const loadCctvZones = () => {
    if (selectedMarketId === undefined) return;
    fetchCctvZones(selectedMarketId, cctvPage, PAGE_SIZE)
      .then(setCctvPageData)
      .catch((err) => {
        // 목록 조회 실패는 배너 대신 폼 영역에서 조용히 처리(권한/네트워크).
        console.error('CCTV 구역 목록 로드 실패', err);
        setCctvPageData(null);
      });
  };

  useEffect(loadCctvZones, [selectedMarketId, cctvPage]);

  const selectedMarket = markets.find((m) => m.marketId === selectedMarketId);

  // 소속 구역 기본값: 시뮬레이션 구역이 로드되면 첫 구역을 잡아둔다.
  useEffect(() => {
    if (selectedZoneId === undefined && simulationZones.length > 0) {
      setSelectedZoneId(simulationZones[0].zoneId);
    }
  }, [simulationZones, selectedZoneId]);

  // 대상(상점/출입구/CCTV)이나 시장이 바뀌면 편집 상태와 페이지를 초기화한다.
  //
  // 2026-08-14: 여기에 selectedMarketId가 빠져 있어서, 시장을 바꿔도 이전 시장에 매인
  // 상태가 그대로 남았다. 특히 selectedZoneId(CCTV 구역의 소속 구역)는 아래 기본값
  // 지정 이펙트가 "undefined일 때만" 채우기 때문에, 한 번 정해지면 시장이 바뀌어도
  // 옛 시장의 zone_id를 계속 들고 있었다. 페이지 번호도 남아서 새 시장에서 빈 목록이
  // 보이곤 했다.
  useEffect(() => {
    setEditingId(null);
    setEditingCctvZoneId(null);
    setFormError('');
    setPickedLat(null);
    setPickedLng(null);
    setVertices([]);
    setFacilityPage(0);
    setCctvPage(0);
    setSelectedZoneId(undefined);
    setStallSearchInput('');
    setStallSearch('');
    setForm({ ...emptyForm, facilityType: targetKind === 'GATE' ? 'GATE' : 'STALL' });
  }, [targetKind, selectedMarketId]);

  // 선택한 소속 구역의 폴리곤([위도,경도]). CCTV 4점이 이 안에만 있어야 한다.
  const constraintVertices: LatLng[] = useMemo(() => {
    const zone = simulationZones.find((z) => z.zoneId === selectedZoneId);
    return zone ? geoJsonToVertices(zone.polygonCoordinates) : [];
  }, [simulationZones, selectedZoneId]);

  function resetFacilityForm() {
    setEditingId(null);
    setForm({ ...emptyForm, facilityType: targetKind === 'GATE' ? 'GATE' : 'STALL' });
    setPickedLat(null);
    setPickedLng(null);
    setFormError('');
  }

  function resetCctvForm() {
    setEditingCctvZoneId(null);
    setVertices([]);
    setCctvIsActive(true);
    setCctvRmk('');
    setFormError('');
  }

  function startEditFacility(facility: Facility) {
    setEditingId(facility.facilityId);
    setForm({
      name: facility.name,
      facilityType: facility.facilityType,
      rmk: facility.rmk ?? '',
      isActive: facility.isActive,
    });
    setPickedLat(facility.latitude);
    setPickedLng(facility.longitude);
    setFormError('');
  }

  function startEditCctvZone(zone: CctvZone) {
    setEditingCctvZoneId(zone.cctvZoneId);
    setSelectedZoneId(zone.zoneId);
    setVertices(geoJsonToVertices(zone.polygonCoordinates));
    setCctvIsActive(zone.isActive);
    setCctvRmk(zone.rmk ?? '');
    setFormError('');
  }

  // 지도 클릭 → CCTV 꼭짓점 추가.
  // 소속 구역 밖을 찍거나, 직전 점과 잇는 선이 구역 밖으로 새면 "선택 불가"로 막지 않고
  // 구역 안쪽 점(선은 경계에서 멈추는 지점)으로 대신 찍어준다.
  function handleAddVertex(lat: number, lng: number) {
    if (constraintVertices.length < 3) {
      setFormError('먼저 소속 시뮬레이션 구역을 선택해주세요.');
      return;
    }
    if (vertices.length >= CCTV_ZONE_VERTEX_COUNT) {
      setFormError('꼭짓점 4개를 이미 다 찍었습니다. 지우고 다시 그려주세요.');
      return;
    }

    // 클릭한 위치 그대로 찍는다(안이면 그대로, 밖이면 가장 가까운 경계 안쪽으로만 최소
    // 이동). 클릭 순서대로 4점이 사각형 꼭짓점이 된다. 점을 잇는 선의 구역 이탈은
    // 강제하지 않는다 - 강제하면 찍은 위치가 다른 곳으로 옮겨져 원하는 사각형이 안 나온다.
    const point = snapPointIntoPolygon([lat, lng], constraintVertices);

    setFormError('');
    setVertices([...vertices, point]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    if (selectedMarketId === undefined) {
      setFormError('시장을 먼저 선택해주세요.');
      return;
    }

    if (isCctvZoneTarget) {
      if (selectedZoneId === undefined) {
        setFormError('소속 시뮬레이션 구역을 선택해주세요.');
        return;
      }
      if (vertices.length !== CCTV_ZONE_VERTEX_COUNT) {
        setFormError(`지도에서 꼭짓점 ${CCTV_ZONE_VERTEX_COUNT}개를 찍어주세요. (현재 ${vertices.length}개)`);
        return;
      }

      setIsSaving(true);
      try {
        const payload = {
          marketId: selectedMarketId,
          zoneId: selectedZoneId,
          polygonCoordinates: verticesToGeoJson(vertices),
          isActive: cctvIsActive,
          rmk: cctvRmk.trim() || undefined,
        };
        if (editingCctvZoneId) {
          await updateCctvZone(editingCctvZoneId, payload);
        } else {
          await createCctvZone(payload);
        }
        resetCctvForm();
        // 최신 순 정렬이라 새로 추가한 항목을 보려면 첫 페이지로.
        if (cctvPage === 0) loadCctvZones();
        else setCctvPage(0);
      } catch (err) {
        setFormError(toDisplayErrorMessage(err, '구역 저장에 실패했습니다.'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // 출입구 / 상점
    if (pickedLat == null || pickedLng == null) {
      setFormError('지도를 클릭해서 위치를 지정해주세요.');
      return;
    }
    if (!form.name.trim()) {
      setFormError(targetKind === 'GATE' ? '출입구 이름을 입력해주세요.' : '상점명을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        facilityType: targetKind === 'GATE' ? 'GATE' : form.facilityType,
        name: form.name.trim(),
        latitude: pickedLat,
        longitude: pickedLng,
        // 출입구는 is_active를 개방/폐쇄로, 상점은 영업/휴업으로 쓴다.
        isActive: form.isActive,
        rmk: form.rmk.trim() || undefined,
      };
      if (editingId) {
        await updateFacility(editingId, payload);
      } else {
        await createFacility({ marketId: selectedMarketId, ...payload });
      }
      resetFacilityForm();
      loadStaticData();
    } catch (err) {
      setFormError(toDisplayErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteFacility(facility: Facility) {
    if (!window.confirm(`"${facility.name}"을(를) 삭제할까요? 등록된 사진도 함께 삭제됩니다.`)) return;
    try {
      await deleteFacility(facility.facilityId);
      if (editingId === facility.facilityId) resetFacilityForm();
      if (photoTarget?.facilityId === facility.facilityId) setPhotoTarget(null);
      loadStaticData();
    } catch (err) {
      setLoadError(toDisplayErrorMessage(err, '삭제에 실패했습니다.'));
    }
  }

  async function handleDeleteCctvZone(zone: CctvZone) {
    if (!window.confirm(`"${zone.zoneName}" 구역의 CCTV 좌표를 삭제할까요?`)) return;
    try {
      await deleteCctvZone(zone.cctvZoneId);
      if (editingCctvZoneId === zone.cctvZoneId) resetCctvForm();
      loadCctvZones();
    } catch (err) {
      setFormError(toDisplayErrorMessage(err, '구역 삭제에 실패했습니다.'));
    }
  }

  // ---- 사진 관리 ----
  function openPhotoPanel(facility: Facility) {
    setPhotoTarget(facility);
    setPhotoFile(null);
    setPhotoDirection('DIRNO');
    setPhotoLat(String(facility.latitude));
    setPhotoLng(String(facility.longitude));
    setPhotoExifNote('');
    setPhotoError('');
    setIsPhotosLoading(true);
    fetchFacilityPhotos(facility.facilityId)
      .then(setPhotos)
      .catch((err) => setPhotoError(toDisplayErrorMessage(err, '사진 목록을 불러오지 못했습니다.')))
      .finally(() => setIsPhotosLoading(false));
  }

  async function handlePhotoFileChange(file: File | null) {
    setPhotoFile(file);
    setPhotoExifNote('');
    if (!file || !photoTarget) return;
    try {
      const preview = await previewFacilityPhotoExif(photoTarget.facilityId, file);
      if (preview.hasGps && preview.exifLatitude != null && preview.exifLongitude != null) {
        setPhotoLat(String(preview.exifLatitude));
        setPhotoLng(String(preview.exifLongitude));
        setPhotoExifNote('사진에서 GPS 정보를 찾았습니다. 필요하면 아래 좌표를 직접 보정해주세요.');
      } else {
        setPhotoExifNote('사진에 GPS 정보가 없습니다. 좌표를 직접 입력해주세요(기본값: 시설 좌표).');
      }
    } catch (err) {
      setPhotoError(toDisplayErrorMessage(err, 'EXIF 정보를 확인하지 못했습니다.'));
    }
  }

  async function handlePhotoUpload() {
    if (!photoTarget || !photoFile) return;
    const lat = Number(photoLat);
    const lng = Number(photoLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setPhotoError('좌표 값이 올바르지 않습니다.');
      return;
    }
    setIsUploadingPhoto(true);
    setPhotoError('');
    try {
      await saveFacilityPhoto(photoTarget.facilityId, photoFile, photoDirection, lat, lng);
      setPhotoFile(null);
      setPhotoExifNote('');
      const refreshedPhotos = await fetchFacilityPhotos(photoTarget.facilityId);
      setPhotos(refreshedPhotos);
      loadStaticData();
    } catch (err) {
      setPhotoError(toDisplayErrorMessage(err, '사진 저장에 실패했습니다.'));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handlePhotoDelete(photoId: number) {
    if (!photoTarget) return;
    if (!window.confirm('이 사진을 삭제할까요?')) return;
    try {
      await deleteFacilityPhoto(photoTarget.facilityId, photoId);
      setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
      loadStaticData();
    } catch (err) {
      setPhotoError(toDisplayErrorMessage(err, '사진 삭제에 실패했습니다.'));
    }
  }

  // ---- 지도에 넘길 데이터 ----
  // 지도 마커는 검색과 무관하게 대상 전체를 보여준다(검색은 하단 목록에만 적용).
  const visibleFacilities = useMemo(() => {
    if (targetKind === 'GATE') return facilities.filter((f) => f.facilityType === 'GATE');
    if (targetKind === 'STALL') return facilities.filter((f) => f.facilityType !== 'GATE');
    return [];
  }, [facilities, targetKind]);

  // 하단 목록용: 상점 대상이면 이름 검색어 + 업종/상태 필터로 거른다.
  //
  // 2026-08-12 추가 (UIUX 피드백 "2. 필터링 추가"): 등록 건수가 87개까지 늘면서
  // 이름을 모르는 채로 "화장실만" 또는 "폐쇄된 출입구만" 찾는 일이 생겼는데, 그때
  // 쓸 수 있는 것이 이름 검색뿐이라 페이지를 넘겨가며 눈으로 훑어야 했다.
  // 서버가 아니라 여기서 거르는 이유: 지도가 어차피 전량을 필요로 해서 이미 다
  // 받아둔 상태다(visibleFacilities). 목록만 잘라 보여주면 된다.
  const listFacilities = useMemo(() => {
    if (targetKind !== 'STALL') return visibleFacilities;
    const q = stallSearch.trim().toLowerCase();
    return visibleFacilities.filter((f) => {
      if (q && !f.name.toLowerCase().includes(q)) return false;
      if (stallTypeFilter !== ALL_FILTER && f.facilityType !== stallTypeFilter) return false;
      if (stallActiveFilter !== ALL_FILTER && f.isActive !== (stallActiveFilter === 'active')) return false;
      return true;
    });
  }, [visibleFacilities, targetKind, stallSearch, stallTypeFilter, stallActiveFilter]);

  // 검색어나 필터가 바뀌면 첫 페이지로 되돌린다. 3페이지를 보던 중에 조건을 좁히면
  // 결과가 1페이지뿐이라 빈 화면이 남는다.
  useEffect(() => {
    setFacilityPage(0);
  }, [stallSearch, stallTypeFilter, stallActiveFilter, targetKind]);

  const hasStallFilter =
    stallSearch.trim().length > 0 || stallTypeFilter !== ALL_FILTER || stallActiveFilter !== ALL_FILTER;

  const resetStallFilters = () => {
    setStallSearchInput('');
    setStallSearch('');
    setStallTypeFilter(ALL_FILTER);
    setStallActiveFilter(ALL_FILTER);
  };

  // 시설 목록은 클라이언트 페이징(지도는 전량을 쓰고, 표만 잘라 보여줌).
  const facilityTotalPages = Math.max(1, Math.ceil(listFacilities.length / PAGE_SIZE));
  const pagedFacilities = useMemo(
    () => listFacilities.slice(facilityPage * PAGE_SIZE, facilityPage * PAGE_SIZE + PAGE_SIZE),
    [listFacilities, facilityPage]
  );

  const mapMarkers = visibleFacilities
    .filter((f) => f.facilityId !== editingId)
    .map((f) => ({
      facilityId: f.facilityId,
      name: f.name,
      latitude: f.latitude,
      longitude: f.longitude,
      isActive: f.isActive,
    }));

  // 시뮬레이션 구역 배경. CCTV 대상이고 토글이 켜졌을 때, 선택한 소속 구역은 파란
  // 강조(constraintPolygon)로 따로 그리므로 여기선 나머지만 회색 점선으로 깐다.
  const simulationZoneOverlays: SimulationZoneOverlay[] = useMemo(() => {
    if (!isCctvZoneTarget || !showSimulationZones) return [];
    return simulationZones
      .filter((z) => z.zoneId !== selectedZoneId)
      .map((z) => ({
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        vertices: geoJsonToVertices(z.polygonCoordinates),
      }));
  }, [simulationZones, isCctvZoneTarget, showSimulationZones, selectedZoneId]);

  const cctvZones = cctvPageData?.content ?? [];

  // 시장/대상 전환용 공통 UI. 시장 오브젝트 화면(아래 early return)과 기존 화면이 함께 쓴다.
  const marketTabs = isAdmin && markets.length > 0 && (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
      {markets.map((m) => (
        <TabButton
          key={m.marketId}
          active={selectedMarketId === m.marketId}
          onClick={() => {
            setSelectedMarketId(m.marketId);
            setSelectedZoneId(undefined);
            setCctvPage(0);
            resetFacilityForm();
            resetCctvForm();
            setPhotoTarget(null);
          }}
          small
        >
          {m.marketName}
        </TabButton>
      ))}
    </div>
  );

  const targetSelector = (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <label
        htmlFor="target-select-top"
        className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        등록 대상
      </label>
      <select
        id="target-select-top"
        value={targetKind}
        onChange={(e) => setTargetKind(e.target.value as TargetKind)}
        className="w-full max-w-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
      >
        {TARGET_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  // 시장 오브젝트 대상: 출입구 + 오브젝트 배치 + 통로 정책을 별도 편집기로 다룬다
  // (기존 상점/CCTV 화면과 로직이 완전히 달라 early return으로 분리).
  if (targetKind === 'MARKET_OBJECT') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">시장 구조 등록</h1>
        </div>
        {marketTabs}
        {targetSelector}
        <p className="text-xs text-slate-500">
          출입구·오브젝트 배치·통로 제어 정책을 등록합니다. 시뮬레이션 비교의 초기 배치로 쓰이며,
          before/after 모두 이 배치로 시작합니다.
        </p>
        {loadError && <ErrorBanner message={loadError} onRetry={loadStaticData} />}
        {selectedMarket && selectedMarketId !== undefined ? (
          // 2026-08-14: key에 marketId를 넣어 시장이 바뀌면 통째로 새로 만든다.
          // 카카오 지도는 최초 생성 때의 중심 좌표를 쓰고 이후 prop 변경에 반응하지 않아서,
          // key가 없으면 시장을 바꿔도 지도가 이전 시장 자리에 그대로 머문다.
          <MarketObjectEditor
            key={selectedMarketId}
            marketId={selectedMarketId}
            centerLat={selectedMarket.latitude}
            centerLng={selectedMarket.longitude}
          />
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">시장을 선택해주세요.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 2026-08-12 추가 (UIUX 피드백): 제목만 있고 이 화면이 무엇을 하는 곳인지
          설명이 없었다(시나리오 이력에는 있는데 여기와 게시판에는 없다는 지적).
          등록 대상에 따라 하는 일이 달라서 문구도 대상별로 바꾼다. */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">시장 구조 등록</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isCctvZoneTarget
            ? '시뮬레이션 구역 안에 CCTV가 실제로 비추는 범위를 꼭짓점으로 등록합니다. 관제 대시보드의 분석 대상 구역이 됩니다.'
            : '지도를 클릭해 상점·출입구 위치를 등록하고 외관 사진을 관리합니다. 등록한 위치는 시뮬레이션의 건물·통행 계산에 쓰입니다.'}
        </p>
      </div>

      {isAdmin && markets.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {markets.map((m) => (
            <TabButton
              key={m.marketId}
              active={selectedMarketId === m.marketId}
              onClick={() => {
                setSelectedMarketId(m.marketId);
                setSelectedZoneId(undefined);
                setCctvPage(0);
                resetFacilityForm();
                resetCctvForm();
                setPhotoTarget(null);
              }}
              small
            >
              {m.marketName}
            </TabButton>
          ))}
        </div>
      )}

      {loadError && <ErrorBanner message={loadError} onRetry={loadStaticData} />}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* 지도 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            📍 지도에서 위치 클릭
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            {isCctvZoneTarget
              ? `소속 구역(파란 영역) 안에서만 꼭짓점 ${CCTV_ZONE_VERTEX_COUNT}개를 순서대로 찍습니다. 구역 밖을 찍으면 가장 가까운 안쪽 지점으로 대신 찍힙니다.`
              : '지도를 클릭하면 위경도가 자동으로 입력됩니다. 마커를 클릭하면 해당 항목 수정으로 들어갑니다. 빨간 마커는 지금 선택한 위치입니다.'}
          </p>

          {isCctvZoneTarget && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {constraintVertices.length >= 3 && (
                <button
                  type="button"
                  onClick={() => setRefitToken((t) => t + 1)}
                  className="rounded border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                >
                  🎯 선택 구역으로 이동
                </button>
              )}
              {simulationZones.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={showSimulationZones}
                    onChange={(e) => setShowSimulationZones(e.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-500" />
                    다른 시뮬레이션 구역도 참고로 표시
                  </span>
                </label>
              )}
            </div>
          )}

          {selectedMarket && (
            // 2026-08-12 (UIUX 피드백 "더 확대가 안돼 아쉬어요"): 확대 배율 자체는 이미
            // 카카오 로드맵의 상한(레벨 1, 축척 20m)까지 열려 있어서 더 당길 수가 없다
            // (FacilityLocationPicker의 setMinLevel(1) 참고 - API가 그 아래를 지원하지 않음).
            // 같은 배율에서 더 넓게 보이도록 지도 높이를 420 -> 560으로 키웠다.
            <FacilityLocationPicker
              // 2026-08-14: 시장이 바뀌면 지도를 새로 만든다. 카카오 지도는 최초 생성 때의
              // 중심 좌표만 쓰고 이후 prop 변경을 무시해서, key가 없으면 시장을 바꿔도
              // 이전 시장 자리에 머문 채 새 시장의 마커만 화면 밖에 찍힌다.
              key={selectedMarketId}
              height={560}
              centerLat={selectedMarket.latitude}
              centerLng={selectedMarket.longitude}
              markers={mapMarkers}
              pickedLat={pickedLat}
              pickedLng={pickedLng}
              onPick={(lat, lng) => {
                setPickedLat(lat);
                setPickedLng(lng);
              }}
              mode={isCctvZoneTarget ? 'rectangle' : 'point'}
              vertices={vertices}
              onAddVertex={handleAddVertex}
              simulationZones={simulationZoneOverlays}
              constraintPolygon={isCctvZoneTarget ? constraintVertices : undefined}
              refitToken={refitToken}
              onMarkerClick={
                isCctvZoneTarget
                  ? undefined
                  : (facilityId) => {
                      const f = facilities.find((x) => x.facilityId === facilityId);
                      if (f) startEditFacility(f);
                    }
              }
            />
          )}
        </section>

        {/* 등록/수정 폼 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isCctvZoneTarget
              ? editingCctvZoneId
                ? '✏️ CCTV 구역 좌표 수정'
                : '🎯 CCTV 구역 좌표 등록'
              : editingId
                ? `✏️ ${targetKind === 'GATE' ? '출입구' : '상점'} 정보 수정`
                : `📝 ${targetKind === 'GATE' ? '출입구' : '상점'} 정보 입력`}
          </h2>

          {/* 등록 대상 선택기 */}
          <div className="mb-4 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <label
              htmlFor="target-select"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              등록 대상
            </label>
            <select
              id="target-select"
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value as TargetKind)}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {TARGET_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {isCctvZoneTarget
                ? 'CCTV 분석용 구역입니다. 시뮬레이션 구역과 별도로 저장되며, 등록할 때마다 목록에 추가됩니다.'
                : '선택한 대상만 지도와 아래 목록에 표시됩니다.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isCctvZoneTarget ? (
              <>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
                    소속 시뮬레이션 구역
                  </label>
                  <select
                    value={selectedZoneId ?? ''}
                    onChange={(e) => {
                      const nextZoneId = Number(e.target.value);
                      setSelectedZoneId(nextZoneId);
                      // 구역을 바꾸면 이전 구역 기준으로 찍은 점은 무효라 비운다.
                      setVertices([]);
                      setFormError('');
                    }}
                    disabled={simulationZones.length === 0}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  >
                    {simulationZones.length === 0 && <option value="">시뮬레이션 구역 없음</option>}
                    {simulationZones.map((z) => (
                      <option key={z.zoneId} value={z.zoneId}>
                        {z.zoneName}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    선택한 구역(지도의 파란 영역) 안에서만 좌표를 찍을 수 있습니다.
                  </p>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm text-slate-600 dark:text-slate-400">
                      꼭짓점 좌표
                      <span className="ml-1.5 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                        {vertices.length} / {CCTV_ZONE_VERTEX_COUNT}
                      </span>
                    </label>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setVertices((prev) => prev.slice(0, -1));
                          setFormError('');
                        }}
                        disabled={vertices.length === 0}
                        className="text-slate-600 dark:text-slate-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        마지막 점 취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVertices([]);
                          setFormError('');
                        }}
                        disabled={vertices.length === 0}
                        className="text-red-600 dark:text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        모두 지우기
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2">
                    {Array.from({ length: CCTV_ZONE_VERTEX_COUNT }).map((_, index) => {
                      const vertex = vertices[index];
                      return (
                        <div key={index} className="flex items-center gap-2 text-xs">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-300 dark:bg-slate-700 font-medium text-slate-700 dark:text-slate-300">
                            {index + 1}
                          </span>
                          <span
                            className={`font-mono ${
                              vertex ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'
                            }`}
                          >
                            {vertex
                              ? `${vertex[0].toFixed(8)}, ${vertex[1].toFixed(8)}`
                              : '지도를 클릭하세요'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
                    저장될 JSON (GeoJSON Polygon)
                  </label>
                  <textarea
                    readOnly
                    value={vertices.length > 0 ? verticesToGeoJson(vertices) : ''}
                    placeholder="꼭짓점을 찍으면 저장될 값이 여기에 표시됩니다."
                    rows={4}
                    className="w-full resize-y rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={cctvIsActive}
                    onChange={(e) => setCctvIsActive(e.target.checked)}
                  />
                  CCTV 사용
                </label>

                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">비고</label>
                  <textarea
                    value={cctvRmk}
                    onChange={(e) => setCctvRmk(e.target.value)}
                    placeholder="예: 남측 입구 카메라 화각 기준"
                    rows={2}
                    className="w-full resize-y rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
                    {targetKind === 'GATE' ? '출입구 이름' : '상점명'}
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={targetKind === 'GATE' ? '예: 남문 출입구' : '예: 원조 떡볶이'}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {targetKind === 'STALL' && (
                  <div>
                    <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
                      업종 / 시설유형
                    </label>
                    <select
                      value={form.facilityType}
                      onChange={(e) => setForm((f) => ({ ...f, facilityType: e.target.value }))}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {STALL_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">위도</label>
                    <input
                      readOnly
                      value={pickedLat ?? ''}
                      placeholder="지도를 클릭하세요"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">경도</label>
                    <input
                      readOnly
                      value={pickedLng ?? ''}
                      placeholder="지도를 클릭하세요"
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
                    비고 (층/위치 메모 등)
                  </label>
                  <textarea
                    value={form.rmk}
                    onChange={(e) => setForm((f) => ({ ...f, rmk: e.target.value }))}
                    placeholder="예: 1층, 중앙통로 옆 / 그 외 추가로 남길 내용"
                    rows={3}
                    className="w-full resize-y rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* 출입구는 개방/폐쇄, 상점은 영업중 - 둘 다 is_active를 쓴다. */}
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  {targetKind === 'GATE' ? '개방 (체크 해제 시 폐쇄)' : '영업중'}
                </label>
              </>
            )}

            {formError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving
                  ? '저장 중...'
                  : isCctvZoneTarget
                    ? editingCctvZoneId
                      ? '수정 완료'
                      : '+ CCTV 구역 추가'
                    : editingId
                      ? '수정 완료'
                      : `+ ${targetKind === 'GATE' ? '출입구' : '상점'} 등록하기`}
              </button>
              {isCctvZoneTarget && editingCctvZoneId && (
                <button
                  type="button"
                  onClick={resetCctvForm}
                  className="rounded border border-slate-300 dark:border-slate-700 px-4 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  취소
                </button>
              )}
              {!isCctvZoneTarget && editingId && (
                <button
                  type="button"
                  onClick={resetFacilityForm}
                  className="rounded border border-slate-300 dark:border-slate-700 px-4 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {/* 등록 목록 */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {isCctvZoneTarget ? '📋 등록된 CCTV 구역' : `📋 등록된 ${targetKind === 'GATE' ? '출입구' : '상점'} 목록`}
          <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-blue-500/10 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
            {isCctvZoneTarget
              ? `${cctvPageData?.totalElements ?? 0}개`
              : `${visibleFacilities.length}개`}
          </span>
          {/* "수정" 버튼을 없애고 행 클릭으로 바꾼 뒤로는, 누를 수 있다는 사실이
              생김새만으로는 드러나지 않는다(커서 모양은 올려봐야 안다). 한 줄로 적어둔다. */}
          {!isCctvZoneTarget && (
            <span className="font-normal text-xs text-slate-500">
              — 행을 클릭하면 수정할 수 있어요
            </span>
          )}
        </h2>

        {/* 상점 목록 이름 검색 + 업종/상태 필터(상점 대상에서만).
            검색어는 검색 버튼(또는 Enter)을 눌러야 반영되고, 드롭다운은 고르는 즉시
            반영된다 - 고르는 행위 자체가 확정이라 한 번 더 누르게 할 이유가 없다. */}
        {targetKind === 'STALL' && visibleFacilities.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={stallSearchInput}
              onChange={(e) => setStallSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setStallSearch(stallSearchInput);
              }}
              placeholder="상점 이름으로 검색"
              className="w-full max-w-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="button"
              onClick={() => setStallSearch(stallSearchInput)}
              className="shrink-0 rounded bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500"
            >
              검색
            </button>

            <select
              aria-label="업종 필터"
              value={stallTypeFilter}
              onChange={(e) => setStallTypeFilter(e.target.value)}
              className="shrink-0 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value={ALL_FILTER}>업종 전체</option>
              {/* 목록에는 출입구(GATE)도 섞여 있다 - 대상 선택기에서 빠졌을 뿐
                  이미 등록된 행은 그대로 남아 있어서, 필터 선택지에도 넣어야 고를 수 있다. */}
              {Object.entries(ALL_FACILITY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              aria-label="영업 상태 필터"
              value={stallActiveFilter}
              onChange={(e) => setStallActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="shrink-0 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value={ALL_FILTER}>상태 전체</option>
              <option value="active">영업중</option>
              <option value="inactive">미영업</option>
            </select>

            {/* 조건이 세 개라 0건이 나왔을 때 어느 것 때문인지 알기 어렵다. 한 번에
                모두 푸는 버튼을 두되, 지울 것이 없으면 잠가서 줄이 흔들리지 않게 한다. */}
            <button
              type="button"
              onClick={resetStallFilters}
              disabled={!hasStallFilter}
              className="shrink-0 rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              필터 초기화
            </button>

            <span className="ml-auto shrink-0 text-xs text-slate-500">
              {hasStallFilter
                ? `${listFacilities.length}건 / 전체 ${visibleFacilities.length}건`
                : `전체 ${visibleFacilities.length}건`}
            </span>
          </div>
        )}

        {isCctvZoneTarget ? (
          cctvZones.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              아직 등록된 CCTV 구역이 없어요. 소속 구역을 고르고 지도에서 꼭짓점 4개를 찍어 추가해보세요.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">소속 구역</th>
                      <th className="whitespace-nowrap px-3 py-2">꼭짓점</th>
                      <th className="whitespace-nowrap px-3 py-2">CCTV 사용</th>
                      <th className="px-3 py-2">비고</th>
                      <th className="whitespace-nowrap px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cctvZones.map((z) => {
                      const zoneVertices = geoJsonToVertices(z.polygonCoordinates);
                      return (
                        <tr key={z.cctvZoneId} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                            {z.zoneName ?? `구역 ${z.zoneId}`}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">
                            {zoneVertices.length}점
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs ${
                                z.isActive
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {z.isActive ? '사용' : '미사용'}
                            </span>
                          </td>
                          <td
                            className="max-w-[220px] truncate px-3 py-2 text-slate-600 dark:text-slate-400"
                            title={z.rmk ?? ''}
                          >
                            {z.rmk || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => startEditCctvZone(z)}
                              className="mr-2 text-slate-600 dark:text-slate-400 hover:underline"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCctvZone(z)}
                              className="text-red-600 dark:text-red-400 hover:underline"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager
                page={cctvPageData?.page ?? 0}
                totalPages={cctvPageData?.totalPages ?? 1}
                onChange={setCctvPage}
              />
            </>
          )
        ) : isLoading ? (
          <Spinner label="목록을 불러오는 중..." />
        ) : visibleFacilities.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            아직 등록된 {targetKind === 'GATE' ? '출입구' : '상점'}이(가) 없어요. 지도를 클릭해서 등록해보세요.
          </p>
        ) : listFacilities.length === 0 ? (
          // 조건이 세 개로 늘면서 "검색어와 일치하는 상점이 없어요"만으로는 어느 조건
          // 때문인지 알 수 없다. 켜져 있는 조건을 그대로 나열하고 푸는 버튼을 같이 둔다.
          <p className="py-8 text-center text-sm text-slate-500">
            {[
              stallSearch.trim() && `이름 "${stallSearch.trim()}"`,
              stallTypeFilter !== ALL_FILTER && `업종 ${facilityTypeLabel(stallTypeFilter)}`,
              stallActiveFilter !== ALL_FILTER && `상태 ${stallActiveFilter === 'active' ? '영업중' : '미영업'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' 조건에 맞는 상점이 없어요.'}
            <button
              type="button"
              onClick={resetStallFilters}
              className="ml-1 underline hover:text-slate-700 dark:hover:text-slate-300"
            >
              필터 초기화
            </button>
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">
                      {targetKind === 'GATE' ? '출입구명' : '상점명'}
                    </th>
                    {targetKind === 'STALL' && <th className="whitespace-nowrap px-3 py-2">업종</th>}
                    <th className="whitespace-nowrap px-3 py-2">위도 / 경도</th>
                    <th className="px-3 py-2">비고</th>
                    <th className="whitespace-nowrap px-3 py-2">{targetKind === 'GATE' ? '개방' : '상태'}</th>
                    <th className="whitespace-nowrap px-3 py-2">사진</th>
                    <th className="whitespace-nowrap px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {/* 2026-08-12 변경 (UIUX 피드백): "수정" 버튼을 없애고 행 아무 데나
                      눌러 수정에 들어가게 했다. 이름·좌표를 보고 대상을 고르는 화면인데
                      정작 누를 수 있는 곳은 줄 끝 작은 글자 하나였다.
                      행 안의 다른 버튼(사진 관리·삭제)은 stopPropagation으로 막는다 -
                      막지 않으면 삭제를 누를 때 수정까지 함께 열린다. */}
                  {pagedFacilities.map((f) => (
                    <tr
                      key={f.facilityId}
                      onClick={() => startEditFacility(f)}
                      onKeyDown={(e) => {
                        // 표의 행이라 버튼처럼 키보드로 눌리지 않는다. 마우스로만
                        // 되는 조작이 되지 않도록 Enter/Space를 직접 받는다.
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        startEditFacility(f);
                      }}
                      tabIndex={0}
                      aria-label={`${f.name} 수정`}
                      className={`cursor-pointer border-t border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 dark:border-slate-800 ${
                        editingId === f.facilityId
                          ? 'bg-blue-500/10'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{f.name}</td>
                      {targetKind === 'STALL' && (
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          {facilityTypeLabel(f.facilityType)}
                        </td>
                      )}
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {f.latitude.toFixed(6)}, {f.longitude.toFixed(6)}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-3 py-2 text-slate-600 dark:text-slate-400"
                        title={f.rmk ?? ''}
                      >
                        {f.rmk || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            f.isActive
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'border-slate-300 dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          {targetKind === 'GATE'
                            ? f.isActive
                              ? '개방'
                              : '폐쇄'
                            : f.isActive
                              ? '영업중'
                              : '휴업'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPhotoPanel(f);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {f.photoCount}장 관리
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFacility(f);
                          }}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={facilityPage} totalPages={facilityTotalPages} onChange={setFacilityPage} />
          </>
        )}
      </section>

      {/* 사진 관리 패널 */}
      {photoTarget && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              📷 "{photoTarget.name}" 외관 사진 관리
            </h2>
            <button
              type="button"
              onClick={() => setPhotoTarget(null)}
              className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            >
              닫기
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            사진에서 GPS 정보를 자동으로 찾아 좌표를 미리 채워드리지만, 스마트폰 GPS 오차가 있을 수 있으니 아래
            좌표를 확인 후 저장해주세요. 방향(동서남북)은 촬영자가 직접 선택합니다.
          </p>

          {photoError && <ErrorBanner message={photoError} />}

          <div className="mb-4 grid gap-3 rounded border border-slate-200 dark:border-slate-800 p-3 sm:grid-cols-2">
            {/*
              2026-08-20: 기본 file input은 "파일 선택 / 선택된 파일 없음"만 작게 떠서
              여기서 사진을 올린다는 것이 눈에 띄지 않았다. 눌러야 할 자리를 상자로
              키우고, 고른 파일 이름과 크기를 되돌려 보여준다. 끌어다 놓기도 받는다.
            */}
            <div className="sm:col-span-2">
              <label
                onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
                onDragLeave={() => setPhotoDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPhotoDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  // 이미지가 아닌 파일을 떨어뜨리면 조용히 무시한다.
                  if (dropped && dropped.type.startsWith('image/')) handlePhotoFileChange(dropped);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
                  photoDragOver
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-500/5 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-500'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoFileChange(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                {photoFile ? (
                  <>
                    <span className="text-2xl leading-none">🖼️</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {photoFile.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {(photoFile.size / 1024 / 1024).toFixed(1)}MB · 다시 누르면 다른 사진으로 바꿉니다
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl leading-none">📷</span>
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      사진 선택
                    </span>
                    <span className="text-xs text-slate-500">
                      클릭하거나 이미지를 이 상자로 끌어다 놓으세요
                    </span>
                  </>
                )}
              </label>
              {photoExifNote && <p className="mt-1 text-xs text-slate-500">{photoExifNote}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">방향</label>
              <select
                value={photoDirection}
                onChange={(e) => setPhotoDirection(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {DIRECTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">위도(보정)</label>
                <input
                  value={photoLat}
                  onChange={(e) => setPhotoLat(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">경도(보정)</label>
                <input
                  value={photoLng}
                  onChange={(e) => setPhotoLng(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={handlePhotoUpload}
                disabled={!photoFile || isUploadingPhoto}
                className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadingPhoto ? '업로드 중...' : '사진 저장'}
              </button>
            </div>
          </div>

          {isPhotosLoading ? (
            <Spinner label="사진 목록을 불러오는 중..." />
          ) : photos.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">등록된 사진이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((p) => (
                <div
                  key={p.photoId}
                  className="overflow-hidden rounded border border-slate-200 dark:border-slate-800"
                >
                  <img
                    src={p.downloadUrl}
                    alt={`${directionLabel(p.directionCode)}쪽 사진`}
                    className="h-28 w-full object-cover"
                  />
                  <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      {directionLabel(p.directionCode)}쪽
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePhotoDelete(p.photoId)}
                      className="text-red-600 dark:text-red-400 hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
