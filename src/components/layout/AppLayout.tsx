import type { ReactNode } from 'react';
import IdentityBanner from './IdentityBanner';
import Header from './Header';
import Footer from './Footer';

// 2026-07-24 추가
// 기존 App.tsx 안에 인라인으로 있던 Layout 컴포넌트를 분리 + IdentityBanner/Footer 추가.
// 로그인이 필요한 화면들은 전부 이 AppLayout으로 감싸서 헤더/푸터/식별자 배너를 공통 적용함.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <IdentityBanner />
      <Header />
      <main id="main-content" className="flex-1 px-6 py-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
