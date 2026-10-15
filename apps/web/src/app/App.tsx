import { lazy, Suspense, useState } from "react";
import type { ReactNode } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  Building2,
  Layers3,
  FolderOpen,
  ChartNoAxesCombined,
  Settings2,
  UsersRound,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Bell,
  Monitor,
} from "lucide-react";
import { hasPermission, metric, roleLabels } from "@apice/domain";
import type { Department, Permission } from "@apice/domain";
import { PortalProvider } from "./PortalContext";
import { usePortal } from "./usePortal";
import { EmptyState, Modal } from "../shared/ui/components";
import { SelectField } from "../shared/ui/SelectField";
const Tasks = lazy(() => import("../modules/tasks/TasksPage"));
const Overview = lazy(() => import("../modules/overview/OverviewPage"));
const Companies = lazy(() => import("../modules/companies/CompaniesPage"));
const Templates = lazy(() => import("../modules/templates/TemplatesPage"));
const Documents = lazy(() => import("../modules/documents/DocumentsPage"));
const Reports = lazy(() => import("../modules/reports/ReportsPage"));
const Settings = lazy(() => import("../modules/settings/SettingsPage"));
const Users = lazy(() => import("../modules/users/UsersPage"));
const Tv = lazy(() => import("../modules/tv/TvPage"));
const TvPreview = lazy(() => import("../modules/tv/TvPreviewPage"));
const TvWatch = lazy(() => import("../modules/tv/TvWatchPage"));
const navigation: {
  path: string;
  label: string;
  icon: typeof ListTodo;
  permission: Permission;
}[] = [
  {
    path: "/visao-geral",
    label: "Visão geral",
    icon: LayoutDashboard,
    permission: "overview.view",
  },
  {
    path: "/tarefas",
    label: "Minhas tarefas",
    icon: ListTodo,
    permission: "tasks.view",
  },
  {
    path: "/empresas",
    label: "Empresas e carteira",
    icon: Building2,
    permission: "companies.view",
  },
  {
    path: "/modelos",
    label: "Modelos de tarefa",
    icon: Layers3,
    permission: "templates.view",
  },
  {
    path: "/documentos",
    label: "Documentos",
    icon: FolderOpen,
    permission: "documents.view",
  },
  {
    path: "/relatorios",
    label: "Relatórios",
    icon: ChartNoAxesCombined,
    permission: "reports.view",
  },
  {
    path: "/painel-tv",
    label: "Painel de TV",
    icon: Monitor,
    permission: "tv.view",
  },
  {
    path: "/configuracoes",
    label: "Configurações",
    icon: Settings2,
    permission: "settings.view",
  },
  {
    path: "/usuarios",
    label: "Usuários e permissões",
    icon: UsersRound,
    permission: "users.manage",
  },
];
function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { actor } = usePortal();
  return hasPermission(actor, permission) ? (
    children
  ) : (
    <EmptyState
      title="Acesso não autorizado"
      text="Seu administrador define as abas e ações disponíveis para você."
    />
  );
}
function Shell() {
  const location = useLocation();
  const {
    actor,
    data,
    department,
    setDepartment,
    competence,
    logout,
    localTest,
  } = usePortal();
  const [account, setAccount] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const allowed = navigation.filter((item) =>
    hasPermission(actor, item.permission),
  );
  const landing = hasPermission(actor, "users.manage")
    ? "/usuarios"
    : (allowed[0]?.path ?? "/sem-acesso");
  const tasks = data.tasks.filter(
    (t) => t.department === department && t.competence === competence,
  );
  const m = metric(tasks, data.now.slice(0, 10));
  if (location.pathname === "/painel-tv/exibir")
    return (
      <Suspense
        fallback={<div className="portal-loading">Preparando o painel…</div>}
      >
        <PermissionRoute permission="tv.view">
          <TvPreview />
        </PermissionRoute>
      </Suspense>
    );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar navegação"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <span>Portal interno</span>
          <button
            className="mobile-only icon-button"
            aria-label="Fechar menu"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace">
          <span>
            <strong>Ápice Contábil</strong>
            <small>Portal do colaborador</small>
          </span>
        </div>
        <span className="nav-label">OPERAÇÃO</span>
        <nav aria-label="Navegação principal">
          {allowed.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileNav(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={19} />
              {item.path === "/tarefas" &&
              hasPermission(actor, "tasks.team.view")
                ? "Tarefas da equipe"
                : item.label}
              {item.path === "/tarefas" && (
                <span className="nav-count">{m.open}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {localTest && <span className="nav-label">AMBIENTE DE TESTES</span>}
          <button
            className="profile-button"
            aria-label="Minha conta"
            onClick={() => setAccount(true)}
          >
            <span className="avatar">{actor.initials}</span>
            <span>
              <strong>{actor.name}</strong>
              <small>
                {roleLabels[actor.role]} · {department}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <button className="nav-item" onClick={logout}>
            <LogOut size={19} />
            Sair
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span className="department-label">Departamento</span>
            <SelectField
              aria-label="Departamento"
              className="department-select"
              value={department}
              onValueChange={(value) => setDepartment(value as Department)}
              options={actor.departments.map((value) => ({
                value,
                label: value,
              }))}
            />
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button notification-button"
              aria-label="Abrir notificações"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
            </button>
            <button
              className="avatar avatar-small topbar-profile"
              aria-label="Minha conta"
              onClick={() => setAccount(true)}
            >
              {actor.initials}
            </button>
          </div>
        </header>
        <main id="main" className="page" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="route-loading">
                <span className="loading-bar" />
                <p>Carregando módulo…</p>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to={landing} replace />} />
              <Route
                path="/login"
                element={<Navigate to={landing} replace />}
              />
              <Route
                path="/tarefas"
                element={
                  <PermissionRoute permission="tasks.view">
                    <Tasks />
                  </PermissionRoute>
                }
              />
              <Route
                path="/visao-geral"
                element={
                  <PermissionRoute permission="overview.view">
                    <Overview />
                  </PermissionRoute>
                }
              />
              <Route
                path="/empresas"
                element={
                  <PermissionRoute permission="companies.view">
                    <Companies />
                  </PermissionRoute>
                }
              />
              <Route
                path="/modelos"
                element={
                  <PermissionRoute permission="templates.view">
                    <Templates />
                  </PermissionRoute>
                }
              />
              <Route
                path="/documentos"
                element={
                  <PermissionRoute permission="documents.view">
                    <Documents />
                  </PermissionRoute>
                }
              />
              <Route
                path="/relatorios"
                element={
                  <PermissionRoute permission="reports.view">
                    <Reports />
                  </PermissionRoute>
                }
              />
              <Route
                path="/painel-tv"
                element={
                  <PermissionRoute permission="tv.view">
                    <Tv />
                  </PermissionRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <PermissionRoute permission="settings.view">
                    <Settings />
                  </PermissionRoute>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <PermissionRoute permission="users.manage">
                    <Users />
                  </PermissionRoute>
                }
              />
              <Route
                path="/sem-acesso"
                element={
                  <EmptyState
                    title="Nenhum acesso atribuído"
                    text="Peça ao administrador a liberação das suas abas e ações."
                  />
                }
              />
              <Route path="*" element={<Navigate to={landing} replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Modal
        open={account}
        onOpenChange={setAccount}
        title="Minha conta"
        description="Seu acesso é definido pelo administrador."
      >
        <p>
          <strong>{actor.name}</strong>
        </p>
        <p>
          {roleLabels[actor.role]} · {actor.departments.join(", ")}
        </p>
        <button className="button button-secondary" onClick={logout}>
          <LogOut size={16} />
          Sair do sistema
        </button>
      </Modal>
      <Modal
        open={notifications}
        onOpenChange={setNotifications}
        title="Notificações"
        description="Movimentações recentes das tarefas no seu acesso."
      >
        {data.audit.length ? (
          <div className="notification-list">
            {data.audit.slice(0, 6).map((event) => (
              <div key={event.id}>
                <strong>{event.action}</strong>
                <p>{event.detail}</p>
                <small>
                  {event.actorName} · {event.at.slice(11, 16)}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Tudo acompanhado"
            text="As próximas movimentações aparecerão aqui."
          />
        )}
      </Modal>
    </div>
  );
}
export default function App() {
  const location = useLocation();
  if (location.pathname === "/tv")
    return (
      <Suspense
        fallback={<div className="tv-pair-screen">Preparando o painel…</div>}
      >
        <TvWatch />
      </Suspense>
    );
  return (
    <PortalProvider>
      <Shell />
    </PortalProvider>
  );
}
