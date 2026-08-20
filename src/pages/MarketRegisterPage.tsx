import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import ErrorBanner from '../components/ui/ErrorBanner';
import FacilityLocationPicker from '../components/FacilityLocationPicker';
import type { PickerMode } from '../components/FacilityLocationPicker';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import {
  verticesToGeoJson,
  verticesToLineStringGeoJson,
  geoJsonToVertices,
  type LatLng,
} from '../utils/cctvZonePolygon';
import {
  createMarket,
  updateMarket,
  splitZones,
  updateZone,
  deleteZone,
  importBuildings,
  fetchMarkets,
  fetchZones,
  fetchBuildings,
  suggestMarketBoundary,
  pruneBuildings,
} from '../api/client';
import type { BuildingImportResult, BuildingPruneResult } from '../api/client';
import type { Market, Zone } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// 2026-08-14 추가 (시장 등록). 관리자(ROL01) 전용.
//
// 왜 별도 화면인가
//   지금까지 시장과 구역은 seed-market-data.sql로만 들어갔다. 등록 API가 없어서
//   새 시장을 추가하려면 SQL을 직접 쳐야 했고, 구역이 없으면 CCTV 구역 등록
//   (mrkcctv01m.zone_id가 필수)까지 연쇄로 막혔다.
//
//   /facilities(시장 구조 등록)는 "이미 있는 시장"의 상점·CCTV·오브젝트를 편집하는
//   화면이라 성격이 다르다. 여기는 앞 단계 결과(marketId)가 있어야 다음이 열리는
//   순서 강제 흐름이라 라우트를 나눴다. /facilities는 건드리지 않는다.
//
// 구역을 하나씩 그리지 않고 "영역 한 번 + 선 몇 개"로 나누는 이유
//   실제 시장 구조가 그렇다. 망원시장도 골목 하나를 출입구 위치에서 두 번 잘라
//   남측·중앙·북측 3구역이 됐다(seed-market-data.sql 주석). 구역을 각각 그리면
//   꼭짓점을 40개 찍어야 하지만, 이 방식이면 영역 하나와 선 두 개면 된다.
//   BE가 잘라주며(POST /markets/{id}/zones/split), 잘린 조각이 각각 zone_id를 받는다.
//
// ⚠️ 여기서 만드는 구역은 시뮬레이션 구역(mrkaddr01d)이다. CCTV 관제 구역
//    (mrkcctv01m)과는 다른 테이블이며, CCTV는 이 구역이 있어야 등록할 수 있다.

/** 아직 위치가 정해지지 않은 새 시장을 찾아가는 출발점. 서울시청. */
const DEFAULT_CENTER: LatLng = [37.5665, 126.978];

/** 시장 중심을 찾아가는 단계에서는 넓게, 영역을 그릴 때는 기본값(2)으로 정밀하게. */
const SEARCH_ZOOM_LEVEL = 6;

/** BE MarketCreateRequestDto의 @Pattern과 같은 규칙. 어긋나면 400이 온다. */
const MARKET_CODE_PATTERN = /^MKT[A-Z0-9]{2}$/;

const MIN_AREA_VERTEX_COUNT = 3;
const CUT_LINE_POINT_COUNT = 2;

/** 영역은 빨강, 자르는 선은 청록. 같은 지도 위에서 역할을 구분한다. */
const AREA_DRAFT_COLOR = '#dc2626';
const CUT_DRAFT_COLOR = '#0d9488';
/** 건물을 받아올 사각형 범위. 영역·선과 헷갈리지 않게 다른 색을 쓴다. */
const BOX_DRAFT_COLOR = '#7c3aed';

/** 브이월드에서 건물을 받아올 기본 반경. 망원시장(길이 약 250m)이 여유 있게 덮인다. */
const DEFAULT_BUILDING_RADIUS_M = 150;

/**
 * 구역 경계에서 이 거리 안의 건물은 남긴다.
 *
 * 0으로 두지 않는 이유: 구역은 골목을 따라 그린 것이라, 골목에 접한 상가 건물이 경계
 * 밖으로 조금 나가 있는 경우가 흔하다. 그것까지 지우면 통로를 좁혀주던 벽이 사라진다.
 */
const DEFAULT_PRUNE_BUFFER_M = 30;

type Step = 1 | 2 | 3 | 4;
/** 2단계 안에서 "영역을 그리는 중"과 "선을 긋는 중"을 나눈다. */
type DrawPhase = 'area' | 'cuts';

export default function MarketRegisterPage() {
  useDocumentTitle('시장 등록');
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1단계
  const [marketName, setMarketName] = useState('');
  const [marketCode, setMarketCode] = useState('');
  const [centerLat, setCenterLat] = useState<number | null>(null);
  const [centerLng, setCenterLng] = useState<number | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);
  const [market, setMarket] = useState<Market | null>(null);
  /**
   * 이미 등록된 시장 목록. 화면에 들어올 때 한 번 받아둔다.
   *
   * 이걸 미리 갖고 있어야 "이미 있는 시장인지"를 <b>등록을 시도하기 전에</b> 알 수 있다.
   * 예전에는 일단 POST를 보내고 409를 받아야 알았는데, 사용자 입장에서는 정상 흐름인데도
   * 콘솔과 화면에 오류가 뜨는 꼴이었다.
   */
  const [knownMarkets, setKnownMarkets] = useState<Market[]>([]);
  /** 안내를 닫았는지. 이름이나 코드를 고치면 다시 열린다. */
  const [dismissedExisting, setDismissedExisting] = useState(false);
  /**
   * 이어서 진행할 때, 그 시장에 이미 있던 구역들. 예전에는 개수만 세서 경고문에
   * 썼는데, 그러면 기존 구역이 어디에 있는지 안 보여서 새 구역을 겹치게 그리거나
   * 이름이 충돌하는 사고가 났다. 폴리곤째 들고 있으면서 3단계 지도에 회색 점선으로
   * 깔아주고, 목록에서 이름 수정·삭제도 바로 할 수 있게 한다.
   */
  const [existingZones, setExistingZones] = useState<Zone[]>([]);
  const existingZoneCount = existingZones.length;
  /** 기존 구역 중 지금 이름을 고치고 있는 것. null이면 편집 중 아님. */
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [editingZoneName, setEditingZoneName] = useState('');
  /** 이름 수정/삭제 요청이 진행 중인 구역. 그 행의 버튼만 잠근다. */
  const [zoneBusyId, setZoneBusyId] = useState<number | null>(null);

  // 2단계
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('area');
  const [areaVertices, setAreaVertices] = useState<LatLng[]>([]);
  const [committedArea, setCommittedArea] = useState<LatLng[] | null>(null);
  /** OSM에서 경계를 불러왔을 때의 출처. ODbL이 출처 표시를 요구해서 화면에 남긴다. */
  const [boundarySource, setBoundarySource] = useState<{ name: string; attribution: string } | null>(null);
  /** 값이 바뀌면 지도를 지금 그린 영역에 맞춘다(불러온 폴리곤이 화면 밖일 수 있다). */
  const [refitToken, setRefitToken] = useState(0);
  const [lineDraft, setLineDraft] = useState<LatLng[]>([]);
  const [cutLines, setCutLines] = useState<LatLng[][]>([]);
  const [zoneNames, setZoneNames] = useState<string[]>([]);

  // 2단계 (건물 불러오기)
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_BUILDING_RADIUS_M);
  const [buildingResult, setBuildingResult] = useState<BuildingImportResult | null>(null);
  /**
   * 지도에 깔아줄 건물 모양. 구역을 그릴 때 어디가 건물인지 보이게 한다 -
   * 시뮬레이션은 "구역 - 건물"을 통로로 보므로 건물 자리는 구역 안이어도 통행 불가다.
   */
  const [buildingShapes, setBuildingShapes] = useState<LatLng[][]>([]);
  /** 이미 저장돼 있는 건물 수. 0보다 크면 "다시 받기(덮어쓰기)"로 동작한다. */
  const [existingBuildingCount, setExistingBuildingCount] = useState(0);
  /** 건물을 받아올 사각형 범위의 두 모서리. 비어 있으면 반경으로 받는다. */
  const [boxCorners, setBoxCorners] = useState<LatLng[]>([]);

  // 4단계
  const [createdZones, setCreatedZones] = useState<Zone[]>([]);
  /** 구역에서 먼 건물이 몇 개인지. 지우기 전에 숫자를 먼저 보여준다. */
  const [pruneResult, setPruneResult] = useState<BuildingPruneResult | null>(null);
  const [pruneBufferMeters, setPruneBufferMeters] = useState(DEFAULT_PRUNE_BUFFER_M);

  const trimmedName = marketName.trim();
  const normalizedCode = marketCode.trim().toUpperCase();

  /**
   * 아직 채우지 않은 항목. 버튼을 그냥 비활성으로 두면 "왜 안 눌리는지" 알 수가 없어서
   * (실제로 여기서 막혔다), 무엇이 비었는지 이름으로 돌려준다.
   */
  const missingMarketFields: string[] = [];
  if (trimmedName.length === 0) missingMarketFields.push('시장 이름');
  if (!MARKET_CODE_PATTERN.test(normalizedCode)) missingMarketFields.push('시장 코드');
  if (centerLat === null || centerLng === null) missingMarketFields.push('시장 중심 좌표');

  /**
   * 지금 입력한 코드나 이름과 겹치는, 이미 등록된 시장. 코드를 먼저 본다(코드가 신원이라).
   * 값이 있으면 등록 버튼 대신 "이어서 진행할까요?" 안내를 보여준다.
   */
  const existingMarket = useMemo<Market | null>(() => {
    if (dismissedExisting) return null;
    const byCode = knownMarkets.find((candidate) => candidate.marketCode === normalizedCode);
    if (byCode) return byCode;
    if (trimmedName.length === 0) return null;
    return knownMarkets.find((candidate) => candidate.marketName.trim() === trimmedName) ?? null;
  }, [knownMarkets, normalizedCode, trimmedName, dismissedExisting]);

  /** 자르는 선 N개 -> 구역 N+1개. 이름 칸 수를 항상 여기에 맞춘다. */
  const zoneCount = cutLines.length + 1;

  function resizeZoneNames(nextCutCount: number) {
    setZoneNames((previous) => {
      const next = [...previous];
      next.length = nextCutCount + 1;
      return Array.from(next, (value) => value ?? '');
    });
  }

  // 화면에 들어올 때 등록된 시장 목록을 받아둔다. 입력한 코드/이름이 이미 있는지
  // 서버에 POST를 보내보기 전에 알기 위한 것이다(관리자는 전체 시장을 받는다).
  useEffect(() => {
    void refreshKnownMarkets();
    // 최초 1회만. 이후 갱신은 409 안전망과 "다른 시장 또 등록하기"에서 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateMarket(event: FormEvent) {
    event.preventDefault();

    // 버튼은 항상 누를 수 있게 두고, 부족한 것이 있으면 무엇인지 말해준다.
    if (missingMarketFields.length > 0 || centerLat === null || centerLng === null) {
      setError(`아직 입력하지 않은 항목이 있습니다 — ${missingMarketFields.join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createMarket({
        marketName: trimmedName,
        marketCode: normalizedCode,
        latitude: centerLat,
        longitude: centerLng,
      });
      setMarket(created);
      setExistingZones([]);
      // 새로 만든 시장이라 건물도 구역도 없다. 이전 시장의 값이 남지 않게 비운다.
      setExistingBuildingCount(0);
      setBuildingShapes([]);
      setStep(2);
    } catch (err) {
      // 목록이 오래돼 미리 못 걸러낸 경우(다른 탭에서 만든 시장 등)의 마지막 안전망.
      // 목록을 새로 받아오면 existingMarket이 다시 계산되면서 안내가 뜬다.
      if (isAxiosError(err) && err.response?.status === 409) {
        setDismissedExisting(false);
        await refreshKnownMarkets();
        return;
      }
      setError(toDisplayErrorMessage(err, '시장 등록에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  async function refreshKnownMarkets() {
    try {
      setKnownMarkets(await fetchMarkets());
    } catch {
      // 목록을 못 받아도 등록 자체는 막지 않는다. 그때는 409로 걸러진다.
    }
  }

  /**
   * 이미 등록된 시장과 지금 입력값의 차이. 시장 코드는 신원이라 비교 대상이 아니다
   * (BE도 수정 요청에서 코드를 받지 않는다).
   */
  const existingDiffs = useMemo(() => {
    if (!existingMarket) return [];
    const diffs: Array<{ label: string; before: string; after: string }> = [];

    if (trimmedName.length > 0 && existingMarket.marketName.trim() !== trimmedName) {
      diffs.push({ label: '이름', before: existingMarket.marketName, after: trimmedName });
    }
    if (centerLat !== null && centerLng !== null) {
      // 위경도는 DECIMAL로 저장돼 되돌아올 때 끝자리가 흔들린다. 1e-7도(약 1cm)까지는
      // 같은 위치로 본다 - 그러지 않으면 아무것도 안 바꿔도 "좌표가 달라졌다"고 나온다.
      const moved =
        Math.abs(Number(existingMarket.latitude) - centerLat) > 1e-7 ||
        Math.abs(Number(existingMarket.longitude) - centerLng) > 1e-7;
      if (moved) {
        diffs.push({
          label: '좌표',
          before: `${existingMarket.latitude}, ${existingMarket.longitude}`,
          after: `${centerLat}, ${centerLng}`,
        });
      }
    }
    return diffs;
  }, [existingMarket, trimmedName, centerLat, centerLng]);

  async function handleUpdateExisting() {
    if (!existingMarket || centerLat === null || centerLng === null) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await updateMarket(existingMarket.marketId, {
        marketName: trimmedName,
        latitude: centerLat,
        longitude: centerLng,
      });
      const zones = await fetchZones(updated.marketId);
      setExistingZones(zones);
      await loadBuildingShapes(updated.marketId);
      setMarket(updated);
      setDismissedExisting(true);
      setStep(2);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '시장 정보를 수정하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleContinueWithExisting() {
    if (!existingMarket) return;

    setSaving(true);
    setError(null);
    try {
      // 이미 구역이 있으면 2단계에서 알려줘야 한다. 분할은 기존 구역을 지우지 않고
      // 새로 더하기만 하므로, 모르고 진행하면 구역이 중복으로 쌓인다.
      const zones = await fetchZones(existingMarket.marketId);
      setExistingZones(zones);
      await loadBuildingShapes(existingMarket.marketId);
      setMarket(existingMarket);
      setDismissedExisting(true);
      setStep(2);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '구역 정보를 불러오지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  /** 기존 구역 이름 수정 확정. 폴리곤은 그대로 두고 이름만 바꾼다(PUT은 둘 다 요구). */
  async function handleRenameZone(zone: Zone) {
    const nextName = editingZoneName.trim();
    if (!nextName || nextName === zone.zoneName) {
      setEditingZoneId(null);
      return;
    }
    setZoneBusyId(zone.zoneId);
    setError(null);
    try {
      const updated = await updateZone(zone.zoneId, {
        zoneName: nextName,
        polygonCoordinates: zone.polygonCoordinates,
      });
      setExistingZones((previous) =>
        previous.map((known) => (known.zoneId === updated.zoneId ? updated : known))
      );
      setEditingZoneId(null);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '구역 이름을 수정하지 못했습니다.'));
    } finally {
      setZoneBusyId(null);
    }
  }

  async function handleDeleteZone(zone: Zone) {
    // CCTV 구역이 물려 있으면 BE가 구체적인 안내와 함께 거부한다(ZoneService.deleteZone).
    if (!window.confirm(`"${zone.zoneName}" 구역을 삭제할까요? 연결된 통로 정보도 함께 삭제됩니다.`)) return;
    setZoneBusyId(zone.zoneId);
    setError(null);
    try {
      await deleteZone(zone.zoneId);
      setExistingZones((previous) => previous.filter((known) => known.zoneId !== zone.zoneId));
    } catch (err) {
      setError(toDisplayErrorMessage(err, '구역을 삭제하지 못했습니다.'));
    } finally {
      setZoneBusyId(null);
    }
  }

  function handleAddVertex(lat: number, lng: number) {
    // 2단계: 건물을 받아올 사각형 범위의 두 모서리. 세 번째 클릭은 새로 시작하는 것으로 본다.
    if (step === 2) {
      setBoxCorners((previous) => (previous.length >= 2 ? [[lat, lng]] : [...previous, [lat, lng]]));
      return;
    }
    if (step !== 3) return;
    if (drawPhase === 'area') {
      setAreaVertices((previous) => [...previous, [lat, lng]]);
      return;
    }
    // 선은 두 점까지만 받는다. 세 번째 클릭은 새 선을 시작하는 것으로 본다.
    setLineDraft((previous) =>
      previous.length >= CUT_LINE_POINT_COUNT ? [[lat, lng]] : [...previous, [lat, lng]]
    );
  }

  /**
   * OpenStreetMap에서 시장 경계를 찾아 영역으로 채운다.
   *
   * 전통시장 경계를 폴리곤으로 주는 공개 API가 달리 없다(카카오·네이버 검색과 공공데이터
   * 표준데이터는 모두 좌표 한 점만 준다). OSM은 자원봉사 데이터라 없는 시장도 많고,
   * 그때는 지금까지처럼 직접 그리면 된다.
   */
  async function handleSuggestBoundary() {
    if (!market) return;

    setSaving(true);
    setError(null);
    try {
      const result = await suggestMarketBoundary(market.marketId);
      if (!result.found || !result.polygonCoordinates) {
        setError('OpenStreetMap에 이 시장의 경계가 없습니다. 지도에서 직접 그려주세요.');
        return;
      }

      const vertices = geoJsonToVertices(result.polygonCoordinates);
      if (vertices.length < MIN_AREA_VERTEX_COUNT) {
        setError('불러온 경계의 꼭짓점이 너무 적습니다. 지도에서 직접 그려주세요.');
        return;
      }

      setAreaVertices(vertices);
      setBoundarySource({
        name: result.sourceName ?? '',
        attribution: result.attribution ?? '',
      });
      // 불러온 폴리곤이 지금 화면 밖일 수 있어 지도를 거기에 맞춘다.
      setRefitToken((token) => token + 1);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '시장 경계를 불러오지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  function handleCommitArea() {
    if (areaVertices.length < MIN_AREA_VERTEX_COUNT) return;
    setCommittedArea(areaVertices);
    setDrawPhase('cuts');
    setError(null);
  }

  function handleRedrawArea() {
    setCommittedArea(null);
    setBoundarySource(null);
    setDrawPhase('area');
    setLineDraft([]);
    setCutLines([]);
    setZoneNames([]);
    setError(null);
  }

  function handleAddCutLine() {
    if (lineDraft.length !== CUT_LINE_POINT_COUNT) return;
    setCutLines((previous) => {
      const next = [...previous, lineDraft];
      resizeZoneNames(next.length);
      return next;
    });
    setLineDraft([]);
    setError(null);
  }

  function handleRemoveCutLine(index: number) {
    setCutLines((previous) => {
      const next = previous.filter((_, i) => i !== index);
      resizeZoneNames(next.length);
      return next;
    });
  }

  async function handleSplitZones() {
    if (!market || !committedArea || cutLines.length === 0) return;

    const filledNames = zoneNames.map((name) => (name ?? '').trim());
    const namedCount = filledNames.filter((name) => name.length > 0).length;
    // 전부 비우면 BE가 "구역 1"부터 붙여준다. 일부만 채우면 어느 칸이 빠졌는지 알려준다.
    if (namedCount > 0 && namedCount < zoneCount) {
      setError(
        `구역 이름을 ${zoneCount}개 모두 입력하거나, 전부 비워서 자동으로 붙이게 해주세요.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const zones = await splitZones(market.marketId, {
        polygonCoordinates: verticesToGeoJson(committedArea),
        cutLines: cutLines.map((line) => verticesToLineStringGeoJson(line)),
        zoneNames: namedCount === zoneCount ? filledNames : undefined,
      });
      setCreatedZones(zones);
      // 구역이 생겼으니 이제 "시장에서 먼 건물"을 판정할 기준이 있다.
      await countDistantBuildings(market.marketId, pruneBufferMeters);
      setStep(4);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '구역을 만들지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleImportBuildings() {
    if (!market) return;

    setSaving(true);
    setError(null);
    try {
      // 사각형을 그렸으면 그 범위로, 아니면 반경으로 받는다.
      const bounds =
        boxCorners.length === 2
          ? {
              minLatitude: Math.min(boxCorners[0][0], boxCorners[1][0]),
              maxLatitude: Math.max(boxCorners[0][0], boxCorners[1][0]),
              minLongitude: Math.min(boxCorners[0][1], boxCorners[1][1]),
              maxLongitude: Math.max(boxCorners[0][1], boxCorners[1][1]),
            }
          : undefined;

      const result = await importBuildings(market.marketId, {
        ...(bounds ? { bounds } : { radiusMeters }),
        // 이미 있는 걸 알고 부르는 것이므로 409를 볼 이유가 없다.
        overwrite: existingBuildingCount > 0,
      });
      setBuildingResult(result);
      setBoxCorners([]);
      await loadBuildingShapes(market.marketId);
      setStep(3);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '건물을 불러오지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  /**
   * 건물 없이 구역 나누기로 넘어간다. 이미 등록된 시장이라 건물이 들어 있을 수 있으므로
   * 그때는 지도에 깔아준다(불러오기를 건너뛴 것이지 건물이 없다는 뜻은 아니다).
   */
  async function handleSkipBuildings() {
    if (!market) return;
    setError(null);
    await loadBuildingShapes(market.marketId);
    setStep(3);
  }

  /**
   * 3단계 건너뛰기. 이미 구역이 있는 시장을 다시 들어왔을 때(이름 수정·삭제만 하고
   * 싶을 때) 억지로 선을 긋지 않고 완료로 넘어가는 길이다. 구역이 하나도 없으면
   * 시뮬레이션도 CCTV 구역 등록(zone_id 필수)도 못 하므로 확인을 한 번 받는다.
   */
  function handleSkipZones() {
    if (
      existingZoneCount === 0 &&
      !window.confirm(
        '구역이 하나도 없는 상태로 완료할까요? 구역이 없으면 시뮬레이션과 CCTV 구역 등록을 할 수 없습니다.'
      )
    ) {
      return;
    }
    setError(null);
    setCreatedZones([]);
    setStep(4);
  }

  /**
   * 구역에서 먼 건물이 몇 개인지 세어본다(지우지 않는다).
   * 건물이 없거나 구역이 없으면 조용히 넘어간다 - 안내할 것이 없다.
   */
  async function countDistantBuildings(marketId: number, bufferMeters: number) {
    try {
      setPruneResult(await pruneBuildings(marketId, { bufferMeters, dryRun: true }));
    } catch {
      setPruneResult(null);
    }
  }

  async function handlePruneBuildings() {
    if (!market) return;

    setSaving(true);
    setError(null);
    try {
      const result = await pruneBuildings(market.marketId, {
        bufferMeters: pruneBufferMeters,
        dryRun: false,
      });
      setPruneResult(result);
      await loadBuildingShapes(market.marketId);
    } catch (err) {
      setError(toDisplayErrorMessage(err, '건물을 정리하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  /**
   * 이미 저장된 건물을 지도에 깔고 개수를 세어둔다.
   *
   * 개수를 미리 알아야 "이미 있는데 또 받아서 409를 보는" 일이 없다. 있으면 안내를
   * 띄우고 버튼을 "다시 받기"로 바꾼다(시장 등록 1단계에서 겪은 것과 같은 문제다).
   */
  async function loadBuildingShapes(marketId: number) {
    try {
      const buildings = await fetchBuildings(marketId);
      setExistingBuildingCount(buildings.length);
      setBuildingShapes(
        buildings
          .map((building) => geoJsonToVertices(building.polygonCoordinates))
          .filter((vertices) => vertices.length >= 3)
      );
    } catch {
      // 건물을 못 불러와도 구역은 그릴 수 있다. 배경이 비는 것뿐이다.
      setExistingBuildingCount(0);
      setBuildingShapes([]);
    }
  }

  /**
   * 이전 단계로 돌아간다. 앞으로 건너뛰는 데는 쓰지 않는다 - 각 단계는 앞 단계의
   * 결과(marketId, 구역)를 전제로 하기 때문이다.
   *
   * 되돌아갈 때 그 단계에서 다시 시작해야 하는 상태만 비운다. 이미 서버에 저장된 것
   * (시장·건물·구역)은 건드리지 않는다 - 화면을 되돌리는 것이지 등록을 취소하는 게 아니다.
   */
  function handleGoBack(target: Step) {
    if (target >= step) return;
    setError(null);

    if (target === 1) {
      // 등록된 시장 목록을 새로 받아야 "이미 등록된 시장입니다" 안내가 제대로 뜬다.
      setDismissedExisting(false);
      void refreshKnownMarkets();
    }
    if (target <= 2) {
      setBoxCorners([]);
    }
    if (target <= 3) {
      // 구역 그리기는 처음부터 다시. 이미 만들어진 구역이 있으면 2단계에서 경고한다.
      setDrawPhase('area');
      setAreaVertices([]);
      setCommittedArea(null);
      setBoundarySource(null);
      setLineDraft([]);
      setCutLines([]);
      setZoneNames([]);
      if (createdZones.length > 0) {
        setExistingZones((previous) => {
          const known = new Set(previous.map((zone) => zone.zoneId));
          return [...previous, ...createdZones.filter((zone) => !known.has(zone.zoneId))];
        });
      }
    }
    setStep(target);
  }

  function handleRegisterAnother() {
    setStep(1);
    setMarketName('');
    setMarketCode('');
    setCenterLat(null);
    setCenterLng(null);
    setMarket(null);
    setDismissedExisting(false);
    setExistingZones([]);
    void refreshKnownMarkets();
    handleRedrawArea();
    setCreatedZones([]);
    setBuildingResult(null);
    setBuildingShapes([]);
    setExistingBuildingCount(0);
    setBoxCorners([]);
    setRadiusMeters(DEFAULT_BUILDING_RADIUS_M);
    setPruneResult(null);
    setPruneBufferMeters(DEFAULT_PRUNE_BUFFER_M);
  }

  // 지도에 넘길 값들. 단계마다 클릭이 하는 일과 보여줄 도형이 달라진다.
  //
  // 배열은 useMemo로 감싼다. 인라인으로 []나 .map()을 넘기면 렌더마다 새 참조가 되어
  // 지도 레이어를 지웠다 다시 그리는 이펙트가 계속 돌고, 그리는 중인 도형이 깜빡인다.
  const mapMode: PickerMode =
    step === 2 ? 'box' : step === 3 ? (drawPhase === 'area' ? 'polygon' : 'line') : 'point';
  const mapDraftColor =
    step === 2 ? BOX_DRAFT_COLOR : drawPhase === 'area' ? AREA_DRAFT_COLOR : CUT_DRAFT_COLOR;

  const mapVertices = useMemo<LatLng[]>(() => {
    if (step === 2) return boxCorners;
    if (step !== 3) return [];
    return drawPhase === 'area' ? areaVertices : lineDraft;
  }, [step, drawPhase, areaVertices, lineDraft, boxCorners]);

  const mapCommittedLines = useMemo<LatLng[][]>(
    () => (step === 3 && drawPhase === 'cuts' ? cutLines : []),
    [step, drawPhase, cutLines]
  );

  /** 건물은 구역을 그리는 3단계부터 깔아준다. 1~2단계에는 보여줄 이유가 없다. */
  const mapBuildingOverlays = useMemo<LatLng[][]>(
    () => (step >= 2 ? buildingShapes : []),
    [step, buildingShapes]
  );

  const mapSimulationZones = useMemo(() => {
    // 3단계부터 기존 구역을 회색 점선으로 깔아준다. 어디에 이미 구역이 있는지
    // 보여야 겹치지 않게 새 구역을 그릴 수 있다. 4단계에서는 방금 만든 구역까지 합친다.
    const existing =
      step >= 3
        ? existingZones.map((zone) => ({
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            vertices: geoJsonToVertices(zone.polygonCoordinates),
          }))
        : [];
    const created =
      step >= 4
        ? createdZones
            .filter((zone) => !existingZones.some((known) => known.zoneId === zone.zoneId))
            .map((zone) => ({
              zoneId: zone.zoneId,
              zoneName: zone.zoneName,
              vertices: geoJsonToVertices(zone.polygonCoordinates),
            }))
        : [];
    return [...existing, ...created];
  }, [step, existingZones, createdZones]);

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">시장 등록</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            새 시장을 등록하고 시뮬레이션 구역을 나눕니다. 관리자만 쓸 수 있습니다.
          </p>
        </div>
        <Link
          to="/facilities"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          시장 구조 등록으로
        </Link>
      </header>

      <StepBar current={step} onGoBack={handleGoBack} />

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">지도</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{mapHintFor(step, drawPhase)}</p>
          <FacilityLocationPicker
            centerLat={centerLat ?? DEFAULT_CENTER[0]}
            centerLng={centerLng ?? DEFAULT_CENTER[1]}
            markers={[]}
            pickedLat={step === 1 ? centerLat : null}
            pickedLng={step === 1 ? centerLng : null}
            onPick={(lat, lng) => {
              if (step !== 1) return;
              setCenterLat(lat);
              setCenterLng(lng);
            }}
            mode={mapMode}
            vertices={mapVertices}
            onAddVertex={handleAddVertex}
            draftColor={mapDraftColor}
            committedLines={mapCommittedLines}
            constraintPolygon={step === 3 && committedArea ? committedArea : undefined}
            simulationZones={mapSimulationZones}
            buildingOverlays={mapBuildingOverlays}
            height={460}
            initialLevel={SEARCH_ZOOM_LEVEL}
            recenterToken={recenterToken}
            /* 검색은 1단계에서만. 2단계는 이미 시장 위치에 맞춰져 있고, 구역을 그리는
               도중에 지도가 다른 곳으로 튀면 그리던 도형과 어긋난다. */
            searchable={step === 1}
            /* 영역과 선을 그리는 2단계에서 켠다. 전통시장 경계를 주는 공개 API가 없어서
               (네이버·카카오 모두 검색 결과는 점 하나뿐) 위성 사진과 지적편집도를 깔아
               눈으로 보며 그릴 수 있게 한다. */
            mapTypeToggle={step === 3}
            refitToken={refitToken}
            /* 검색으로 고른 장소의 이름을 시장 이름으로 채운다. 대부분 "망원시장"처럼
               찾은 이름이 곧 시장 이름이라, 같은 값을 두 번 입력하지 않게 한다.
               다르게 쓰고 싶으면 입력란에서 그대로 고치면 된다. */
            onPlaceSelected={(place) => {
              if (step !== 1) return;
              setMarketName(place.name);
            }}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {step === 1 && (
            <form
              onSubmit={handleCreateMarket}
              /* 입력을 고치기 시작하면 이전 오류 안내를 지운다. 그러지 않으면 이미
                 해결한 오류의 빨간 배너가 화면에 계속 남아 지금 상태를 오해하게 만든다
                 (실제로 서버를 고친 뒤에도 옛 오류가 떠 있어 혼란을 줬다). */
              onChange={() => {
                if (error) setError(null);
                // 이름이나 코드를 고치면 닫아둔 "이미 등록됨" 안내를 다시 판단한다.
                if (dismissedExisting) setDismissedExisting(false);
              }}
              className="space-y-4"
            >
              {existingMarket && (
                <div
                  role="group"
                  aria-labelledby="existing-market-title"
                  className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40"
                >
                  <h3
                    id="existing-market-title"
                    className="text-sm font-medium text-amber-900 dark:text-amber-200"
                  >
                    이미 등록된 시장입니다
                  </h3>
                  <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
                    {existingMarket.marketName}
                    <span className="ml-1.5 font-mono text-xs text-amber-700 dark:text-amber-400">
                      {existingMarket.marketCode}
                    </span>
                  </p>
                  {existingDiffs.length > 0 ? (
                    <>
                      <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                        입력한 내용이 등록된 정보와 다릅니다. 수정하고 이어서 진행할 수 있습니다.
                        <br />
                        시장 코드는 담당 시장 권한의 기준이라 바뀌지 않습니다.
                      </p>
                      <dl className="mt-2 space-y-1 rounded bg-amber-100/60 p-2 text-xs dark:bg-amber-900/30">
                        {existingDiffs.map((diff) => (
                          <div key={diff.label} className="flex flex-wrap items-baseline gap-1.5">
                            <dt className="w-8 shrink-0 text-amber-700 dark:text-amber-400">{diff.label}</dt>
                            <dd className="text-amber-900 line-through dark:text-amber-400/70">{diff.before}</dd>
                            <dd aria-hidden="true" className="text-amber-700 dark:text-amber-400">→</dd>
                            <dd className="font-medium text-amber-900 dark:text-amber-100">{diff.after}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                      이 시장에 이어서 구역을 나누고 건물을 불러올 수 있습니다. 시장 정보 자체는 바뀌지 않습니다.
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {existingDiffs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUpdateExisting}
                        disabled={saving}
                        className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:focus:ring-offset-slate-900"
                      >
                        {saving ? '수정하는 중...' : '정보 수정하고 계속'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleContinueWithExisting}
                      disabled={saving}
                      className={
                        existingDiffs.length > 0
                          ? 'rounded border border-amber-400 px-3 py-1.5 text-sm text-amber-900 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40'
                          : 'rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:focus:ring-offset-slate-900'
                      }
                    >
                      {existingDiffs.length > 0 ? '그대로 계속' : saving ? '불러오는 중...' : '이 시장으로 계속'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedExisting(true)}
                      className="rounded border border-amber-400 px-3 py-1.5 text-sm text-amber-900 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">시장 정보</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  이름과 코드, 시장 중심 좌표를 등록합니다.
                </p>
              </div>

              <Field
                label="시장 이름"
                htmlFor="marketName"
                hint="지도에서 검색 결과를 고르면 자동으로 채워집니다. 다르게 쓰려면 고쳐 주세요."
              >
                <input
                  id="marketName"
                  type="text"
                  value={marketName}
                  onChange={(e) => setMarketName(e.target.value)}
                  maxLength={50}
                  placeholder="예: 망원시장"
                  className={inputClass}
                />
              </Field>

              <Field
                label="시장 코드"
                htmlFor="marketCode"
                hint="MKT로 시작하는 5자입니다(예: MKTGN). 담당 시장 권한이 이 코드로 갈립니다."
              >
                <input
                  id="marketCode"
                  type="text"
                  value={marketCode}
                  onChange={(e) => setMarketCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  placeholder="MKTGN"
                  className={`${inputClass} font-mono tracking-wider`}
                  aria-invalid={marketCode.length > 0 && !MARKET_CODE_PATTERN.test(normalizedCode)}
                />
                {marketCode.length > 0 && !MARKET_CODE_PATTERN.test(normalizedCode) && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    MKT 뒤에 영문 대문자나 숫자 2자를 붙여주세요.
                  </p>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="위도" htmlFor="centerLat">
                  <input
                    id="centerLat"
                    type="number"
                    step="0.000001"
                    value={centerLat ?? ''}
                    onChange={(e) => setCenterLat(e.target.value === '' ? null : Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="경도" htmlFor="centerLng">
                  <input
                    id="centerLng"
                    type="number"
                    step="0.000001"
                    value={centerLng ?? ''}
                    onChange={(e) => setCenterLng(e.target.value === '' ? null : Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
              </div>

              <button
                type="button"
                onClick={() => setRecenterToken((t) => t + 1)}
                disabled={centerLat === null || centerLng === null}
                className={secondaryButtonClass}
              >
                입력한 좌표로 지도 이동
              </button>

              {/* 이미 등록된 시장이면 등록 버튼을 감춘다. 눌러봐야 409로 거부될 뿐이고,
                  진행할 방법은 위 안내의 버튼들이다. 앞으로 갈 길을 하나만 남긴다. */}
              {!existingMarket && (
                <div className="space-y-1.5">
                  <button type="submit" disabled={saving} className={primaryButtonClass}>
                    {saving ? '등록하는 중...' : '시장 등록하고 다음으로'}
                  </button>
                  {missingMarketFields.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      남은 항목: {missingMarketFields.join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    이미 등록된 시장의 이름이나 코드는 다시 쓸 수 없습니다.
                  </p>
                </div>
              )}
            </form>
          )}

          {/* 3단계. 2026-08-14에 건물(2단계)과 순서를 바꾸면서 파일 안에서는 이 블록이
              건물 블록보다 위에 남아 있다. 화면 순서는 STEP_LABELS를 따른다. */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">구역 나누기</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {market?.marketName}
                  <span className="ml-1.5 font-mono text-slate-400 dark:text-slate-500">{market?.marketCode}</span>
                </p>
              </div>

              {existingZoneCount > 0 && (
                <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    이 시장에는 이미 구역 {existingZoneCount}개가 있습니다(지도의 회색 점선). 여기서 만드는 구역은
                    기존 구역을 지우지 않고 <strong className="font-medium">더해집니다.</strong> 이름이 겹치면 저장이
                    거부됩니다.
                  </p>
                  <ul className="space-y-1.5">
                    {existingZones.map((zone) => (
                      <li key={zone.zoneId} className="flex items-center gap-1.5">
                        {editingZoneId === zone.zoneId ? (
                          <>
                            <input
                              value={editingZoneName}
                              onChange={(event) => setEditingZoneName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void handleRenameZone(zone);
                                if (event.key === 'Escape') setEditingZoneId(null);
                              }}
                              autoFocus
                              maxLength={50}
                              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => void handleRenameZone(zone)}
                              disabled={zoneBusyId === zone.zoneId}
                              className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingZoneId(null)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-xs text-amber-900 dark:text-amber-200">
                              {zone.zoneName}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingZoneId(zone.zoneId);
                                setEditingZoneName(zone.zoneName);
                              }}
                              disabled={zoneBusyId !== null}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                              이름 수정
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteZone(zone)}
                              disabled={zoneBusyId !== null}
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              {zoneBusyId === zone.zoneId ? '처리 중...' : '삭제'}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {drawPhase === 'area' ? (
                <>
                  <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    사람이 걸어다니는 <strong className="font-medium text-slate-900 dark:text-slate-100">골목 전체</strong>를
                    하나의 영역으로 그립니다. 건물이나 부지 경계가 아니라, 에이전트가 움직일 공간입니다.
                  </p>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleSuggestBoundary}
                      disabled={saving}
                      className={secondaryButtonClass}
                    >
                      {saving ? '찾는 중...' : 'OpenStreetMap에서 경계 불러오기'}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      등록된 시장이면 골목 경계를 그대로 채워줍니다. 없으면 직접 그리면 됩니다.
                    </p>
                  </div>

                  {boundarySource && (
                    <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                      불러온 경계:{' '}
                      <strong className="font-medium text-slate-900 dark:text-slate-100">
                        {boundarySource.name || '(이름 없음)'}
                      </strong>
                      <br />
                      맞는지 확인하고 필요하면 고쳐 주세요.
                      <span className="mt-1 block text-slate-400 dark:text-slate-500">
                        {boundarySource.attribution}
                      </span>
                    </p>
                  )}

                  <dl className="flex items-baseline gap-2 text-sm">
                    <dt className="text-slate-500 dark:text-slate-400">찍은 꼭짓점</dt>
                    <dd className="font-medium text-slate-900 tabular-nums dark:text-slate-100">
                      {areaVertices.length}개
                    </dd>
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAreaVertices((v) => v.slice(0, -1))}
                      disabled={areaVertices.length === 0}
                      className={secondaryButtonClass}
                    >
                      마지막 점 취소
                    </button>
                    <button
                      type="button"
                      onClick={() => setAreaVertices([])}
                      disabled={areaVertices.length === 0}
                      className={secondaryButtonClass}
                    >
                      전부 지우기
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCommitArea}
                    disabled={areaVertices.length < MIN_AREA_VERTEX_COUNT}
                    className={primaryButtonClass}
                  >
                    {areaVertices.length < MIN_AREA_VERTEX_COUNT
                      ? `꼭짓점을 ${MIN_AREA_VERTEX_COUNT - areaVertices.length}개 더 찍어주세요`
                      : '영역 확정하고 선 긋기'}
                  </button>

                  <button type="button" onClick={() => handleGoBack(2)} className={secondaryButtonClass}>
                    ← 건물로
                  </button>
                </>
              ) : (
                <>
                  <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    구역을 나눌 자리에 <strong className="font-medium text-slate-900 dark:text-slate-100">두 점을 찍어</strong>{' '}
                    선을 만듭니다. 선은 직선으로 늘어나므로 영역을 가로지르는 짧은 획이면 됩니다.
                    선 {cutLines.length}개 → 구역 {zoneCount}개.
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      지금 긋는 선{' '}
                      <span className="font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {lineDraft.length} / {CUT_LINE_POINT_COUNT}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAddCutLine}
                      disabled={lineDraft.length !== CUT_LINE_POINT_COUNT}
                      className={secondaryButtonClass}
                    >
                      선 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => setLineDraft([])}
                      disabled={lineDraft.length === 0}
                      className={secondaryButtonClass}
                    >
                      지금 선 지우기
                    </button>
                  </div>

                  {cutLines.length === 0 ? (
                    <p className="rounded border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      아직 그은 선이 없습니다. 선을 하나도 긋지 않으면 구역을 나눌 수 없습니다.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {cutLines.map((line, index) => (
                        <li
                          key={`${line[0][0]}-${line[0][1]}-${index}`}
                          className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                        >
                          <span className="text-slate-600 dark:text-slate-400">
                            선 {index + 1}
                            <span className="ml-2 font-mono text-slate-400 dark:text-slate-500">
                              {line[0][0].toFixed(5)}, {line[0][1].toFixed(5)}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCutLine(index)}
                            className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            삭제
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {cutLines.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        구역 이름 (북쪽 → 남쪽 순서)
                      </legend>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        전부 비워두면 "구역 1"부터 자동으로 붙습니다.
                      </p>
                      {Array.from({ length: zoneCount }, (_, index) => (
                        <input
                          key={index}
                          type="text"
                          value={zoneNames[index] ?? ''}
                          onChange={(e) =>
                            setZoneNames((previous) => {
                              const next = [...previous];
                              next.length = zoneCount;
                              next[index] = e.target.value;
                              return Array.from(next, (value) => value ?? '');
                            })
                          }
                          maxLength={50}
                          placeholder={`구역 ${index + 1}`}
                          aria-label={`북쪽에서 ${index + 1}번째 구역 이름`}
                          className={inputClass}
                        />
                      ))}
                    </fieldset>
                  )}

                  <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleSplitZones}
                      disabled={cutLines.length === 0 || saving}
                      className={primaryButtonClass}
                    >
                      {saving ? '만드는 중...' : `구역 ${zoneCount}개 만들기`}
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleRedrawArea} className={secondaryButtonClass}>
                        영역부터 다시 그리기
                      </button>
                      <button type="button" onClick={() => handleGoBack(2)} className={secondaryButtonClass}>
                        ← 건물로
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {existingZoneCount > 0
                    ? '구역을 더 만들지 않아도 됩니다. 기존 구역을 그대로 두고 완료할 수 있습니다.'
                    : '구역 없이 완료하면 시뮬레이션과 CCTV 구역 등록을 할 수 없습니다.'}
                </p>
                <button type="button" onClick={handleSkipZones} className={secondaryButtonClass}>
                  건너뛰고 완료
                </button>
              </div>
            </div>
          )}

          {/* 2단계(건물). 위 구역 블록보다 화면에서는 먼저 나온다. */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">건물 불러오기</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {market?.marketName}
                  <span className="ml-1.5 font-mono text-slate-400 dark:text-slate-500">{market?.marketCode}</span>
                </p>
              </div>

              <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                시뮬레이션은 <strong className="font-medium text-slate-900 dark:text-slate-100">구역에서 건물을 뺀 공간</strong>을
                실제 통로로 봅니다. 건물 자리는 구역 안에 있어도 사람이 다닐 수 없습니다. 건물을 먼저 받아두면
                다음 단계에서 지도에 깔려서, 어디가 골목인지 보면서 구역을 나눌 수 있습니다.
                국토교통부 브이월드에서 받아옵니다.
              </p>

              {existingBuildingCount > 0 && (
                <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  이미 건물{' '}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    {existingBuildingCount}개
                  </strong>
                  가 등록돼 있어 지도에 회색으로 표시했습니다. 그대로 쓰려면 아래{' '}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">건너뛰고 구역 나누기</strong>
                  를 누르세요. 다시 받으면 기존 건물을 지우고 새로 넣습니다.
                </p>
              )}

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">받아올 범위</span>
                {boxCorners.length === 2 ? (
                  <p className="rounded border border-violet-300 bg-violet-50 px-2.5 py-2 text-xs text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                    지도에 그린 보라색 사각형 안의 건물만 받습니다.
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    지도에서 두 점을 찍어 사각형을 그리세요 ({boxCorners.length}/2). 시장 골목은 한쪽으로 길어서
                    사각형으로 집어내면 상관없는 건물이 훨씬 덜 딸려옵니다. 그리지 않으면 아래 반경으로 받습니다.
                  </p>
                )}
                {boxCorners.length > 0 && (
                  <button type="button" onClick={() => setBoxCorners([])} className={secondaryButtonClass}>
                    범위 지우기
                  </button>
                )}
              </div>

              {boxCorners.length < 2 && (
                <Field
                  label="반경"
                  htmlFor="radiusMeters"
                  hint="시장 중심에서 이 거리 안의 건물을 가져옵니다. 원이라 사방이 함께 들어옵니다."
                >
                  <div className="flex items-center gap-2">
                    <input
                      id="radiusMeters"
                      type="number"
                      min={50}
                      max={1000}
                      step={10}
                      value={radiusMeters}
                      onChange={(e) => setRadiusMeters(Number(e.target.value))}
                      className={inputClass}
                    />
                    <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">m</span>
                  </div>
                </Field>
              )}

              <button
                type="button"
                onClick={handleImportBuildings}
                disabled={saving || (boxCorners.length < 2 && (radiusMeters < 50 || radiusMeters > 1000))}
                className={primaryButtonClass}
              >
                {saving
                  ? '브이월드에서 받는 중...'
                  : existingBuildingCount > 0
                    ? `다시 받기 (기존 ${existingBuildingCount}개 삭제)`
                    : '건물 불러오기'}
              </button>

              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  서버에 브이월드 인증키가 없으면 이 단계는 실패합니다. 건너뛰어도 구역은 나눌 수 있고, 건물 없이도
                  시뮬레이션은 돌아갑니다. 다만 사람이 건물 자리를 통과하는 것으로 계산됩니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleSkipBuildings} className={secondaryButtonClass}>
                    건너뛰고 구역 나누기
                  </button>
                  <button type="button" onClick={() => handleGoBack(1)} className={secondaryButtonClass}>
                    ← 시장 정보로
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">등록 완료</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {createdZones.length > 0
                    ? `${market?.marketName}에 구역 ${createdZones.length}개가 만들어졌습니다.`
                    : existingZoneCount > 0
                      ? `새 구역 없이 완료했습니다. ${market?.marketName}의 기존 구역 ${existingZoneCount}개를 그대로 사용합니다.`
                      : `${market?.marketName}에 아직 구역이 없습니다. 시뮬레이션·CCTV 구역 등록을 하려면 구역을 나눠야 합니다.`}
                </p>
              </div>

              <ul className="space-y-1.5">
                {createdZones.map((zone) => (
                  <li
                    key={zone.zoneId}
                    className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  >
                    <span className="text-slate-900 dark:text-slate-100">{zone.zoneName}</span>
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                      zone_id {zone.zoneId}
                    </span>
                  </li>
                ))}
              </ul>

              {buildingResult ? (
                <dl className="rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex justify-between py-0.5">
                    <dt className="text-slate-500 dark:text-slate-400">불러온 건물</dt>
                    <dd className="text-slate-900 tabular-nums dark:text-slate-100">
                      {buildingResult.fetchedFeatures}건
                    </dd>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <dt className="text-slate-500 dark:text-slate-400">저장된 폴리곤</dt>
                    <dd className="text-slate-900 tabular-nums dark:text-slate-100">
                      {buildingResult.savedBuildings}개
                    </dd>
                  </div>
                  {buildingResult.skippedDuplicates > 0 && (
                    <div className="flex justify-between py-0.5">
                      <dt className="text-slate-500 dark:text-slate-400">중복 제외</dt>
                      <dd className="text-slate-900 tabular-nums dark:text-slate-100">
                        {buildingResult.skippedDuplicates}개
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between py-0.5">
                    <dt className="text-slate-500 dark:text-slate-400">반경</dt>
                    <dd className="text-slate-900 tabular-nums dark:text-slate-100">
                      {buildingResult.radiusMeters}m
                    </dd>
                  </div>
                  {buildingResult.skippedDuplicates > 0 && (
                    <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      이미 등록된 건물은 건너뜁니다. 이웃 시장과 반경이 겹치면 생깁니다.
                    </p>
                  )}
                </dl>
              ) : (
                <p className="rounded border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  건물은 불러오지 않았습니다. 시뮬레이션은 돌아가지만, 사람이 상가 자리를 통과하는 것으로 계산됩니다.
                </p>
              )}

              {pruneResult?.dryRun && pruneResult.outsideBuildings > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                  <h3 className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    시장에서 먼 건물이 있습니다
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    건물은 시장 중심에서 <strong className="font-medium">반경</strong>으로 받아오기 때문에 시장과
                    상관없는 건물이 섞입니다. 구역에서 {pruneResult.bufferMeters}m 넘게 떨어진 건물이{' '}
                    <strong className="font-medium">{pruneResult.outsideBuildings}개</strong> 있습니다. 시뮬레이션
                    결과에는 영향이 없지만 지도가 지저분해집니다.
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                      여유 거리
                      <input
                        type="number"
                        min={0}
                        max={500}
                        step={10}
                        value={pruneBufferMeters}
                        onChange={(e) => setPruneBufferMeters(Number(e.target.value))}
                        onBlur={() => market && countDistantBuildings(market.marketId, pruneBufferMeters)}
                        className="w-20 rounded border border-amber-400 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-700 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      m
                    </label>
                    <button
                      type="button"
                      onClick={handlePruneBuildings}
                      disabled={saving}
                      className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:focus:ring-offset-slate-900"
                    >
                      {saving ? '지우는 중...' : `${pruneResult.outsideBuildings}개 지우기`}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                    지운 건물은 되돌릴 수 없습니다. 여유 거리를 바꾸면 대상 수가 다시 계산됩니다.
                  </p>
                </div>
              )}

              {pruneResult && !pruneResult.dryRun && (
                <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  먼 건물 {pruneResult.outsideBuildings}개를 정리했습니다. 남은 건물{' '}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    {pruneResult.keptBuildings}개
                  </strong>
                  가 시장 주변에 있습니다.
                </p>
              )}

              <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <h3 className="text-xs font-medium text-slate-900 dark:text-slate-100">다음에 할 일</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  출입구·상점과 CCTV 관제 구역은 시장 구조 등록 화면에서 이어서 넣습니다. CCTV는 방금 만든
                  구역 안에만 그릴 수 있습니다.
                </p>
                <Link
                  to="/facilities"
                  className="mt-2.5 inline-block rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 dark:focus:ring-offset-slate-900"
                >
                  시장 구조 등록으로 이동
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleRegisterAnother} className={secondaryButtonClass}>
                  다른 시장 또 등록하기
                </button>
                {/* 이미 만들어진 구역은 그대로 두고 화면만 되돌린다. 거기서 선을 더 그으면
                    구역이 추가되므로, 3단계가 기존 구역 수를 경고로 알려준다. */}
                <button type="button" onClick={() => handleGoBack(3)} className={secondaryButtonClass}>
                  ← 구역 나누기로
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800';

const primaryButtonClass =
  'flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:focus:ring-offset-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400';

const secondaryButtonClass =
  'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:text-slate-600';

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

// 2026-08-14 순서 변경: 건물을 구역보다 먼저 받는다. 시뮬레이션이 "구역 - 건물"을
// 통로로 보기 때문에, 건물이 지도에 깔린 상태에서 구역을 나눠야 어디가 실제로 걸을 수
// 있는 공간인지 보면서 그릴 수 있다.
const STEP_LABELS: Record<Step, string> = {
  1: '시장 정보',
  2: '건물',
  3: '구역 나누기',
  4: '완료',
};

/**
 * 순서가 강제되는 흐름이라 번호가 정보다 - 지금 어디고 무엇이 남았는지 보여준다.
 *
 * 2026-08-14: 지나온 단계는 눌러서 돌아갈 수 있다. 앞 단계는 누를 수 없다 - 각 단계가
 * 앞 단계의 결과(marketId, 구역)를 전제로 하기 때문에 건너뛰면 빈 화면이 된다.
 */
function StepBar({ current, onGoBack }: { current: Step; onGoBack: (step: Step) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {([1, 2, 3, 4] as Step[]).map((step, index) => {
        const isCurrent = step === current;
        const isDone = step < current;

        const label = (
          <>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${
                isCurrent
                  ? 'bg-blue-600 text-white'
                  : isDone
                    ? 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              {step}
            </span>
            {STEP_LABELS[step]}
          </>
        );

        return (
          <li key={step} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true" className="h-px w-5 bg-slate-300 dark:bg-slate-700" />}
            {isDone ? (
              <button
                type="button"
                onClick={() => onGoBack(step)}
                aria-label={`${step}단계 ${STEP_LABELS[step]}(으)로 돌아가기`}
                className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {label}
              </button>
            ) : (
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-sm ${
                  isCurrent
                    ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                    : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function mapHintFor(step: Step, drawPhase: DrawPhase): string {
  if (step === 1) return '시장 이름으로 찾은 뒤, 지도에서 중심을 클릭하세요. 좌표를 직접 입력해도 됩니다.';
  if (step === 2)
    return '두 점을 찍어 건물을 받아올 사각형 범위를 정하세요. 그리지 않으면 반경으로 받습니다. 회색은 이미 등록된 건물입니다.';
  if (step === 3 && drawPhase === 'area')
    return '골목을 따라 클릭해 시장 영역을 그리세요. 회색 건물 자리는 영역 안이어도 사람이 다닐 수 없습니다.';
  if (step === 3) return '구역을 나눌 자리에 두 점을 찍어 선을 그으세요. 확정한 선은 청록색으로 남습니다.';
  return '만들어진 구역입니다.';
}
