import type { ReactNode } from 'react';

// 2026-07-27: 기존 BoardListPage.tsx 안에만 있던 지역 컴포넌트를 공유 컴포넌트로
// 분리함. DashboardPage의 관리자 전용 시장 전환 탭이 게시판의 시장 전환 탭과
// 동일한 스타일/동작을 쓰기 위함(BoardListPage도 이 컴포넌트를 import해서 씀).
export default function TabButton({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
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
