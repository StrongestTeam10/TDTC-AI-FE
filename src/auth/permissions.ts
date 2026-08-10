import type { AuthUser } from '../types/auth';

// 2026-08-06 추가
// 권한 판정을 한 곳에 모았다. 지금까지는 Header.tsx의 canManageFacilities,
// RequireFacilityManager, DashboardPage의 isAdmin처럼 같은 조건을 각 파일에서
// 따로 쓰고 있었다. 관제 관련 화면이 세 곳(대시보드, 비교 실행, 시나리오 이력)으로
// 늘어나면서 조건이 어긋날 여지가 커져 여기로 옮긴다.
//
// BE도 같은 판정을 독립적으로 하므로(SecurityConfig의 /api/dashboard/**,
// /api/simulation/** 규칙, MarketService.getAccessibleMarket, ReportService.assertAdmin)
// 이 함수들은 화면 노출을 정리하는 용도다. 주소를 직접 입력해도 BE가 최종적으로 막는다.

/** 최고 관리자. 시장 제한 없이 전체 데이터를 다룰 수 있다. */
export function isAdmin(user: AuthUser | null): boolean {
  return user?.rulesCode === 'ROL01';
}

/**
 * 관제 기능(대시보드·시뮬레이션 실행·정책 보고서)에 접근할 수 있는지.
 *
 * 관리자(ROL01)와 관제요원(ROL02)만이다. 조회자(ROL03, 상인회)는 실시간 관제와
 * What-if 실험, 그 결과로 만든 보고서를 다루지 않는다. 상인회에게 열려 있는 것은
 * 게시판과 상점 위치 등록이다.
 *
 * 세 화면을 하나의 판정으로 묶은 이유: 같은 역할 집합이고 같은 근거에서 나온 규칙인데
 * 화면마다 조건을 따로 쓰면 하나를 고칠 때 나머지를 빠뜨린다. 실제로 대시보드가
 * 그렇게 빠져 있었다. BE 쪽도 /api/dashboard/** 와 /api/simulation/** 이
 * 같은 두 역할로 제한된다.
 */
export function canAccessControlSystem(user: AuthUser | null): boolean {
  return user?.rulesCode === 'ROL01' || user?.rulesCode === 'ROL02';
}

/**
 * 시장 전환 UI를 보여줄지.
 *
 * 관리자만이다. 그 외 사용자는 BE /markets 응답 자체가 담당 시장 1개로 필터링되어
 * 내려오므로 고를 것이 없다(MarketService.getMarkets).
 */
export function canSwitchMarket(user: AuthUser | null): boolean {
  return isAdmin(user);
}

/**
 * 이 사용자를 되돌려 보낼 기본 화면.
 *
 * 권한 가드가 거부할 때 어디로 보낼지 정한다. 지금까지 모든 가드가 /dashboard로
 * 보냈는데, 대시보드까지 ROL01·ROL02 전용이 되면서 조회자는 갈 수 없는 곳으로
 * 밀려나게 됐다(대시보드 가드가 다시 거부해 되돌리는 왕복이 생긴다).
 *
 * 조회자에게는 게시판을 준다. 로그인한 사용자가 권한과 무관하게 항상 쓸 수 있는
 * 화면이 게시판뿐이다.
 */
export function homePathFor(user: AuthUser | null): string {
  return canAccessControlSystem(user) ? '/dashboard' : '/board';
}
