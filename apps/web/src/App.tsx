import {
  BanknoteArrowDown, BookOpenCheck, Building2, ChevronRight, CircleGauge,
  FileChartColumn, FileUp, Landmark, LogOut, Menu, Settings2, ShieldCheck, WalletCards, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib";
import {
  AccountsPage, AdminPage, CatalogsPage, DashboardPage, GovernancePage, ImportsPage,
  LoginPage, MovementDetailPage, MovementsPage, ReportsPage, TenantsPage,
} from "./pages";

const nav = [
  { to: "/", label: "Visão geral", icon: CircleGauge },
  { to: "/movimentos", label: "Movimentações", icon: BanknoteArrowDown },
  { to: "/importacoes", label: "Importações CNAB", icon: FileUp },
  { to: "/contas", label: "Contas bancárias", icon: Landmark },
  { to: "/cadastros", label: "Plano e fornecedores", icon: BookOpenCheck },
  { to: "/governanca", label: "Fundos e orçamento", icon: WalletCards },
  { to: "/relatorios", label: "Relatórios", icon: FileChartColumn },
  { to: "/administracao", label: "Administração", icon: Settings2 },
];

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const tenantUser = user?.role !== "SUPER_ADMIN";
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">B</span><span><strong>Blexo</strong><small>Auditor Financeiro</small></span></div>
      <button className="icon-button mobile-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button>
      <div className="workspace"><span className="workspace-icon"><Building2 /></span><span><small>Ambiente atual</small><strong>{user?.role === "SUPER_ADMIN" ? "Gestão global" : "Condomínio"}</strong></span><ChevronRight /></div>
      <nav>
        {(tenantUser ? nav : [{ to: "/tenants", label: "Condomínios", icon: Building2 }]).map(({ to, label, icon: Icon }) =>
          <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}><Icon /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-foot">
        <div className="user-chip"><span>{user?.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{user?.displayName}</strong><small>{roleLabel(user?.role)}</small></div></div>
        <button className="icon-button" onClick={() => void logout()} title="Sair"><LogOut /></button>
      </div>
    </aside>
    {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" />}
    <main>
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setOpen(true)}><Menu /></button><span className="secure"><ShieldCheck /> Ambiente seguro e segregado</span></header>
      <div className="page-wrap">{children}</div>
    </main>
  </div>;
}

function roleLabel(role?: string) {
  return ({ SUPER_ADMIN: "Superadministrador", ADMIN: "Administrador", OPERATOR: "Operador", VIEWER: "Consulta" } as Record<string, string>)[role ?? ""] ?? role;
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash"><span className="brand-mark">B</span><p>Preparando seu ambiente…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell><Routes>
    {user.role === "SUPER_ADMIN" ? <>
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="*" element={<Navigate to="/tenants" replace />} />
    </> : <>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/movimentos" element={<MovementsPage />} />
      <Route path="/movimentos/:id" element={<MovementDetailPage />} />
      <Route path="/importacoes" element={<ImportsPage />} />
      <Route path="/contas" element={<AccountsPage />} />
      <Route path="/cadastros" element={<CatalogsPage />} />
      <Route path="/governanca" element={<GovernancePage />} />
      <Route path="/relatorios" element={<ReportsPage />} />
      <Route path="/administracao" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>}
  </Routes></Shell>;
}

export default function App() {
  const { user } = useAuth();
  return <Routes>
    <Route path="/login" element={user ? <Navigate to={user.role === "SUPER_ADMIN" ? "/tenants" : "/"} replace /> : <LoginPage />} />
    <Route path="/*" element={<Protected />} />
  </Routes>;
}
