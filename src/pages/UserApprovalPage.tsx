import { useEffect, useState } from 'react';
import Spinner from '../components/ui/Spinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { ORG_CODE_OPTIONS } from '../constants/orgCode';
import { MARKET_CODE_OPTIONS } from '../constants/marketCode';
import { toDisplayErrorMessage } from '../utils/errorMessage';
import { fetchPendingUsers, approveUser, rejectUser } from '../api/client';
import type { PendingUser } from '../api/client';

// 2026-08-04 추가 (회원가입 관리자 승인)
//
// 관리자(ROL01)만 접근 가능(App.tsx 라우트에서 가드, Header.tsx도 관리자에게만 탭
// 노출). 대기 목록만 보여줌 - 이미 승인/거부된 계정은 별도 조회 화면 없음(이번
// 범위 밖, 필요하면 나중에 전체 회원 목록 화면으로 확장 가능).
function orgLabel(code: string): string {
  return ORG_CODE_OPTIONS.find((o) => o.code === code)?.name ?? code;
}

function marketLabel(code: string | null): string {
  if (!code) return '-';
  return MARKET_CODE_OPTIONS.find((m) => m.code === code)?.name ?? code;
}

export default function UserApprovalPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const load = () => {
    setIsLoading(true);
    setLoadError('');
    fetchPendingUsers()
      .then(setUsers)
      .catch((err) => setLoadError(toDisplayErrorMessage(err, '승인 대기 목록을 불러오지 못했습니다.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  async function handleApprove(user: PendingUser) {
    setActionError('');
    setProcessingId(user.userId);
    try {
      await approveUser(user.userId);
      setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
    } catch (err) {
      setActionError(toDisplayErrorMessage(err, '승인에 실패했습니다.'));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(user: PendingUser) {
    if (!window.confirm(`"${user.name}"(${user.loginId})님의 가입을 거부할까요?`)) return;
    setActionError('');
    setProcessingId(user.userId);
    try {
      await rejectUser(user.userId);
      setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
    } catch (err) {
      setActionError(toDisplayErrorMessage(err, '거부 처리에 실패했습니다.'));
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">회원 승인</h1>
        <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-blue-500/10 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
          대기 {users.length}명
        </span>
      </div>

      {loadError && <ErrorBanner message={loadError} onRetry={load} />}
      {actionError && <ErrorBanner message={actionError} />}

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        {isLoading ? (
          <Spinner label="승인 대기 목록을 불러오는 중..." />
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">승인 대기 중인 회원이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">아이디</th>
                  <th className="whitespace-nowrap px-3 py-2">이름</th>
                  <th className="whitespace-nowrap px-3 py-2">소속기관</th>
                  <th className="whitespace-nowrap px-3 py-2">담당 시장</th>
                  <th className="whitespace-nowrap px-3 py-2">신청일</th>
                  <th className="whitespace-nowrap px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{u.loginId}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{u.name}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{orgLabel(u.orgCode)}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{marketLabel(u.marketCode)}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleString('ko-KR')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={processingId === u.userId}
                        onClick={() => handleApprove(u)}
                        className="mr-2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        disabled={processingId === u.userId}
                        onClick={() => handleReject(u)}
                        className="rounded border border-red-500/40 px-3 py-1 text-xs text-red-600 dark:text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        거부
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
