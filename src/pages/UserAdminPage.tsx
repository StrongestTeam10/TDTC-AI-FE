import { useCallback, useEffect, useMemo, useState } from 'react';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import TabButton from '../components/ui/TabButton';
import {
  fetchAdminUsers,
  updateUserRole,
  fetchPendingUsers,
  approveUser,
  rejectUser,
  updateUserDuty,
  type UserSummary,
  type PendingUser,
} from '../api/client';
import { useCommonCodes } from '../hooks/useCommonCodes';
import { type UserRole } from '../types/auth';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-08-05 추가 (회원관리)
//
// 재재님 요청 반영:
//  - 좌상단 시장 선택은 게시판(BoardListPage)의 "관리자 시장 탭"과 동일한 로직/스타일
//    (전체 시장 + 시장별 탭, 로컬 state로 필터링해서 목록 재조회)
//  - 화면을 "사용자 관리"(전체 회원, 권한 변경) / "회원 승인"(가입 승인 대기자,
//    체크박스로 여러 명 선택 후 일괄 승인/거부) 두 탭으로 분리
//
// 2026-08-05 (2차): 원래 "회원 승인"을 별도 화면(/admin/approvals)
// 으로 나눠뒀었는데, 재재님이 "회원 승인 탭 하나로 통일 + 체크박스로 대상 구분"
// 요청하셔서 통합함. 관련 화면·가드·라우트·메뉴는 모두 삭제(파일은 2026-08-12 제거).
// "회원 승인" 탭은 fetchAdminUsers(pendingOnly)/updateUserRole 대신, 전용 API인
// fetchPendingUsers/approveUser/rejectUser를 씀(승인/거부라는 명확한 의미가 역할
// 드롭다운보다 이 화면 목적에 더 맞음). marketCode 필터는 BE에 파라미터가 없어서
// 프론트에서 한 번 더 걸러냄(承認 대기자 수 자체가 적어서 성능 부담 없음).
//
// 2026-08-10 (3차) "사용자 관리" 탭 재작업:
//  - 소속 시장도 콤보박스로 바꿀 수 있게 함(BE PATCH /admin/users/{id}/role 이
//    marketCode를 같이 받도록 확장). 시장 목록은 회원가입 화면과 동일하게 공통코드
//    (MKT)에서 받고, 실패하면 constants/marketCode.ts 폴백.
//  - 콤보박스와 값이 같은 "현재 권한" 표시 컬럼은 중복이라 제거.
//  - 셀을 바꿀 때마다 confirm/alert를 띄우고 곧바로 저장하던 방식을 버리고, 변경분을
//    화면에 쌓아뒀다가 [저장] 한 번으로 일괄 전송한다(여러 명을 연달아 고칠 때 매번
//    확인창이 뜨는 게 실제 운영에서 가장 불편한 지점이었음).
//  - 각 행 앞 체크박스를 켠 행에서만 콤보박스가 열린다. 목록을 스크롤하다 휠이
//    select에 걸려 권한이 바뀌는 사고를 막는 잠금 장치이기도 하다.
const ROLE_OPTIONS: UserRole[] = ['ROL01', 'ROL02', 'ROL03'];
const ALL_VALUE = ''; // "전체 시장"을 의미하는 내부 값(쿼리 파라미터 미전송) - BoardListPage와 동일한 관례
const NO_MARKET_VALUE = ''; // 소속 시장 없음(관리자처럼 시장 제한이 없는 회원은 NULL이 정상)

type ViewTab = 'manage' | 'pending';

// 편집 중인 값. 저장 전까지는 서버 값(users)과 별개로 들고 있다가, 저장에 성공한
// 행만 서버 응답으로 교체한다.
interface UserDraft {
  rulesCode: string;
  marketCode: string;
  isDuty: boolean;
}

const CELL_SELECT_CLASS =
  'rounded border px-2 py-1 text-sm outline-none transition-colors ' +
  'border-slate-300 bg-white text-slate-900 ' +
  'dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ' +
  'focus:ring-2 focus:ring-blue-600 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ' +
  'dark:disabled:bg-slate-900 dark:disabled:text-slate-600';

export default function UserAdminPage() {
  const [marketCode, setMarketCode] = useState(ALL_VALUE);
  const [tab, setTab] = useState<ViewTab>('manage');

  // 2026-08-12: 화면마다 복사돼 있던 공통코드 조회를 useCommonCodes로 모았다.
  // 권한(ROL)도 types/auth.ts의 하드코딩 표가 아니라 공통코드에서 받아온다.
  const { options: marketOptions, labelOf: marketLabelOf } = useCommonCodes('MKT');
  const { labelOf: roleLabel } = useCommonCodes('ROL');

  // 사용자 관리 탭
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // 체크한 행에서만 콤보박스가 열린다(편집 잠금)
  const [editableIds, setEditableIds] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});

  // 회원 승인 탭
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const marketName = marketLabelOf;

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveNotice(null);
    setSelectedIds(new Set());
    setEditableIds(new Set());
    setDrafts({});
    try {
      if (tab === 'pending') {
        const data = await fetchPendingUsers();
        setPendingUsers(marketCode ? data.filter((u) => u.marketCode === marketCode) : data);
      } else {
        const data = await fetchAdminUsers({ marketCode: marketCode || undefined });
        setUsers(data);
      }
    } catch (err) {
      setLoadError(toDisplayErrorMessage(err, '회원 목록을 불러오지 못했습니다.'));
    } finally {
      setIsLoading(false);
    }
  }, [marketCode, tab]);

  useEffect(() => {
    load();
  }, [load]);

  // ===== 사용자 관리 탭: 편집 잠금 · 임시 변경값 =====

  const draftOf = useCallback(
    (user: UserSummary): UserDraft =>
      drafts[user.userId] ?? { rulesCode: user.rulesCode, marketCode: user.marketCode ?? NO_MARKET_VALUE, isDuty: user.isDuty ?? false },
    [drafts]
  );

  const isDirty = useCallback(
    (user: UserSummary) => {
      const d = drafts[user.userId];
      if (!d) return false;
      return d.rulesCode !== user.rulesCode || d.marketCode !== (user.marketCode ?? NO_MARKET_VALUE) || d.isDuty !== (user.isDuty ?? false);
    },
    [drafts]
  );

  const dirtyUsers = useMemo(() => users.filter((u) => isDirty(u)), [users, isDirty]);

  const toggleEditable = (user: UserSummary) => {
    setSaveNotice(null);
    setEditableIds((prev) => {
      const next = new Set(prev);
      if (next.has(user.userId)) next.delete(user.userId);
      else next.add(user.userId);
      return next;
    });
    // 체크를 풀면 그 행의 미저장 변경분도 같이 되돌린다 - 잠긴 행이 바뀐 채로 남아
    // 있으면 [저장]을 눌렀을 때 화면에서 손댈 수 없는 값이 그대로 전송된다.
    if (editableIds.has(user.userId)) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[user.userId];
        return next;
      });
    }
  };

  const toggleEditableAll = () => {
    setSaveNotice(null);
    if (editableIds.size === users.length) {
      setEditableIds(new Set());
      setDrafts({});
      return;
    }
    setEditableIds(new Set(users.map((u) => u.userId)));
  };

  const updateDraft = (user: UserSummary, patch: Partial<UserDraft>) => {
    setSaveNotice(null);
    setDrafts((prev) => ({
      ...prev,
      [user.userId]: { ...draftOf(user), ...patch },
    }));
  };

  const handleCancelChanges = () => {
    setDrafts({});
    setEditableIds(new Set());
    setSaveError(null);
    setSaveNotice(null);
  };

  const handleSave = async () => {
    if (dirtyUsers.length === 0) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveNotice(null);

    const saved: UserSummary[] = [];
    const failed: string[] = [];

    for (const user of dirtyUsers) {
      const draft = draftOf(user);
      try {
        let updated = { ...user };
        const roleChanged = draft.rulesCode !== user.rulesCode || draft.marketCode !== (user.marketCode ?? NO_MARKET_VALUE);
        
        if (roleChanged) {
          updated = await updateUserRole(user.userId, draft.rulesCode, draft.marketCode);
        }
        
        if (draft.isDuty !== (user.isDuty ?? false)) {
          const dutyUpdated = await updateUserDuty(user.userId, draft.isDuty);
          updated = { ...updated, isDuty: dutyUpdated.isDuty };
        }
        saved.push(updated);
      } catch (err: any) {
        const errorDetail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        failed.push(`${user.name}(저장 실패: ${toDisplayErrorMessage(err, '원인 알 수 없음')}, 상세: ${errorDetail})`);
      }
    }

    if (saved.length > 0) {
      const savedById = new Map(saved.map((u) => [u.userId, u]));
      setUsers((prev) => prev.map((u) => savedById.get(u.userId) ?? u));
      // 저장에 성공한 행만 임시 변경분과 편집 상태를 정리하고, 실패한 행은 다시
      // 시도할 수 있도록 입력값을 그대로 남긴다.
      setDrafts((prev) => {
        const next = { ...prev };
        saved.forEach((u) => delete next[u.userId]);
        return next;
      });
      setEditableIds((prev) => {
        const next = new Set(prev);
        saved.forEach((u) => next.delete(u.userId));
        return next;
      });
    }

    if (failed.length > 0) {
      setSaveError(`${failed.length}명의 정보를 저장하지 못했습니다: ${failed.join(', ')}`);
    } else {
      setSaveNotice(`${saved.length}명의 정보를 저장했습니다.`);
    }
    setIsSaving(false);
  };

  // ===== 회원 승인 탭 =====

  const toggleSelected = (userId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === pendingUsers.length ? new Set() : new Set(pendingUsers.map((u) => u.userId))
    );
  };

  const removeFromPendingList = (ids: number[]) => {
    const idSet = new Set(ids);
    setPendingUsers((prev) => prev.filter((u) => !idSet.has(u.userId)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleSingleAction = async (user: PendingUser, action: 'approve' | 'reject') => {
    if (action === 'reject' && !window.confirm(`"${user.name}"(${user.loginId})님의 가입을 거부할까요?`)) return;

    setProcessingIds((prev) => new Set(prev).add(user.userId));
    try {
      await (action === 'approve' ? approveUser(user.userId) : rejectUser(user.userId));
      removeFromPendingList([user.userId]);
    } catch (err) {
      window.alert(toDisplayErrorMessage(err, action === 'approve' ? '승인에 실패했습니다.' : '거부 처리에 실패했습니다.'));
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(user.userId);
        return next;
      });
    }
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    const targets = pendingUsers.filter((u) => selectedIds.has(u.userId));
    if (targets.length === 0) return;
    const verb = action === 'approve' ? '승인' : '거부';
    if (!window.confirm(`선택한 ${targets.length}명을 일괄 ${verb}할까요?`)) return;

    setIsBulkProcessing(true);
    const succeededIds: number[] = [];
    const failedNames: string[] = [];
    for (const user of targets) {
      try {
        await (action === 'approve' ? approveUser(user.userId) : rejectUser(user.userId));
        succeededIds.push(user.userId);
      } catch {
        failedNames.push(user.name);
      }
    }
    removeFromPendingList(succeededIds);
    setIsBulkProcessing(false);
    if (failedNames.length > 0) {
      window.alert(`다음 회원은 ${verb} 처리에 실패했습니다: ${failedNames.join(', ')}`);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">회원관리</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          권한과 소속 시장은 체크한 행에서만 수정할 수 있고, 수정한 내용은 [저장]을 눌러야 반영됩니다.
        </p>
      </div>

      {/* 시장 선택 - BoardListPage의 관리자 시장 탭과 동일한 UI/로직 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <TabButton active={marketCode === ALL_VALUE} onClick={() => setMarketCode(ALL_VALUE)} small>
          전체 시장
        </TabButton>
        {marketOptions.map((m) => (
          <TabButton key={m.code} active={marketCode === m.code} onClick={() => setMarketCode(m.code)} small>
            {m.name}
          </TabButton>
        ))}
      </div>

      {/* 사용자 관리 / 회원 승인 탭 */}
      <div className="flex gap-2">
        <TabButton active={tab === 'manage'} onClick={() => setTab('manage')}>
          사용자 관리
        </TabButton>
        <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
          회원 승인
        </TabButton>
      </div>

      {isLoading && <Spinner label="회원 목록을 불러오는 중..." />}
      {!isLoading && loadError && <ErrorBanner message={loadError} onRetry={load} />}

      {/* ===== 사용자 관리 탭 ===== */}
      {!isLoading && !loadError && tab === 'manage' && (
        <div className="flex flex-col gap-3">
          {saveError && <ErrorBanner message={saveError} />}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              수정할 회원의 체크박스를 켜면 권한·소속 시장을 고칠 수 있습니다.
            </p>
            <div className="flex items-center gap-2">
              {saveNotice && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{saveNotice}</span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {dirtyUsers.length > 0 ? `${dirtyUsers.length}건 수정됨` : '수정된 내용 없음'}
              </span>
              <button
                type="button"
                onClick={handleCancelChanges}
                disabled={dirtyUsers.length === 0 || isSaving}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                되돌리기
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={dirtyUsers.length === 0 || isSaving}
                className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={users.length > 0 && editableIds.size === users.length}
                      onChange={toggleEditableAll}
                      disabled={users.length === 0 || isSaving}
                      aria-label="전체 수정 활성화"
                    />
                  </th>
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">아이디</th>
                  <th className="px-4 py-2 font-medium">전화번호</th>
                  <th className="px-4 py-2 font-medium">소속 시장</th>
                  <th className="px-4 py-2 font-medium">권한</th>
                  <th className="px-4 py-2 font-medium text-center">알림 수신(당직)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      표시할 회원이 없습니다.
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const editable = editableIds.has(u.userId);
                  const draft = draftOf(u);
                  const dirty = isDirty(u);
                  return (
                    <tr
                      key={u.userId}
                      className={`text-slate-800 dark:text-slate-200 ${
                        dirty ? 'bg-blue-50 dark:bg-blue-500/10' : ''
                      }`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={editable}
                          onChange={() => toggleEditable(u)}
                          disabled={isSaving}
                          aria-label={`${u.name} 수정 활성화`}
                        />
                      </td>
                      <td className="px-4 py-2">{u.name}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{u.loginId}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{u.phoneNumber || '-'}</td>
                      <td className="px-4 py-2">
                        <select
                          value={draft.marketCode}
                          disabled={!editable || isSaving}
                          onChange={(e) => updateDraft(u, { marketCode: e.target.value })}
                          aria-label={`${u.name} 소속 시장`}
                          className={CELL_SELECT_CLASS}
                        >
                          <option value={NO_MARKET_VALUE}>소속 없음</option>
                          {marketOptions.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.name}
                            </option>
                          ))}
                          {/* 공통코드에 없는 값이 이미 저장돼 있어도 현재 값이 사라지지 않게 함 */}
                          {draft.marketCode !== NO_MARKET_VALUE &&
                            !marketOptions.some((m) => m.code === draft.marketCode) && (
                              <option value={draft.marketCode}>{marketName(draft.marketCode)}</option>
                            )}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={draft.rulesCode}
                          disabled={!editable || isSaving}
                          onChange={(e) => updateDraft(u, { rulesCode: e.target.value })}
                          aria-label={`${u.name} 권한`}
                          className={CELL_SELECT_CLASS}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                          {!ROLE_OPTIONS.includes(draft.rulesCode as UserRole) && (
                            <option value={draft.rulesCode}>{draft.rulesCode}</option>
                          )}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={draft.isDuty}
                          disabled={!editable || isSaving}
                          onChange={(e) => updateDraft(u, { isDuty: e.target.checked })}
                          aria-label={`${u.name} 알림 수신 여부`}
                          className="h-4 w-4 rounded border-slate-300 bg-white accent-blue-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== 회원 승인 탭 ===== */}
      {!isLoading && !loadError && tab === 'pending' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              가입 승인 대기 중인 회원만 보여줍니다. 체크박스로 여러 명을 선택해서 한 번에 승인/거부할 수 있습니다.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{selectedIds.size}명 선택됨</span>
              <button
                type="button"
                disabled={selectedIds.size === 0 || isBulkProcessing}
                onClick={() => handleBulkAction('approve')}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                선택 항목 승인
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || isBulkProcessing}
                onClick={() => handleBulkAction('reject')}
                className="rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"
              >
                선택 항목 거부
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={pendingUsers.length > 0 && selectedIds.size === pendingUsers.length}
                      onChange={toggleSelectAll}
                      disabled={pendingUsers.length === 0}
                      aria-label="전체 선택"
                    />
                  </th>
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">아이디</th>
                  <th className="px-4 py-2 font-medium">전화번호</th>
                  <th className="px-4 py-2 font-medium">소속기관</th>
                  <th className="px-4 py-2 font-medium">소속 시장</th>
                  <th className="px-4 py-2 font-medium">신청일</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pendingUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      승인 대기 중인 회원이 없습니다.
                    </td>
                  </tr>
                )}
                {pendingUsers.map((u) => {
                  const isProcessing = processingIds.has(u.userId);
                  return (
                    <tr key={u.userId} className="text-slate-800 dark:text-slate-200">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.userId)}
                          onChange={() => toggleSelected(u.userId)}
                          disabled={isProcessing || isBulkProcessing}
                          aria-label={`${u.name} 선택`}
                        />
                      </td>
                      <td className="px-4 py-2">{u.name}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{u.loginId}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{u.phoneNumber || '-'}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{u.orgCode}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{marketName(u.marketCode)}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleString('ko-KR')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={isProcessing || isBulkProcessing}
                          onClick={() => handleSingleAction(u, 'approve')}
                          className="mr-2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          disabled={isProcessing || isBulkProcessing}
                          onClick={() => handleSingleAction(u, 'reject')}
                          className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"
                        >
                          거부
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
