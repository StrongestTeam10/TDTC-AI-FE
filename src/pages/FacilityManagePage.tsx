import { useEffect, useState, type FormEvent } from 'react';
import TabButton from '../components/ui/TabButton';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import FacilityLocationPicker from '../components/FacilityLocationPicker';
import { useAuthStore } from '../store/authStore';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import type { Market } from '../types';
import {
  fetchMarkets,
  fetchFacilities,
  createFacility,
  updateFacility,
  deleteFacility,
  previewFacilityPhotoExif,
  saveFacilityPhoto,
  fetchFacilityPhotos,
  deleteFacilityPhoto,
} from '../api/client';
import type { Facility, FacilityPhoto } from '../api/client';

// 2026-08-04 추가 (상점 위치 등록 화면)
//
// store-location-prototype.html(손그림 와이어프레임)을 실제 사이트 톤에 맞춰
// 재구현. mrkfcts01m 컬럼 기준으로 폼을 구성하고, "층/위치 메모"는 별도 컬럼을
// 새로 만들지 않고 하나의 비고(rmk)란으로 합쳐서 받음(재재님 결정).
// 3D 트윈 관련 기능(외관 촬영 방향별 텍스처 등)은 이번 화면 범위에 포함하지 않음 -
// 사진은 지금은 시설당 참고 이미지를 모아두는 용도로만 씀.
//
// 접근 권한: 관리자(ROL01) 또는 상인회(orgCode='ORGMA')만 이 화면에 들어올 수 있음
// (App.tsx 라우트에서 가드, Header.tsx도 이 두 그룹에게만 탭을 보여줌). 그 외 역할이
// 어떻게든 API를 직접 호출해도 BE FacilityService/FacilityPhotoService가 403으로 막음.

const FACILITY_TYPE_OPTIONS = [
  { value: 'STALL', label: '상점 (일반 점포)' },
  { value: 'RESTAURANT', label: '음식점' },
  { value: 'RESTROOM', label: '화장실' },
  { value: 'GATE', label: '출입구' },
  { value: 'OTHER', label: '기타 시설' },
];

const DIRECTION_OPTIONS = [
  { value: 'DIRNO', label: '북' },
  { value: 'DIREA', label: '동' },
  { value: 'DIRSO', label: '남' },
  { value: 'DIRWE', label: '서' },
];

function facilityTypeLabel(value: string): string {
  return FACILITY_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
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

export default function FacilityManagePage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.rulesCode === 'ROL01';

  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<number | undefined>(undefined);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ---- 등록/수정 폼 ----
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ---- 사진 관리(선택된 시설 1건에 대해) ----
  const [photoTarget, setPhotoTarget] = useState<Facility | null>(null);
  const [photos, setPhotos] = useState<FacilityPhoto[]>([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
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

  const loadFacilities = () => {
    if (selectedMarketId === undefined) return;
    setIsLoading(true);
    setLoadError('');
    fetchFacilities(selectedMarketId)
      .then(setFacilities)
      .catch((err) => setLoadError(toDisplayErrorMessage(err, '시설 목록을 불러오지 못했습니다.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(loadFacilities, [selectedMarketId]);

  const selectedMarket = markets.find((m) => m.marketId === selectedMarketId);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setPickedLat(null);
    setPickedLng(null);
    setFormError('');
  }

  function startEdit(facility: Facility) {
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    if (selectedMarketId === undefined) {
      setFormError('시장을 먼저 선택해주세요.');
      return;
    }
    if (pickedLat == null || pickedLng == null) {
      setFormError('지도를 클릭해서 위치를 지정해주세요.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('상점명을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateFacility(editingId, {
          facilityType: form.facilityType,
          name: form.name.trim(),
          latitude: pickedLat,
          longitude: pickedLng,
          isActive: form.isActive,
          rmk: form.rmk.trim() || undefined,
        });
      } else {
        await createFacility({
          marketId: selectedMarketId,
          facilityType: form.facilityType,
          name: form.name.trim(),
          latitude: pickedLat,
          longitude: pickedLng,
          isActive: form.isActive,
          rmk: form.rmk.trim() || undefined,
        });
      }
      resetForm();
      loadFacilities();
    } catch (err) {
      setFormError(toDisplayErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(facility: Facility) {
    if (!window.confirm(`"${facility.name}"을(를) 삭제할까요? 등록된 사진도 함께 삭제됩니다.`)) return;
    try {
      await deleteFacility(facility.facilityId);
      if (editingId === facility.facilityId) resetForm();
      if (photoTarget?.facilityId === facility.facilityId) setPhotoTarget(null);
      loadFacilities();
    } catch (err) {
      setLoadError(toDisplayErrorMessage(err, '삭제에 실패했습니다.'));
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
      const [refreshedPhotos] = await Promise.all([
        fetchFacilityPhotos(photoTarget.facilityId),
        loadFacilities(),
      ]);
      setPhotos(refreshedPhotos);
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
      loadFacilities();
    } catch (err) {
      setPhotoError(toDisplayErrorMessage(err, '사진 삭제에 실패했습니다.'));
    }
  }

  const mapMarkers = facilities
    .filter((f) => f.facilityId !== editingId)
    .map((f) => ({
      facilityId: f.facilityId,
      name: f.name,
      latitude: f.latitude,
      longitude: f.longitude,
      isActive: f.isActive,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">상점 위치 등록</h1>
      </div>

      {isAdmin && markets.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {markets.map((m) => (
            <TabButton
              key={m.marketId}
              active={selectedMarketId === m.marketId}
              onClick={() => {
                setSelectedMarketId(m.marketId);
                resetForm();
                setPhotoTarget(null);
              }}
              small
            >
              {m.marketName}
            </TabButton>
          ))}
        </div>
      )}

      {loadError && <ErrorBanner message={loadError} onRetry={loadFacilities} />}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* 지도 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            📍 지도에서 위치 클릭
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            지도를 클릭하면 위경도가 자동으로 입력됩니다. 파란 마커는 기존 등록 시설, 빨간 마커는 지금 선택한 위치입니다.
          </p>
          {selectedMarket && (
            <FacilityLocationPicker
              centerLat={selectedMarket.latitude}
              centerLng={selectedMarket.longitude}
              markers={mapMarkers}
              pickedLat={pickedLat}
              pickedLng={pickedLng}
              onPick={(lat, lng) => {
                setPickedLat(lat);
                setPickedLng(lng);
              }}
            />
          )}
        </section>

        {/* 등록/수정 폼 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {editingId ? '✏️ 상점 정보 수정' : '📝 상점 정보 입력'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">상점명</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: 원조 떡볶이"
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">업종 / 시설유형</label>
              <select
                value={form.facilityType}
                onChange={(e) => setForm((f) => ({ ...f, facilityType: e.target.value }))}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {FACILITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

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

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              영업중
            </label>

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
                {isSaving ? '저장 중...' : editingId ? '수정 완료' : '+ 상점 등록하기'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
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
          📋 등록된 상점 목록
          <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-blue-500/10 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
            {facilities.length}개
          </span>
        </h2>

        {isLoading ? (
          <Spinner label="시설 목록을 불러오는 중..." />
        ) : facilities.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            아직 등록된 상점이 없어요. 지도를 클릭해서 첫 상점을 등록해보세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">상점명</th>
                  <th className="whitespace-nowrap px-3 py-2">업종</th>
                  <th className="whitespace-nowrap px-3 py-2">위도 / 경도</th>
                  <th className="px-3 py-2">비고</th>
                  <th className="whitespace-nowrap px-3 py-2">상태</th>
                  <th className="whitespace-nowrap px-3 py-2">사진</th>
                  <th className="whitespace-nowrap px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr key={f.facilityId} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{f.name}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {facilityTypeLabel(f.facilityType)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {f.latitude.toFixed(6)}, {f.longitude.toFixed(6)}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-slate-600 dark:text-slate-400" title={f.rmk ?? ''}>
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
                        {f.isActive ? '영업중' : '휴업'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openPhotoPanel(f)}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {f.photoCount}장 관리
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        className="mr-2 text-slate-600 dark:text-slate-400 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
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
            좌표를 확인 후 저장해주세요. 방향(동서남북)은 촬영자가 직접 선택합니다. (3D 트윈 반영은 이번 범위에
            포함하지 않았습니다 - 참고 이미지 보관용입니다.)
          </p>

          {photoError && <ErrorBanner message={photoError} />}

          <div className="mb-4 grid gap-3 rounded border border-slate-200 dark:border-slate-800 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoFileChange(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 dark:text-slate-300"
              />
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
                  <img src={p.downloadUrl} alt={`${directionLabel(p.directionCode)}쪽 사진`} className="h-28 w-full object-cover" />
                  <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <span className="text-slate-600 dark:text-slate-400">{directionLabel(p.directionCode)}쪽</span>
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
