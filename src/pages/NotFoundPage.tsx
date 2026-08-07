import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { canAccessControlSystem, homePathFor } from '../auth/permissions';

// 2026-07-24 추가
// 지금까지 App.tsx에 정의된 경로(/, /login, /dashboard, /scenario, /prediction) 외의
// 다른 모든 경로("*")에서 렌더링되는 404 화면. 로그인 여부와 관계없이 접근 가능해야
// 하므로 RequireAuth로 감싸지 않고 AppLayout(헤더/푸터)만 씌워서 App.tsx에 등록함.
//
// 2026-08-06 변경: 두 번째 버튼이 "관제 대시보드로 가기"로 고정돼 있었는데, 대시보드가
// ROL01·ROL02 전용이 되면서 조회자에게는 눌러도 되돌려지는 버튼이 됐다. 권한에 따라
// 갈 수 있는 화면으로 바꾸고 라벨도 함께 바꾼다.
export default function NotFoundPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // 비로그인 상태에서는 어차피 어느 화면이든 로그인으로 밀리므로 이 버튼을 감춘다.
  const homePath = homePathFor(user);
  const homeLabel = canAccessControlSystem(user) ? '관제 대시보드로 가기' : '게시판으로 가기';

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-sm font-semibold text-blue-500">404</p>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">페이지를 찾을 수 없습니다</h1>
      <p className="max-w-md text-sm text-slate-500">
        주소가 잘못되었거나, 이동/삭제된 화면입니다. 주소를 다시 확인해주세요.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          홈으로 가기
        </button>
        {user && (
          <button
            type="button"
            onClick={() => navigate(homePath)}
            className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {homeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
