import { lazy, Suspense, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  DashboardIcon,
  TaskChecklistIcon,
  CompanyIcon,
  DocumentVaultIcon,
  AnalyticsIcon,
  OfficeSettingsIcon,
  UserAccessIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MenuIcon,
  CloseIcon,
  SignOutIcon,
  NotificationIcon,
  TvDisplayIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  ProcessIcon,
  ChangeReviewIcon,
} from "../shared/icons";
import {
  hasPermission,
  businessTime,
  roleLabels,
  departmentPositionLabel,
} from "@apice/domain";
import type { Actor, Department, Permission } from "@apice/domain";
import { PortalProvider } from "./PortalContext";
import { usePortal } from "./usePortal";
import { EmptyState, Modal } from "../shared/ui/components";
import { DemoTour } from "../shared/ui/DemoTour";
import { PreviewBlockedNotice } from "../shared/ui/PreviewBlockedNotice";
import { SelectField } from "../shared/ui/SelectField";
import { useOrganization } from "./OrganizationContext";
import "./shell.css";
import { NavigationMenu } from "./NavigationMenu";
const Tasks = lazy(() => import("../modules/tasks/TasksPage"));
const Overview = lazy(() => import("../modules/overview/OverviewPage"));
const Companies = lazy(() => import("../modules/companies/CompaniesPage"));
const Documents = lazy(() => import("../modules/documents/DocumentsPage"));
const Reports = lazy(() => import("../modules/reports/ReportsPage"));
const Settings = lazy(() => import("../modules/settings/SettingsPage"));
const Users = lazy(() => import("../modules/users/UsersPage"));
const Tv = lazy(() => import("../modules/tv/TvPage"));
const TvPreview = lazy(() => import("../modules/tv/TvPreviewPage"));
const TvWatch = lazy(() => import("../modules/tv/TvWatchPage"));
const Processes = lazy(() => import("../modules/processes/ProcessesPage"));
const Manager = lazy(() => import("../modules/changes/ChangesPage"));
const navigation: {
  path: string;
  label: string;
  icon: typeof TaskChecklistIcon;
  // Any of the listed grants opens the item.
  permission: Permission | Permission[];
}[] = [
  {
    path: "/visao-geral",
    label: "Visão geral",
    icon: DashboardIcon,
    permission: "overview.view",
  },
  {
    path: "/tarefas",
    label: "Minhas tarefas",
    icon: TaskChecklistIcon,
    permission: "tasks.view",
  },
  {
    path: "/empresas",
    label: "Empresas e carteira",
    icon: CompanyIcon,
    permission: "companies.view",
  },
  {
    // Task templates live inside "Fluxos e processos" since 17/10/2026.
    path: "/processos",
    label: "Fluxos e processos",
    icon: ProcessIcon,
    permission: ["processes.view", "templates.view"],
  },
  {
    path: "/gestor",
    label: "Central do gestor",
    icon: ChangeReviewIcon,
    // Department managers see their team; company changes need changes.manage.
    permission: ["tasks.team.view", "changes.manage"],
  },
  {
    path: "/documentos",
    label: "Documentos",
    icon: DocumentVaultIcon,
    permission: "documents.view",
  },
  {
    path: "/relatorios",
    label: "Relatórios",
    icon: AnalyticsIcon,
    permission: "reports.view",
  },
  {
    path: "/painel-tv",
    label: "Painel de TV",
    icon: TvDisplayIcon,
    permission: "tv.view",
  },
  {
    path: "/configuracoes",
    label: "Configurações",
    icon: OfficeSettingsIcon,
    permission: "settings.view",
  },
  {
    path: "/usuarios",
    label: "Usuários e permissões",
    icon: UserAccessIcon,
    permission: "users.manage",
  },
];
function canAny(actor: Actor, permission: Permission | Permission[]) {
  return (Array.isArray(permission) ? permission : [permission]).some((item) =>
    hasPermission(actor, item),
  );
}
// Old /modelos links keep working inside the unified "Fluxos e processos".
function LegacyTemplatesRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const target = new URLSearchParams({
    aba: params.get("aba") === "implantacao" ? "fluxos" : "modelos",
  });
  const company = params.get("empresa");
  if (company) target.set("empresa", company);
  return <Navigate to={`/processos?${target.toString()}`} replace />;
}
function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission | Permission[];
  children: ReactNode;
}) {
  const { actor } = usePortal();
  return canAny(actor, permission) ? (
    children
  ) : (
    <EmptyState
      title="Acesso não autorizado"
      text="Seu administrador define as abas e ações disponíveis para você."
    />
  );
}
function Shell() {
  const { group, clearGroup } = useOrganization();
  const location = useLocation();
  const { actor, data, department, setDepartment, logout, localTest } =
    usePortal();
  const [account, setAccount] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem("apice.sidebar.compact") === "1";
    } catch {
      return false;
    }
  });
  // Department selector in the top bar can be collapsed to a small chip (17/10/2026).
  const [departmentCollapsed, setDepartmentCollapsed] = useState(() => {
    try {
      return localStorage.getItem("apice.topbar.department") === "collapsed";
    } catch {
      return false;
    }
  });
  function toggleDepartment() {
    setDepartmentCollapsed((current) => {
      try {
        localStorage.setItem(
          "apice.topbar.department",
          current ? "open" : "collapsed",
        );
      } catch {
        /* Visual preference is optional. */
      }
      return !current;
    });
  }
  function toggleCompact() {
    setCompact((current) => {
      try {
        localStorage.setItem("apice.sidebar.compact", current ? "0" : "1");
      } catch {
        /* Visual preference is optional. */
      }
      return !current;
    });
  }
  const allowed = navigation.filter((item) => canAny(actor, item.permission));
  const preferred =
    actor.homeView === "executive"
      ? "/relatorios"
      : actor.homeView === "personal"
        ? "/tarefas"
        : "/visao-geral";
  const landing = allowed.some((item) => item.path === preferred)
    ? preferred
    : (allowed[0]?.path ?? "/sem-acesso");
  const showDepartment = ![
    "/empresas",
    "/usuarios",
    "/configuracoes",
    "/processos",
    "/gestor",
  ].includes(location.pathname);
  const departmentName = (id: string) =>
    data.workspace.departments.find((item) => item.id === id)?.name ?? id;
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
    <div
      className={`app-shell ${compact ? "sidebar-compact" : ""} ${departmentCollapsed ? "topbar-collapsed" : ""}`}
    >
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
            className="icon-button sidebar-toggle"
            aria-label={
              compact ? "Expandir menu lateral" : "Recolher menu lateral"
            }
            title={compact ? "Expandir menu" : "Recolher menu"}
            onClick={toggleCompact}
          >
            {compact ? (
              <SidebarExpandIcon size={18} />
            ) : (
              <SidebarCollapseIcon size={18} />
            )}
          </button>
          <button
            className="mobile-only icon-button"
            aria-label="Fechar menu"
            onClick={() => setMobileNav(false)}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="workspace sidebar-branding">
          {/* Each group's own logo, white over the blue panel like the login. */}
          {group ? (
            <img
              className={`sidebar-logo sidebar-logo-${group.id}`}
              src={group.logo.src}
              width={group.logo.width}
              height={group.logo.height}
              alt={group.name}
            />
          ) : (
            <span>
              <strong>Ápice</strong>
              <small>Portal do colaborador</small>
            </span>
          )}
        </div>
        <span className="nav-label">OPERAÇÃO</span>
        <NavigationMenu
          key={`${actor.tenantId}:${actor.userId}`}
          items={allowed.map((item) => ({
            ...item,
            label:
              item.path === "/tarefas" &&
              hasPermission(actor, "tasks.team.view")
                ? "Tarefas da equipe"
                : item.label,
          }))}
          preferenceKey={`apice.menu.order:${actor.tenantId}:${actor.userId}`}
          compact={compact}
          onNavigate={() => setMobileNav(false)}
        />
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
                {departmentPositionLabel(data.workspace, actor, department)} ·{" "}
                {departmentName(department)}
              </small>
            </span>
            <ChevronDownIcon size={15} />
          </button>
          <button
            className="nav-item"
            onClick={logout}
            title={compact ? "Sair" : undefined}
            aria-label="Sair"
          >
            <SignOutIcon size={19} />
            <span className="nav-item-label">Sair</span>
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
              <MenuIcon size={19} />
            </button>
            {/* With a single department there is nothing to choose, so the selector stays hidden. */}
            {showDepartment ? (
              actor.departments.length > 1 && (
                <>
                  <span className="department-label">Departamento</span>
                  <SelectField
                    aria-label="Departamento"
                    className="department-select"
                    value={department}
                    onValueChange={(value) =>
                      setDepartment(value as Department)
                    }
                    options={actor.departments.map((value) => ({
                      value,
                      label: departmentName(value),
                    }))}
                  />
                </>
              )
            ) : (
              <strong>
                {navigation.find((item) => item.path === location.pathname)
                  ?.label ?? group?.name}
              </strong>
            )}
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button topbar-collapse"
              onClick={toggleDepartment}
              aria-label="Recolher a barra do topo"
              title="Recolher a barra"
            >
              <ChevronUpIcon size={16} aria-hidden="true" />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Abrir notificações"
              onClick={() => setNotifications(true)}
            >
              <NotificationIcon size={19} />
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
        {departmentCollapsed && (
          <button
            type="button"
            className="topbar-handle"
            onClick={toggleDepartment}
            aria-label="Mostrar a barra do topo"
            title="Mostrar a barra"
          >
            <ChevronDownIcon size={16} aria-hidden="true" />
          </button>
        )}
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
              <Route path="/modelos" element={<LegacyTemplatesRedirect />} />
              <Route
                path="/processos"
                element={
                  <PermissionRoute
                    permission={["processes.view", "templates.view"]}
                  >
                    <Processes />
                  </PermissionRoute>
                }
              />
              <Route
                path="/gestor"
                element={
                  <PermissionRoute
                    permission={["tasks.team.view", "changes.manage"]}
                  >
                    <Manager />
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
        {/* TEMPORARY client-demo tour: docs/TUTORIAL-DEMO-TEMPORARIO.md */}
        <DemoTour />
        <PreviewBlockedNotice />
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
          {roleLabels[actor.role]} ·{" "}
          {actor.departments.map(departmentName).join(", ")}
        </p>
        <button className="button button-secondary" onClick={logout}>
          <SignOutIcon size={16} />
          Sair do sistema
        </button>
        <button
          className="button button-white"
          onClick={() => {
            logout();
            clearGroup();
          }}
        >
          Trocar grupo Ápice
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
                  {event.actorName} · {businessTime(event.at)}
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
  const { group } = useOrganization();
  if (location.pathname === "/tv")
    return (
      <Suspense
        fallback={<div className="tv-pair-screen">Preparando o painel…</div>}
      >
        <TvWatch />
      </Suspense>
    );
  return (
    <PortalProvider key={group?.id ?? "choose"}>
      <Shell />
    </PortalProvider>
  );
}
