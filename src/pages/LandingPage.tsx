import { useNavigate } from 'react-router-dom';

// 2026-07-24 추가
// "/" 는 로그인 없이 볼 수 있는 유일한 공개 화면(서비스 소개 랜딩페이지).
// 이 화면을 제외한 모든 화면(/dashboard, /scenario, /prediction)은 RequireAuth가
// 비로그인 접근을 /login으로 돌려보냄.
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <p className="text-sm text-slate-500">KT Aivle School 9기 · B2G 캡스톤</p>
      <h1 className="max-w-2xl text-3xl font-semibold text-slate-100 sm:text-4xl">
          전통시장 인구분석 및 안전탐지 관제솔루션AI
          시켜줘 네 장터매니저
      </h1>
      <p className="max-w-xl text-slate-400">
        실측 센서 데이터와 디지털 트윈 시뮬레이션으로 전통시장의 혼잡도·위험도를 실시간으로
        관제하고, 인구 유입에 따른 위험 확산을 미리 예측합니다.
      </p>
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="rounded bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500"
      >
        로그인하고 관제 시작하기
      </button>
    </div>
  );
}
