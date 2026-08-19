import { useState } from 'react';
import CctvControlDashboard from '../components/cctv/CctvControlDashboard';
import TabButton from '../components/ui/TabButton';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// 2026-08-06 변경: 관제 화면이 public/mangwon/index.html을 가리키는 <iframe>이었다.
// iframe 안은 별도 문서라 (1) 드로어/모달의 position:fixed가 앱 뷰포트가 아닌
// iframe 뷰포트 기준으로 잡히고 (2) 로그인 JWT가 전달되지 않아 BE 데이터를 하나도
// 못 읽고 (3) 앱 다크모드 토글과 무관하게 동작했다. 정적 HTML/JS를 React 컴포넌트로
// 옮기고 iframe을 제거함(components/cctv/*).
//
// ⚠️ 이전 버전에서 주석 처리돼 있던 구역 스냅샷 기반 구현(위험도 패널 / 알람 로그 /
// 시점 선택 드롭다운)은 복구하지 않았고, 2026-08-12에 그 컴포넌트들을 삭제했다. 그쪽은
// SIM 엔진의 구역 단위 스냅샷을 보는 화면이고, 지금 이 화면은 CCTV 프레임 단위
// 실시간 관제라 데이터 그레인 자체가 다르다. 두 화면을 합칠지는 별도 판단이 필요하다.

export default function DashboardPage() {
  useDocumentTitle('관제 대시보드');
  const user = useAuthStore((s) => s.user);
  // 2026-07-27 추가: 게시판과 동일한 권한 체계(관리자 ROL01은 전체, 그 외 상인회/
  // 지자체 등은 본인 담당 시장만) - 관리자만 시장 전환 탭을 보여준다.
  const isAdmin = user?.rulesCode === 'ROL01';

  // 현재 CCTV 파이프라인이 망원시장 한 곳만 분석하고 있어 탭도 한 개다.
  // 시장이 늘어나면 fetchMarkets()로 목록을 받아 채우면 된다.
  const [selectedMarketId, setSelectedMarketId] = useState<number>(1);

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              전통시장 실시간 위험도 관제
            </h1>

          </div>
        </div>

        {isAdmin && (
            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <TabButton
                  active={selectedMarketId === 1}
                  onClick={() => setSelectedMarketId(1)}
                  small
              >
                망원시장
              </TabButton>
            </div>
        )}

        <CctvControlDashboard />
      </div>
  );
}
