import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { homePathFor } from '../auth/permissions';

// 2026-07-24 추가
// "/" 는 로그인 없이 볼 수 있는 유일한 공개 화면(서비스 소개 랜딩페이지).
// 이 화면을 제외한 모든 화면은 RequireAuth가 비로그인 접근을 /login으로 돌려보냄.
//
// 2026-08-12 변경 (UIUX 피드백 반영)
//  1. 서비스 한 줄 소개("전통시장 인구분석 및 안전탐지 관제솔루션AI")가 두 번 나오고
//     있었다. 하나는 <p> 밖에 떠 있는 맨 텍스트 노드였고, 다른 하나는 설명문 꼬리에
//     붙어 있어서 설명문이 어색하게 접혔다("줄 바꿈 필요" 지적의 실제 원인).
//     소개는 제목 바로 아래 한 번만 두고, 설명문은 그 문장을 다시 쓰지 않는다.
//  2. 가운데 버튼을 "로그인하고 관제 시작하기" → "관제 시작하기"로 바꿨다. 로그인
//     여부를 버튼 이름에 담으면 이미 로그인한 사용자에게 맞지 않는 문구가 된다.
//     로그인/로그아웃은 헤더 오른쪽 위에서만 다루고(Header.tsx), 이 버튼은 목적지로
//     보내는 일만 한다 - 로그인 상태면 권한별 기본 화면, 아니면 로그인 화면.
export default function LandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // 2026-08-12 변경: 버튼 문구를 로그인 여부로 나눈다.
  //  - 비로그인: "시작하기" -> 로그인 화면
  //  - 로그인:   "시뮬레이션 시작" -> 권한별 기본 화면(homePathFor)
  //       관리자·지자체(관제요원) -> 시뮬레이션 비교
  //       상인회                  -> 시장 구조 등록
  //       그 외 조회자            -> 게시판
  // 목적지는 auth/permissions.ts 한 곳에서 정한다. 로그인 직후 이동(LoginPage)과
  // 권한 가드의 되돌림도 같은 함수를 쓰므로, 어디로 들어오든 같은 화면에 도착한다.
  const handleStart = () => navigate(user ? homePathFor(user) : '/login');

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <p className="text-sm text-slate-500">KT Aivle School 9기 10조 · B2G 빅프로젝트</p>

      <div className="space-y-3">
        <h1 className="max-w-2xl text-3xl font-semibold text-slate-900 dark:text-slate-100 sm:text-4xl">
          시켜줘 네 장터매니저
        </h1>
        <p className="text-base font-medium text-slate-600 dark:text-slate-300">
          전통시장 인구분석 및 안전탐지 관제솔루션 AI
        </p>
      </div>

      {/* 두 문장을 각각 한 줄로 끊어 읽게 둔다. 한 덩어리로 두면 창 폭에 따라
          문장 중간에서 접혀 어디까지가 한 생각인지 알기 어렵다. */}
      <p className="max-w-2xl leading-relaxed text-slate-500 dark:text-slate-400">
        실측 데이터와 디지털 트윈 시뮬레이션으로
        <br className="hidden sm:inline" /> 전통시장의 혼잡도·위험도를 실시간으로 관제 및 예측합니다.
        <br />
        인구 유입에 따른 위험 확산을 미리 예측하고, 정책 개입 효과를 실행 전에 비교합니다.
      </p>

      <button
        type="button"
        onClick={handleStart}
        className="rounded bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
      >
        {user ? '시뮬레이션 시작' : '시작하기'}
      </button>
    </div>
  );
}
