import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import ScenarioPage from './pages/ScenarioPage';

function Layout({ children }: { children: React.ReactNode }) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded text-sm ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
    }`;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="text-slate-100 font-semibold">
          전통시장 안전탐지 디지털 트윈
        </span>
        <nav className="flex gap-2">
          <NavLink to="/" end className={navClass}>
            관제 대시보드
          </NavLink>
          <NavLink to="/scenario" className={navClass}>
            시나리오 시뮬레이션
          </NavLink>
        </nav>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/scenario" element={<ScenarioPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
