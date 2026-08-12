import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Spinner from './ui/Spinner';
import ErrorBanner from './ui/ErrorBanner';
import FacilityLocationPicker from './FacilityLocationPicker';
import type { SimulationZoneOverlay } from './FacilityLocationPicker';
import { geoJsonToVertices } from '../utils/cctvZonePolygon';
import { isPointInPolygon } from '../utils/polygonGeometry';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { Zone, PlacedObject, CorridorPolicy } from '../types';
import {
  fetchZones,
  fetchFacilities,
  createFacility,
  updateFacility,
  deleteFacility,
  fetchMarketObjects,
  saveMarketObjects,
} from '../api/client';
import type { Facility } from '../api/client';

// 2026-08-11 신규: 시장 구조 등록 화면의 "시장 오브젝트" 대상 전용 편집기.
//
// "출입구를 시장 오브젝트로 흡수"(재재님 결정)에 따라, 화면상 하나의 대상 안에서
// 하위 종류를 골라 편집한다. 종류마다 저장소가 다르다(컬럼 통일 X):
//   - 출입구(GATE)                         → mrkfcts01m (facility API). 개방/폐쇄.
//   - 푸드트럭/행사존/휴게공간/장애물       → mrkobjt01m.objects (market-objects API). 강도.
//   - 통로 제어 정책                        → mrkobjt01m.corridorPolicies. 구역 쌍 + 동작.
//
// 오브젝트/정책은 시장당 1세트라 전체를 로드해 편집 후 통째로 저장(PUT)한다.

interface MarketObjectEditorProps {
  marketId: number;
  centerLat: number;
  centerLng: number;
}

type SubKind = 'GATE' | 'food_truck' | 'event_zone' | 'rest_area' | 'obstacle' | 'corridor';

const SUB_KINDS: { key: SubKind; label: string; group: 'gate' | 'object' | 'corridor' }[] = [
  { key: 'GATE', label: '출입구', group: 'gate' },
  { key: 'food_truck', label: '푸드트럭', group: 'object' },
  { key: 'event_zone', label: '행사존', group: 'object' },
  { key: 'rest_area', label: '휴게 공간', group: 'object' },
  { key: 'obstacle', label: '장애물/적재물', group: 'object' },
  { key: 'corridor', label: '통로 제어 정책', group: 'corridor' },
];

const OBJECT_TYPE_LABELS: Record<string, string> = {
  food_truck: '푸드트럭',
  event_zone: '행사존',
  rest_area: '휴게 공간',
  obstacle: '장애물/적재물',
};

const CORRIDOR_ACTION_OPTIONS = [
  { value: 'close', label: '폐쇄' },
  { value: 'open', label: '개방' },
  { value: 'one_way', label: '일방통행' },
];

function corridorActionLabel(action: string): string {
  return CORRIDOR_ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

export default function MarketObjectEditor({
  marketId,
  centerLat,
  centerLng,
}: MarketObjectEditorProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [gates, setGates] = useState<Facility[]>([]);
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [corridorPolicies, setCorridorPolicies] = useState<CorridorPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [subKind, setSubKind] = useState<SubKind>('GATE');
  const currentSub = SUB_KINDS.find((s) => s.key === subKind) ?? SUB_KINDS[0];

  // 지도 클릭 좌표(출입구/오브젝트 배치용)
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);

  // 출입구 폼
  const [editingGateId, setEditingGateId] = useState<number | null>(null);
  const [gateName, setGateName] = useState('');
  const [gateOpen, setGateOpen] = useState(true);

  // 오브젝트 폼
  const [objectIntensity, setObjectIntensity] = useState(0.5);

  // 통로 정책 폼
  const [fromZoneId, setFromZoneId] = useState<number | undefined>(undefined);
  const [toZoneId, setToZoneId] = useState<number | undefined>(undefined);
  const [corridorAction, setCorridorAction] = useState('close');

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadAll = () => {
    setIsLoading(true);
    setLoadError('');
    Promise.allSettled([
      fetchZones(marketId),
      fetchFacilities(marketId),
      fetchMarketObjects(marketId),
    ])
      .then(([zoneResult, facilityResult, objResult]) => {
        if (zoneResult.status === 'fulfilled') setZones(zoneResult.value);
        if (facilityResult.status === 'fulfilled') {
          setGates(facilityResult.value.filter((f) => f.facilityType === 'GATE'));
        }
        if (objResult.status === 'fulfilled') {
          setObjects(objResult.value.objects);
          setCorridorPolicies(objResult.value.corridorPolicies);
        }
        const failed = [zoneResult, facilityResult, objResult].find((r) => r.status === 'rejected');
        if (failed && failed.status === 'rejected') {
          setLoadError(toDisplayErrorMessage(failed.reason, '시장 오브젝트를 불러오지 못했습니다.'));
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(loadAll, [marketId]);

  // 소속 구역 기본값
  useEffect(() => {
    if (zones.length > 0) {
      setFromZoneId((prev) => prev ?? zones[0].zoneId);
      setToZoneId((prev) => prev ?? zones[Math.min(1, zones.length - 1)].zoneId);
    }
  }, [zones]);

  // 종류를 바꾸면 편집 상태 초기화
  useEffect(() => {
    setEditingGateId(null);
    setGateName('');
    setGateOpen(true);
    setObjectIntensity(0.5);
    setPickedLat(null);
    setPickedLng(null);
    setFormError('');
  }, [subKind]);

  const zoneName = (zoneId: number) => zones.find((z) => z.zoneId === zoneId)?.zoneName ?? `구역 ${zoneId}`;

  // 클릭 좌표가 속한 시뮬레이션 구역(오브젝트의 zoneId 자동 판정)
  function findZoneAt(lat: number, lng: number): number | undefined {
    for (const z of zones) {
      const ring = geoJsonToVertices(z.polygonCoordinates);
      if (ring.length >= 3 && isPointInPolygon([lat, lng], ring)) return z.zoneId;
    }
    return undefined;
  }

  // 지도 배경: 구역을 회색 점선으로 깔아 오브젝트 배치 참고가 되게 한다.
  const simulationZoneOverlays: SimulationZoneOverlay[] = useMemo(
    () =>
      zones.map((z) => ({
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        vertices: geoJsonToVertices(z.polygonCoordinates),
      })),
    [zones]
  );

  // 지도 마커: 출입구 + 좌표가 있는 오브젝트. 출입구는 클릭 시 수정.
  const mapMarkers = useMemo(() => {
    const gateMarkers = gates
      .filter((g) => g.facilityId !== editingGateId)
      .map((g) => ({
        facilityId: g.facilityId,
        name: `[출입구] ${g.name}`,
        latitude: g.latitude,
        longitude: g.longitude,
        isActive: g.isActive,
      }));
    // 오브젝트 마커는 음수 인덱스 id로 두어 출입구와 구분(클릭 수정은 안 함).
    const objectMarkers = objects
      .filter((o) => o.latitude != null && o.longitude != null)
      .map((o, i) => ({
        facilityId: -(i + 1),
        name: `[${OBJECT_TYPE_LABELS[o.objectType] ?? o.objectType}] 강도 ${o.intensity ?? 0}`,
        latitude: o.latitude as number,
        longitude: o.longitude as number,
        isActive: true,
      }));
    return [...gateMarkers, ...objectMarkers];
  }, [gates, objects, editingGateId]);

  function handleMapPick(lat: number, lng: number) {
    setPickedLat(lat);
    setPickedLng(lng);
  }

  function startEditGate(gate: Facility) {
    setSubKind('GATE');
    setEditingGateId(gate.facilityId);
    setGateName(gate.name);
    setGateOpen(gate.isActive);
    setPickedLat(gate.latitude);
    setPickedLng(gate.longitude);
    setFormError('');
  }

  // mrkobjt01m 세트를 통째로 저장(오브젝트/정책 공용).
  async function persistConfig(nextObjects: PlacedObject[], nextPolicies: CorridorPolicy[]) {
    await saveMarketObjects({ marketId, objects: nextObjects, corridorPolicies: nextPolicies });
    setObjects(nextObjects);
    setCorridorPolicies(nextPolicies);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    // ---- 출입구 ----
    if (currentSub.group === 'gate') {
      if (pickedLat == null || pickedLng == null) {
        setFormError('지도를 클릭해 출입구 위치를 지정해주세요.');
        return;
      }
      if (!gateName.trim()) {
        setFormError('출입구 이름을 입력해주세요.');
        return;
      }
      setIsSaving(true);
      try {
        const payload = {
          facilityType: 'GATE',
          name: gateName.trim(),
          latitude: pickedLat,
          longitude: pickedLng,
          isActive: gateOpen,
        };
        if (editingGateId) {
          await updateFacility(editingGateId, payload);
        } else {
          await createFacility({ marketId, ...payload });
        }
        setEditingGateId(null);
        setGateName('');
        setPickedLat(null);
        setPickedLng(null);
        loadAll();
      } catch (err) {
        setFormError(toDisplayErrorMessage(err, '출입구 저장에 실패했습니다.'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // ---- 오브젝트 배치 ----
    if (currentSub.group === 'object') {
      if (pickedLat == null || pickedLng == null) {
        setFormError('지도를 클릭해 배치 위치를 지정해주세요.');
        return;
      }
      const zoneId = findZoneAt(pickedLat, pickedLng);
      if (zoneId === undefined) {
        setFormError('클릭한 위치가 어느 시뮬레이션 구역에도 속하지 않습니다. 구역 안을 클릭해주세요.');
        return;
      }
      setIsSaving(true);
      try {
        const next: PlacedObject = {
          objectType: subKind as PlacedObject['objectType'],
          zoneId,
          intensity: objectIntensity,
          latitude: pickedLat,
          longitude: pickedLng,
        };
        await persistConfig([...objects, next], corridorPolicies);
        setPickedLat(null);
        setPickedLng(null);
      } catch (err) {
        setFormError(toDisplayErrorMessage(err, '오브젝트 저장에 실패했습니다.'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // ---- 통로 제어 정책 ----
    if (fromZoneId === undefined || toZoneId === undefined) {
      setFormError('출발/도착 구역을 선택해주세요.');
      return;
    }
    if (fromZoneId === toZoneId) {
      setFormError('출발 구역과 도착 구역이 같을 수 없습니다.');
      return;
    }
    setIsSaving(true);
    try {
      const next: CorridorPolicy = {
        fromZoneId,
        toZoneId,
        action: corridorAction as CorridorPolicy['action'],
      };
      await persistConfig(objects, [...corridorPolicies, next]);
    } catch (err) {
      setFormError(toDisplayErrorMessage(err, '통로 정책 저장에 실패했습니다.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteGate(gate: Facility) {
    if (!window.confirm(`"${gate.name}" 출입구를 삭제할까요?`)) return;
    try {
      await deleteFacility(gate.facilityId);
      if (editingGateId === gate.facilityId) setEditingGateId(null);
      loadAll();
    } catch (err) {
      setLoadError(toDisplayErrorMessage(err, '삭제에 실패했습니다.'));
    }
  }

  async function handleDeleteObject(index: number) {
    if (!window.confirm('이 오브젝트를 삭제할까요?')) return;
    try {
      await persistConfig(objects.filter((_, i) => i !== index), corridorPolicies);
    } catch (err) {
      setFormError(toDisplayErrorMessage(err, '삭제에 실패했습니다.'));
    }
  }

  async function handleDeletePolicy(index: number) {
    if (!window.confirm('이 통로 정책을 삭제할까요?')) return;
    try {
      await persistConfig(objects, corridorPolicies.filter((_, i) => i !== index));
    } catch (err) {
      setFormError(toDisplayErrorMessage(err, '삭제에 실패했습니다.'));
    }
  }

  return (
    <div className="space-y-6">
      {loadError && <ErrorBanner message={loadError} onRetry={loadAll} />}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* 지도 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            📍 지도에서 위치 클릭
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            {currentSub.group === 'corridor'
              ? '통로 제어 정책은 지도 클릭 대신 아래에서 출발/도착 구역을 선택합니다. 회색 점선은 시뮬레이션 구역입니다.'
              : '지도를 클릭해 위치를 지정합니다. 배치된 오브젝트/출입구가 마커로 표시되며, 출입구 마커를 클릭하면 수정합니다.'}
          </p>
          <FacilityLocationPicker
            centerLat={centerLat}
            centerLng={centerLng}
            markers={mapMarkers}
            pickedLat={pickedLat}
            pickedLng={pickedLng}
            onPick={handleMapPick}
            simulationZones={simulationZoneOverlays}
            onMarkerClick={(facilityId) => {
              const gate = gates.find((g) => g.facilityId === facilityId);
              if (gate) startEditGate(gate);
            }}
          />
        </section>

        {/* 폼 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {editingGateId ? '✏️ 출입구 수정' : `🧩 ${currentSub.label} 등록`}
          </h2>

          {/* 하위 종류 선택 */}
          <div className="mb-4 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <label
              htmlFor="subkind-select"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              종류
            </label>
            <select
              id="subkind-select"
              value={subKind}
              onChange={(e) => setSubKind(e.target.value as SubKind)}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {SUB_KINDS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {currentSub.group === 'gate'
                ? '출입구는 시설로 저장됩니다(개방/폐쇄).'
                : currentSub.group === 'object'
                  ? '오브젝트는 시뮬레이션 초기 배치로 저장됩니다(강도 포함).'
                  : '통로 정책은 구역 사이 이동 제어로 저장됩니다.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {currentSub.group === 'gate' && (
              <>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">출입구 이름</label>
                  <input
                    value={gateName}
                    onChange={(e) => setGateName(e.target.value)}
                    placeholder="예: 남문 출입구"
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <PickedCoords lat={pickedLat} lng={pickedLng} />
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={gateOpen} onChange={(e) => setGateOpen(e.target.checked)} />
                  개방 (체크 해제 시 폐쇄)
                </label>
              </>
            )}

            {currentSub.group === 'object' && (
              <>
                <PickedCoords lat={pickedLat} lng={pickedLng} />
                {pickedLat != null && pickedLng != null && (
                  <p className="text-xs text-slate-500">
                    소속 구역:{' '}
                    {findZoneAt(pickedLat, pickedLng) !== undefined
                      ? zoneName(findZoneAt(pickedLat, pickedLng) as number)
                      : '⚠️ 구역 밖 (구역 안을 클릭하세요)'}
                  </p>
                )}
                <div>
                  <label className="mb-1 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>강도 (intensity)</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {objectIntensity.toFixed(2)}
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={objectIntensity}
                    onChange={(e) => setObjectIntensity(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {currentSub.group === 'corridor' && (
              <>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">출발 구역</label>
                    <select
                      value={fromZoneId ?? ''}
                      onChange={(e) => setFromZoneId(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {zones.map((z) => (
                        <option key={z.zoneId} value={z.zoneId}>
                          {z.zoneName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">도착 구역</label>
                    <select
                      value={toZoneId ?? ''}
                      onChange={(e) => setToZoneId(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {zones.map((z) => (
                        <option key={z.zoneId} value={z.zoneId}>
                          {z.zoneName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">제어 동작</label>
                  <select
                    value={corridorAction}
                    onChange={(e) => setCorridorAction(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {CORRIDOR_ACTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
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
                {isSaving ? '저장 중...' : editingGateId ? '수정 완료' : `+ ${currentSub.label} 추가`}
              </button>
              {editingGateId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingGateId(null);
                    setGateName('');
                    setPickedLat(null);
                    setPickedLng(null);
                  }}
                  className="rounded border border-slate-300 dark:border-slate-700 px-4 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {/* 목록 - 종류 그룹별로 */}
      {isLoading ? (
        <Spinner label="시장 오브젝트를 불러오는 중..." />
      ) : (
        <>
          {currentSub.group === 'gate' && (
            <ListSection title="📋 등록된 출입구" count={gates.length}>
              {gates.length === 0 ? (
                <EmptyRow text="등록된 출입구가 없어요. 지도를 클릭해 등록해보세요." />
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">이름</th>
                      <th className="px-3 py-2">위도 / 경도</th>
                      <th className="px-3 py-2">개방</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {gates.map((g) => (
                      <tr key={g.facilityId} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{g.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                          {g.latitude.toFixed(6)}, {g.longitude.toFixed(6)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge active={g.isActive} on="개방" off="폐쇄" />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => startEditGate(g)}
                            className="mr-2 text-slate-600 dark:text-slate-400 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGate(g)}
                            className="text-red-600 dark:text-red-400 hover:underline"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ListSection>
          )}

          {currentSub.group === 'object' && (
            <ListSection title="📋 배치된 오브젝트" count={objects.length}>
              {objects.length === 0 ? (
                <EmptyRow text="배치된 오브젝트가 없어요. 종류를 고르고 지도를 클릭해 배치해보세요." />
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">종류</th>
                      <th className="px-3 py-2">소속 구역</th>
                      <th className="px-3 py-2">강도</th>
                      <th className="px-3 py-2">위도 / 경도</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {objects.map((o, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                          {OBJECT_TYPE_LABELS[o.objectType] ?? o.objectType}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{zoneName(o.zoneId)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                          {(o.intensity ?? 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                          {o.latitude != null && o.longitude != null
                            ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}`
                            : '구역 대표점'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteObject(i)}
                            className="text-red-600 dark:text-red-400 hover:underline"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ListSection>
          )}

          {currentSub.group === 'corridor' && (
            <ListSection title="📋 통로 제어 정책" count={corridorPolicies.length}>
              {corridorPolicies.length === 0 ? (
                <EmptyRow text="등록된 통로 정책이 없어요. 출발/도착 구역과 동작을 골라 추가해보세요." />
              ) : (
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">출발 구역</th>
                      <th className="px-3 py-2">도착 구역</th>
                      <th className="px-3 py-2">동작</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {corridorPolicies.map((p, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{zoneName(p.fromZoneId)}</td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{zoneName(p.toZoneId)}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          {corridorActionLabel(p.action)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeletePolicy(i)}
                            className="text-red-600 dark:text-red-400 hover:underline"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ListSection>
          )}
        </>
      )}
    </div>
  );
}

function PickedCoords({ lat, lng }: { lat: number | null; lng: number | null }) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">위도</label>
        <input
          readOnly
          value={lat ?? ''}
          placeholder="지도를 클릭하세요"
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300"
        />
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">경도</label>
        <input
          readOnly
          value={lng ?? ''}
          placeholder="지도를 클릭하세요"
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300"
        />
      </div>
    </div>
  );
}

function ListSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
        <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-blue-500/10 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
          {count}개
        </span>
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-slate-500">{text}</p>;
}

function StatusBadge({ active, on, off }: { active: boolean; on: string; off: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${
        active
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-slate-300 dark:border-slate-700 text-slate-500'
      }`}
    >
      {active ? on : off}
    </span>
  );
}
