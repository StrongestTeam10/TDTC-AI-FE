import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCommonCodes } from '../../hooks/useCommonCodes';
import { canAccessControlSystem, canManageFacilities } from '../../auth/permissions';
import ThemeToggle from '../ui/ThemeToggle';

// 2026-07-24 추가
// 행안부 가이드라인 - Identity 영역 - 헤더 구조 반영:
// (1) 건너뛰기 링크 (2) 서비스 아이덴티티(로고) (3) 메인 메뉴 (4) 유틸리티 링크 그룹(로그인 사용자/로그아웃)
// 기존 App.tsx에 인라인으로 있던 Layout의 헤더 부분을 분리 + 유틸리티 영역 추가.
//
// 2026-07-24 수정: "/" 가 공개 랜딩페이지로 바뀌면서 관제 대시보드 경로를 "/dashboard"로
// 이동. 비로그인 상태에서 메인 메뉴를 눌러도(랜딩페이지 제외) RequireAuth가 알아서
// /login으로 보내주므로 메뉴 자체는 로그인 여부와 관계없이 항상 노출함.
// 유틸리티 영역은 로그인 여부에 따라 "사용자명 + 로그아웃" ↔ "로그인" 버튼으로 전환.
//
// 2026-07-24 (2차): 왼쪽 서비스명(로고 자리)이 클릭해도 반응 없는 텍스트였던 것을
// "/"(랜딩페이지)로 이동하는 홈 링크로 변경. 가이드라인 헤더 사용성 원칙에도
// "정부 로고는 항상 헤더의 왼쪽 상단에 제공한다"는 항목이 있어, 이 자리를 홈 이동
// 용도로 쓰는 게 일반적인 관례와도 맞음.
const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded text-sm transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  // 2026-08-04 추가: 상점 위치 등록 탭은 관리자(ROL01) 또는 상인회(ORGMA)에게만 노출
  // 2026-08-12: 같은 조건이 RequireFacilityManager·homePathFor에도 필요해져
  // auth/permissions.ts의 canManageFacilities로 옮기고 여기서는 불러 쓴다.
  const showFacilitiesMenu = canManageFacilities(user);
  // 2026-08-06 추가: 관제 대시보드·시뮬레이션 비교·시나리오 이력은 관리자(ROL01)와
  // 관제요원(ROL02)만. BE도 /api/dashboard/** 와 /api/simulation/** 을 이 두 권한으로
  // 제한하므로, 조회자(ROL03, 상인회)에게 메뉴를 남겨두면 눌러도 403만 보게 된다.
  // 상인회에게 열려 있는 것은 게시판과 상점 위치 등록이다.
  const canAccessControl = canAccessControlSystem(user);
  // 2026-08-12: 권한 이름을 types/auth.ts의 하드코딩 표(ROLE_LABELS)에서 읽고 있었다.
  // comcode01m ROL 도메인이 유일한 출처가 되도록 공통코드에서 받아온다.
  const { labelOf: roleLabel } = useCommonCodes('ROL');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      {/* 가이드라인: 건너뛰기 링크 - 마우스 대신 키보드로 본문 콘텐츠 구조 탐색을 돕는 보조 수단 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-blue-600 focus:px-3 focus:py-2 focus:text-white"
      >
        본문 바로가기
      </a>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link
          to="/"
          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-slate-900 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded"
        >
          Home
        </Link>

        <nav aria-label="주요 메뉴" className="flex gap-2">
          {/* 2026-08-11 메뉴 순서 변경: 시뮬레이션 비교 > 시나리오 이력 > 관제 대시보드 >
              시장 구조 등록 > 회원관리 > 게시판 */}
          {canAccessControl && (
            <NavLink to="/compare" className={navClass}>
              시뮬레이션 비교
            </NavLink>
          )}
          {/* 경로를 /scenarios가 아니라 /scenario-history로 둔 이유: 아직 남아 있는
              유휴 라우트 /scenario(ScenarioPage)와 한 글자 차이가 되어 혼동을 부른다. */}
          {canAccessControl && (
            <NavLink to="/scenario-history" className={navClass}>
              시나리오 이력
            </NavLink>
          )}
          {canAccessControl && (
            <NavLink to="/dashboard" className={navClass}>
              관제 대시보드
            </NavLink>
          )}
          {/* 2026-08-11: "상점 위치 등록" → "시장 구조 등록"으로 개명(상점/출입구뿐 아니라
              CCTV 구역·시장 오브젝트까지 등록하는 화면이 됨). 경로(/facilities)는 유지. */}
          {showFacilitiesMenu && (
            <NavLink to="/facilities" className={navClass}>
              시장 구조 등록
            </NavLink>
          )}
          {/* 2026-08-05 추가 (회원관리) - 관리자만 노출. RequireAuth가 URL 직접 접근도 막아주지만, 메뉴 자체를 숨겨서 혼란을 줄임.
              회원 승인은 별도 메뉴 대신 이 페이지 안의 탭1으로 통합됨(2026-08-05 2차) */}
          {user?.rulesCode === 'ROL01' && (
              <NavLink to="/admin/users" className={navClass}>
                회원관리
              </NavLink>
          )}
          <NavLink to="/board" className={navClass}>
            게시판
          </NavLink>
        </nav>

        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <ThemeToggle />
          {user ? (
            <>
              <span>
                {user.name} <span className="text-slate-400 dark:text-slate-600">· {roleLabel(user.rulesCode)}</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                로그아웃
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              로그인
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
