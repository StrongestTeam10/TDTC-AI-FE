import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { homePathFor, canAccessControlSystem, canManageFacilities, isAdmin } from '../auth/permissions';
import BackdropImage from '../components/ui/BackdropImage';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function LandingPage() {
  useDocumentTitle();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const canAccessControl = canAccessControlSystem(user);
  const showFacilitiesMenu = canManageFacilities(user);
  const admin = isAdmin(user);

  const handleStart = () => navigate(user ? homePathFor(user) : '/login');

  return (
    <div className="relative -mx-6 -my-6 flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 py-24 text-center dark:bg-slate-950">
      <BackdropImage className="absolute inset-0" />

      {/* Subtle Overlay to ensure text readability */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] dark:bg-slate-950/40"></div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <p className="text-sm font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
          KT Aivle School 9기 10조 · B2G 빅프로젝트
        </p>

        <div className="space-y-4">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-900 drop-shadow-sm sm:text-5xl lg:text-6xl dark:text-white dark:drop-shadow-lg">
            시켜줘 네 장터매니저
          </h1>
          <p className="text-lg font-medium text-slate-600 dark:text-slate-200">
            전통시장 인구분석 및 안전탐지 관제솔루션 AI
          </p>
        </div>

        <p className="max-w-2xl leading-relaxed text-slate-600 dark:text-slate-300 dark:drop-shadow">
          실측 데이터와 디지털 트윈 시뮬레이션으로
          <br className="hidden sm:inline" /> 전통시장의 혼잡도·위험도를 실시간으로 관제 및 예측합니다.
          <br />
          인구 유입에 따른 위험 확산을 미리 예측하고, 정책 개입 효과를 실행 전에 비교합니다.
        </p>

        {!user && (
          <button
            type="button"
            onClick={handleStart}
            className="mt-4 rounded-full bg-blue-600 px-8 py-3.5 font-semibold text-white shadow-lg transition-all hover:bg-blue-500 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            시작하기
          </button>
        )}

        {/* Card Navigation for logged-in users */}
        {user && (
          <div className="mt-12 flex w-full max-w-[90vw] flex-row gap-4 overflow-x-auto pb-4 snap-x md:flex-wrap md:justify-center md:overflow-visible hide-scrollbar">
            {canAccessControl && (
              <Link to="/compare" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
                <svg className="mb-3 h-8 w-8 text-blue-500 group-hover:text-blue-600 dark:text-blue-400 dark:group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3 className="text-sm font-bold sm:text-base">시뮬레이션 비교</h3>
              </Link>
            )}

            {canAccessControl && (
              <Link to="/scenario-history" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
                <svg className="mb-3 h-8 w-8 text-indigo-500 group-hover:text-indigo-600 dark:text-indigo-400 dark:group-hover:text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-bold sm:text-base">시나리오 이력</h3>
              </Link>
            )}

            {canAccessControl && (
              <Link to="/dashboard" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
                <svg className="mb-3 h-8 w-8 text-teal-500 group-hover:text-teal-600 dark:text-teal-400 dark:group-hover:text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <h3 className="text-sm font-bold sm:text-base">관제 대시보드</h3>
              </Link>
            )}

            {admin && (
              <Link to="/markets/register" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
                <svg className="mb-3 h-8 w-8 text-rose-500 group-hover:text-rose-600 dark:text-rose-400 dark:group-hover:text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <h3 className="text-sm font-bold sm:text-base">시장 등록</h3>
              </Link>
            )}

            {showFacilitiesMenu && (
              <Link to="/facilities" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
                <svg className="mb-3 h-8 w-8 text-orange-500 group-hover:text-orange-600 dark:text-orange-400 dark:group-hover:text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <h3 className="text-sm font-bold sm:text-base">시장 구조 등록</h3>
              </Link>
            )}

            {admin && (
              <Link to="/admin/users" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
                <svg className="mb-3 h-8 w-8 text-purple-500 group-hover:text-purple-600 dark:text-purple-400 dark:group-hover:text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h3 className="text-sm font-bold sm:text-base">회원관리</h3>
              </Link>
            )}

            <Link to="/board" className="group flex w-40 shrink-0 snap-center flex-col items-center justify-center rounded-xl bg-white/70 p-5 text-center text-slate-800 shadow-xl backdrop-blur-md transition-all border border-slate-200 hover:-translate-y-1 hover:bg-white/90 hover:border-slate-300 dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/20 dark:hover:border-white/30">
              <svg className="mb-3 h-8 w-8 text-green-500 group-hover:text-green-600 dark:text-green-400 dark:group-hover:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <h3 className="text-sm font-bold sm:text-base">게시판</h3>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
