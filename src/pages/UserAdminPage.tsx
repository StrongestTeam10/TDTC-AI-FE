import { useCallback, useEffect, useState } from 'react';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import {
  fetchAdminUsers,
  updateUserRole,
  fetchPendingUsers,
  approveUser,
  rejectUser,
  type UserSummary,
  type PendingUser,
} from '../api/client';
import { MARKET_CODE_OPTIONS } from '../constants/marketCode';
import { ROLE_LABELS, type UserRole } from '../types/auth';
import { toDisplayErrorMessage } from '../utils/errorMessage';

// 2026-08-05 추가 (회원관리)
//
// 재재님 요청 반영:
//  - 좌상단 시장 선택은 게시판(BoardListPage)의 "관리자 시장 탭"과 동일한 로직/스타일
//    (전체 시장 + 시장별 탭, 로컬 state로 필터링해서 목록 재조회)
//  - 화면을 "사용자 관리"(전체 회원, 권한 변경) / "회원 승인"(가입 승인 대기자,
//    체크박스로 여러 명 선택 후 일괄 승인/거부) 두 탭으로 분리
//  - 권한 변경은 즉시 반영, 별도 승인 절차나 이력 화면 없음(재재님 확인)
//
// 2026-08-05 (2차): 원래 "회원 승인"을 별도 화면(UserApprovalPage, /admin/approvals)
// 으로 나눠뒀었는데, 재재님이 "회원 승인 탭 하나로 통일 + 체크박스로 대상 구분"
// 요청하셔서 통합함. UserApprovalPage.tsx/RequireAdmin.tsx/관련 라우트·메뉴는 삭제.
// "회원 승인" 탭은 fetchAdminUsers(pendingOnly)/updateUserRole 대신, 전용 API인
// fetchPendingUsers/approveUser/rejectUser를 씀(승인/거부라는 명확한 의미가 역할
// 드롭다운보다 이 화면 목적에 더 맞음). marketCode 필터는 BE에 파라미터가 없어서
// 프론트에서 한 번 더 걸러냄(承認 대기자 수 자체가 적어서 성능 부담 없음).
const ROLE_OPTIONS: UserRole[] = ['ROL01', 'ROL02', 'ROL03'];
const ALL_VALUE = ''; // "전체 시장"을 의미하는 내부 값(쿼리 파라미터 미전송) - BoardListPage와 동일한 관례

type ViewTab = 'manage' | 'pending';

export default function UserAdminPage() {
  const [marketCode, setMarketCode] = useState(ALL_VALUE);
  const [tab, setTab] = useState<ViewTab>('manage');

  // 사용자 관리 탭
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);

  // 회원 승인 탭
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setSelectedIds(new Set());
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

  const handleRoleChange = async (user: UserSummary, nextRole: string) => {
    if (nextRole === user.rulesCode) return;
    const confirmed = window.confirm(
      `${user.name}(${user.loginId})님의 권한을 "${ROLE_LABELS[nextRole as UserRole] ?? nextRole}"(으)로 즉시 변경합니다. 계속할까요?`
    );
    if (!confirmed) return;

    setSavingUserId(user.userId);
    try {
      const updated = await updateUserRole(user.userId, nextRole);
      setUsers((prev) => prev.map((u) => (u.userId === user.userId ? updated : u)));
    } catch (err) {
      window.alert(toDisplayErrorMessage(err, '권한 변경에 실패했습니다.'));
    } finally {
      setSavingUserId(null);
    }
  };

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
        <h1 className="text-xl font-semibold text-slate-100">회원관리</h1>
        <p className="mt-1 text-sm text-slate-400">
          권한 변경은 저장 즉시 반영되며, 별도 이력은 남지 않습니다.
        </p>
      </div>

      {/* 시장 선택 - BoardListPage의 관리자 시장 탭과 동일한 UI/로직 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <TabButton active={marketCode === ALL_VALUE} onClick={() => setMarketCode(ALL_VALUE)} small>
          전체 시장
        </TabButton>
        {MARKET_CODE_OPTIONS.map((m) => (
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
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">아이디</th>
                <th className="px-4 py-2 font-medium">소속 시장</th>
                <th className="px-4 py-2 font-medium">현재 권한</th>
                <th className="px-4 py-2 font-medium">권한 변경</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    표시할 회원이 없습니다.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.userId} className="text-slate-200">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2 text-slate-400">{u.loginId}</td>
                  <td className="px-4 py-2 text-slate-400">
                    {MARKET_CODE_OPTIONS.find((m) => m.code === u.marketCode)?.name ?? u.marketCode ?? '-'}
                  </td>
                  <td className="px-4 py-2">{ROLE_LABELS[u.rulesCode as UserRole] ?? u.rulesCode}</td>
                  <td className="px-4 py-2">
                    <select
                      value={u.rulesCode}
                      disabled={savingUserId === u.userId}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 회원 승인 탭 ===== */}
      {!isLoading && !loadError && tab === 'pending' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              가입 승인 대기 중인 회원만 보여줍니다. 체크박스로 여러 명을 선택해서 한 번에 승인/거부할 수 있습니다.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{selectedIds.size}명 선택됨</span>
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
                className="rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                선택 항목 거부
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
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
                  <th className="px-4 py-2 font-medium">소속기관</th>
                  <th className="px-4 py-2 font-medium">소속 시장</th>
                  <th className="px-4 py-2 font-medium">신청일</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pendingUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      승인 대기 중인 회원이 없습니다.
                    </td>
                  </tr>
                )}
                {pendingUsers.map((u) => {
                  const isProcessing = processingIds.has(u.userId);
                  return (
                    <tr key={u.userId} className="text-slate-200">
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
                      <td className="px-4 py-2 text-slate-400">{u.loginId}</td>
                      <td className="px-4 py-2 text-slate-400">{u.orgCode}</td>
                      <td className="px-4 py-2 text-slate-400">
                        {MARKET_CODE_OPTIONS.find((m) => m.code === u.marketCode)?.name ?? u.marketCode ?? '-'}
                      </td>
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
                          className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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

function TabButton({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 ${small ? 'py-1 text-xs' : 'py-1.5 text-sm'} ${
        active
          ? 'border-blue-600 bg-blue-600/20 text-blue-300'
          : 'border-slate-700 text-slate-400 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}
