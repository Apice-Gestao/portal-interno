import { SelectField } from "../../shared/ui/SelectField";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AddIcon,
  SearchIcon,
  EditIcon,
  UserAccessIcon,
  DuplicateIcon,
  TaskBlueprintIcon,
  ExportFileIcon,
  ExternalLinkIcon,
  DeleteIcon,
} from "../../shared/icons";
import {
  hasPermission,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  roleLabels,
  csvCell,
} from "@apice/domain";
import type {
  AccountInput,
  AccountUpdate,
  AccountUser,
  Department,
  Permission,
  Role,
  AccessProfile,
} from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { isHostedDemo } from "../../services/portal-client";
import { ClientPortalUsers } from "./ClientPortalUsers";
import { downloadText } from "../../shared/downloads";
import {
  Busy,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import "./users.css";
import { UserImport } from "./UserImport";

type HomeView = "personal" | "team" | "management" | "executive";
const HOME_LABELS: Record<HomeView, string> = {
  personal: "Minhas tarefas",
  team: "Panorama da equipe",
  management: "Gestão da operação",
  executive: "Relatórios e análises",
};
const ROLE_OPTIONS: Role[] = [
  "operator",
  "coordinator",
  "supervisor",
  "manager",
  "director",
  "admin",
  "viewer",
];

function AccessFields({
  role,
  setRole,
  homeView,
  setHomeView,
  departments,
  setDepartments,
  permissions,
  setPermissions,
}: {
  role: Role;
  setRole: (value: Role) => void;
  homeView: HomeView;
  setHomeView: (value: HomeView) => void;
  departments: Department[];
  setDepartments: (value: Department[]) => void;
  permissions: Permission[];
  setPermissions: (value: Permission[]) => void;
}) {
  const { data } = usePortal();
  return (
    <>
      <div className="form-grid account-access-fields">
        <label>
          Tipo de usuário
          <SelectField
            aria-label="Tipo de usuário"
            value={role}
            onValueChange={(value) => setRole(value as Role)}
            options={ROLE_OPTIONS.map((value) => ({
              value,
              label: roleLabels[value],
            }))}
          />
        </label>
        <label>
          Página inicial
          <SelectField
            aria-label="Página inicial"
            value={homeView}
            onValueChange={(value) => setHomeView(value as HomeView)}
            options={Object.entries(HOME_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </label>
      </div>
      <p className="account-field-note">
        A página inicial respeita as abas liberadas. Cargo não limita
        permissões.
      </p>
      <fieldset className="account-selection">
        <legend>Departamentos</legend>
        <div className="account-departments">
          {data.workspace.departments
            .filter((item) => item.active || departments.includes(item.id))
            .map((item) => (
              <label className="account-checkbox" key={item.id}>
                <input
                  type="checkbox"
                  checked={departments.includes(item.id)}
                  onChange={(event) =>
                    setDepartments(
                      event.target.checked
                        ? [...departments, item.id]
                        : departments.filter((value) => value !== item.id),
                    )
                  }
                />
                <span>
                  {item.name}
                  {!item.active ? " (inativo)" : ""}
                </span>
              </label>
            ))}
        </div>
      </fieldset>
      <fieldset className="account-selection">
        <legend>Abas e ações permitidas</legend>
        <p>
          Marque as abas e, em seguida, as ações disponíveis. Tarefas próprias
          continuam separadas do acesso à equipe.
        </p>
        <details className="account-scope-help">
          <summary>Como os acessos funcionam</summary>
          <p>
            Qualquer cargo pode receber qualquer concessão. Modelos apenas
            preenchem este formulário; você pode ajustar cada acesso antes de
            salvar. A permissão antiga de gerenciamento reúne redistribuição,
            dispensa e reabertura; prefira as ações individuais nos novos
            cadastros.
          </p>
        </details>
        <div className="account-permission-groups">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label} className="account-permission-group">
              <legend>{group.label}</legend>
              {group.permissions.map((permission) => (
                <label className="account-checkbox" key={permission}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(permission)}
                    onChange={(event) =>
                      setPermissions(
                        event.target.checked
                          ? [...permissions, permission]
                          : permissions.filter((value) => value !== permission),
                      )
                    }
                  />
                  <span>{PERMISSION_LABELS[permission]}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function AccountEditor({
  user,
  accounts,
  busy,
  setBusy,
  onCancel,
  onSaved,
}: {
  user?: AccountUser;
  accounts: AccountUser[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  onCancel: () => void;
  onSaved: (user: AccountUser) => Promise<void>;
}) {
  const { client, localTest, data } = usePortal();
  const shortcutAccount =
    localTest && !!user && ["helena", "julia"].includes(user.userId);
  // Test accounts and the hosted preview's fictitious ones may have no e-mail.
  const fictitious = localTest || isHostedDemo;
  // What stays with this person if the account is deactivated (L03).
  const [activeChecked, setActiveChecked] = useState(user?.active !== false);
  const pending = user
    ? {
        tasks: data.tasks.filter(
          (task) =>
            task.assigneeId === user.userId &&
            !task.cancelled &&
            !["done", "dispensed"].includes(task.status),
        ).length,
        companies: data.companies.filter(
          (company) =>
            company.ownerId === user.userId ||
            Object.values(company.responsibilities ?? {}).some(
              (item) => item.mode === "person" && item.userId === user.userId,
            ),
        ).length,
        stages: (data.companyOnboardings ?? []).reduce(
          (sum, onboarding) =>
            sum +
            (onboarding.status === "active"
              ? onboarding.stages.filter(
                  (stage) =>
                    stage.status !== "done" &&
                    stage.assigneeId === user.userId,
                ).length
              : 0),
          0,
        ),
      }
    : undefined;
  const leftBehind =
    pending && pending.tasks + pending.companies + pending.stages > 0;
  const [role, setRole] = useState<Role>(user?.role ?? "operator");
  const [homeView, setHomeView] = useState<HomeView>(
    user?.homeView ?? "personal",
  );
  const [managerId, setManagerId] = useState(user?.managerId ?? "none");
  const [departments, setDepartments] = useState<Department[]>(
    user?.departments ?? [],
  );
  const [permissions, setPermissions] = useState<Permission[]>(
    user?.permissions ?? [],
  );
  const [source, setSource] = useState("none");
  const [pendingCopy, setPendingCopy] = useState<{
    label: string;
    role: Role;
    departments: Department[];
    permissions: Permission[];
    homeView?: HomeView;
  }>();
  const [error, setError] = useState("");
  const submitting = useRef(false);
  function previewCopy(value: string) {
    setSource(value);
    const [kind, id] = value.split(":");
    if (kind === "profile") {
      const profile = data.workspace.accessProfiles.find(
        (item) => item.id === id,
      );
      setPendingCopy(profile ? { ...profile, label: profile.name } : undefined);
    } else {
      const account = accounts.find((item) => item.userId === id);
      setPendingCopy(account ? { ...account, label: account.name } : undefined);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (!departments.length) {
      setError("Selecione ao menos um departamento.");
      return;
    }
    if (
      (!user || password) &&
      (password.length < 12 || password.length > 128)
    ) {
      setError("A senha temporária deve ter entre 12 e 128 caracteres.");
      return;
    }
    const input = {
      name: String(form.get("name") ?? "").trim(),
      username: String(form.get("username") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      departments,
      permissions,
      role,
      homeView,
      managerId: managerId === "none" ? "" : managerId,
    };
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      let saved: AccountUser;
      if (user) {
        const update: AccountUpdate = {
          ...input,
          active: form.get("active") === "on",
          ...(password ? { password } : {}),
        };
        if (fictitious && !input.email) delete update.email;
        saved = await client.updateUser(user.userId, update);
      } else {
        const create: AccountInput = { ...input, password };
        saved = await client.createUser(create);
      }
      await onSaved(saved);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o usuário.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <fieldset className="account-fields" disabled={busy}>
        <section className="account-copy-box">
          <div>
            <DuplicateIcon size={17} />
            <strong>Usar uma configuração existente</strong>
          </div>
          <SelectField
            aria-label="Copiar acessos de usuário ou modelo"
            value={source}
            onValueChange={previewCopy}
            options={[
              { value: "none", label: "Escolher usuário ou modelo" },
              ...data.workspace.accessProfiles.map((item) => ({
                value: `profile:${item.id}`,
                label: `Modelo · ${item.name}`,
              })),
              ...accounts
                .filter((item) => item.userId !== user?.userId)
                .map((item) => ({
                  value: `user:${item.userId}`,
                  label: `Usuário · ${item.name}`,
                })),
            ]}
          />
          {pendingCopy && (
            <div className="account-copy-preview">
              <p>
                <strong>{pendingCopy.label}</strong> ·{" "}
                {roleLabels[pendingCopy.role]} ·{" "}
                {pendingCopy.departments.length} departamentos ·{" "}
                {pendingCopy.permissions.length} permissões.
              </p>
              <p>
                Nome, e-mail, usuário, senha e gestor permanecem individuais.
              </p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setRole(pendingCopy.role);
                  setDepartments([...pendingCopy.departments]);
                  setPermissions([...pendingCopy.permissions]);
                  setHomeView(pendingCopy.homeView ?? "personal");
                  setPendingCopy(undefined);
                }}
              >
                Aplicar e revisar acessos
              </button>
            </div>
          )}
        </section>
        <div className="form-grid">
          <label className="full">
            Nome completo
            <input
              name="name"
              required
              minLength={3}
              maxLength={100}
              defaultValue={user?.name ?? ""}
              autoComplete="name"
            />
          </label>
          <label className="full">
            E-mail
            <input
              name="email"
              type="email"
              required={!fictitious || !user}
              maxLength={254}
              defaultValue={user?.email ?? ""}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <p className="account-field-note full">
            {fictitious && user
              ? "E-mail opcional para esta conta fictícia de teste."
              : "Usado na recuperação de senha e no segundo fator."}
          </p>
          <label>
            Usuário de acesso
            <input
              name="username"
              required
              minLength={3}
              maxLength={60}
              defaultValue={user?.username ?? ""}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Gestor responsável
            <SelectField
              aria-label="Gestor responsável"
              value={managerId}
              onValueChange={setManagerId}
              options={[
                { value: "none", label: "Sem vínculo hierárquico" },
                ...accounts
                  .filter((item) => item.active && item.userId !== user?.userId)
                  .map((item) => ({ value: item.userId, label: item.name })),
              ]}
            />
          </label>
          {!shortcutAccount && (
            <label className="full">
              {user ? "Nova senha temporária (opcional)" : "Senha temporária"}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required={!user}
                minLength={12}
                maxLength={128}
              />
            </label>
          )}
          <p className="account-field-note full">
            {shortcutAccount
              ? "Senha gerida pela configuração local de testes."
              : user
                ? "Em branco mantém a senha. Uma nova senha exige troca no próximo acesso."
                : "12 a 128 caracteres. Troca obrigatória no primeiro acesso."}
          </p>
        </div>
        <AccessFields
          {...{
            role,
            setRole,
            homeView,
            setHomeView,
            departments,
            setDepartments,
            permissions,
            setPermissions,
          }}
        />
        {user && (
          <div className="account-active-state">
            <label className="account-checkbox">
              <input
                name="active"
                type="checkbox"
                defaultChecked={user.active}
                onChange={(event) => setActiveChecked(event.target.checked)}
              />
              <span>Usuário ativo</span>
            </label>
            <p>Desativar bloqueia o acesso e preserva o histórico.</p>
            {!activeChecked && leftBehind && (
              <div className="info-box warning-box account-pending" role="status">
                <strong>Antes de desativar, redistribua o que está com {user.name}</strong>
                <ul>
                  {pending.tasks > 0 && (
                    <li>
                      {pending.tasks} {pending.tasks === 1 ? "tarefa aberta" : "tarefas abertas"} ·
                      transfira em Tarefas › Transferir atividades
                    </li>
                  )}
                  {pending.companies > 0 && (
                    <li>
                      {pending.companies} {pending.companies === 1 ? "empresa na carteira" : "empresas na carteira"} ·
                      transfira em Empresas e carteira
                    </li>
                  )}
                  {pending.stages > 0 && (
                    <li>
                      {pending.stages} {pending.stages === 1 ? "etapa de implantação" : "etapas de implantação"} ·
                      troque o responsável em Fluxos e processos
                    </li>
                  )}
                </ul>
                <p>
                  Sem isso as tarefas ficam paradas com a pessoa (a Central do
                  gestor as sinaliza) e a geração mensal pula essas empresas.
                </p>
              </div>
            )}
          </div>
        )}
        <FormError message={error} />
        <footer className="form-actions">
          <button
            type="button"
            className="button button-white"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button className="button button-primary" type="submit">
            <Busy busy={busy}>
              {user ? "Salvar alterações" : "Criar usuário"}
            </Busy>
          </button>
        </footer>
      </fieldset>
    </form>
  );
}

function ProfileEditor({
  profile,
  onClose,
}: {
  profile?: AccessProfile;
  onClose: () => void;
}) {
  const { client, data, refresh, notify } = usePortal();
  const [name, setName] = useState(profile?.name ?? "");
  const [role, setRole] = useState<Role>(profile?.role ?? "operator");
  const [homeView, setHomeView] = useState<HomeView>(
    profile?.homeView ?? "personal",
  );
  const [departments, setDepartments] = useState<Department[]>(
    profile?.departments ?? [],
  );
  const [permissions, setPermissions] = useState<Permission[]>(
    profile?.permissions ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!departments.length) {
      setError("Selecione ao menos um departamento.");
      return;
    }
    setBusy(true);
    setError("");
    const next: AccessProfile = {
      id: profile?.id ?? crypto.randomUUID(),
      name: name.trim(),
      role,
      departments,
      permissions,
      homeView,
    };
    try {
      await client.updateWorkspaceSettings({
        expectedRevision: data.workspace.revision,
        departments: data.workspace.departments,
        accessProfiles: [
          ...data.workspace.accessProfiles.filter(
            (item) => item.id !== next.id,
          ),
          next,
        ],
        documentTypes: data.workspace.documentTypes,
        documentRules: data.workspace.documentRules,
      });
      await refresh();
      notify(
        "Modelo salvo. Contas existentes mantêm os acessos já atribuídos.",
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o modelo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="account-form" onSubmit={save}>
      <fieldset className="account-fields" disabled={busy}>
        <label>
          Nome do modelo
          <input
            required
            minLength={3}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Operador Fiscal"
          />
        </label>
        <AccessFields
          {...{
            role,
            setRole,
            homeView,
            setHomeView,
            departments,
            setDepartments,
            permissions,
            setPermissions,
          }}
        />
        <FormError message={error} />
        <footer className="form-actions">
          <button
            type="button"
            className="button button-white"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button button-primary">
            <Busy busy={busy}>Salvar modelo</Busy>
          </button>
        </footer>
      </fieldset>
    </form>
  );
}

// Clicking anywhere on the row opens it; controls inside keep their own action.
const fromControl = (event: { target: EventTarget }) =>
  !!(event.target as HTMLElement).closest?.("button, a, input, label, select");
export default function UsersPage() {
  const { actor, client, data, refresh, notify } = usePortal();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "profiles" | "client">("users");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AccountUser>();
  const [busy, setBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<AccessProfile>();
  const [deleteProfile, setDeleteProfile] = useState<AccessProfile>();
  const [profileError, setProfileError] = useState("");
  const canManage = hasPermission(actor, "users.manage");
  const query = useQuery({
    queryKey: ["account-users", actor.tenantId, actor.userId],
    queryFn: () => client.listUsers(),
    enabled: canManage,
    retry: false,
  });
  const accounts = query.data ?? [];
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const departmentName = (id: string) =>
    data.workspace.departments.find((item) => item.id === id)?.name ?? id;
  const filtered = accounts.filter((user) =>
    `${user.name} ${user.username} ${user.email ?? ""} ${user.departments.map(departmentName).join(" ")}`
      .toLocaleLowerCase("pt-BR")
      .includes(term),
  );
  async function saved(user: AccountUser) {
    setOpen(false);
    notify(
      selected
        ? "Usuário e permissões atualizados."
        : "Usuário criado. Troca de senha exigida no primeiro acesso.",
    );
    await query.refetch();
    try {
      await refresh();
    } catch {
      notify(
        `O usuário ${user.name} foi salvo. Atualize para recarregar os acessos.`,
      );
    }
  }
  async function removeProfile() {
    if (!deleteProfile || busy) return;
    setBusy(true);
    setProfileError("");
    try {
      await client.updateWorkspaceSettings({
        expectedRevision: data.workspace.revision,
        departments: data.workspace.departments,
        accessProfiles: data.workspace.accessProfiles.filter(
          (item) => item.id !== deleteProfile.id,
        ),
        documentTypes: data.workspace.documentTypes,
        documentRules: data.workspace.documentRules,
      });
      await refresh();
      setDeleteProfile(undefined);
      notify("Modelo removido. Acessos dos usuários preservados.");
    } catch (cause) {
      setProfileError(
        cause instanceof Error ? cause.message : "Não foi possível remover.",
      );
    } finally {
      setBusy(false);
    }
  }
  function exportAccounts() {
    downloadText(
      "apice-usuarios.csv",
      [
        [
          "Nome",
          "Usuário",
          "E-mail",
          "Cargo",
          "Departamentos",
          "Gestor",
          "Página inicial",
          "Situação",
          "Permissões",
        ],
        ...filtered.map((user) => [
          user.name,
          user.username,
          user.email ?? "",
          roleLabels[user.role],
          user.departments.map(departmentName).join(" | "),
          accounts.find((item) => item.userId === user.managerId)?.name ?? "",
          HOME_LABELS[user.homeView ?? "personal"],
          user.active ? "Ativo" : "Inativo",
          user.permissions.join(" | "),
        ]),
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n"),
    );
    notify("Cadastro exportado sem senhas.");
  }
  return (
    <>
      <PageHeading
        title="Usuários e permissões"
        description="Contas individuais, hierarquia e modelos de acesso."
      >
        {canManage && (
          <>
            <button className="button button-white" onClick={exportAccounts}>
              <ExportFileIcon size={16} />
              Exportar
            </button>
            <UserImport
              accounts={accounts}
              onImported={async () => {
                await query.refetch();
                await refresh();
              }}
            />
            {hasPermission(actor, "settings.view") && (
              <Link
                className="button button-white"
                to="/configuracoes?aba=departments"
              >
                Departamentos e cargos
              </Link>
            )}
            {tab !== "client" && (
              <button
                className="button button-primary"
                onClick={() => {
                  if (tab === "profiles") {
                    setProfile(undefined);
                    setProfileOpen(true);
                  } else {
                    setSelected(undefined);
                    setOpen(true);
                  }
                }}
              >
                <AddIcon size={17} />
                {tab === "profiles" ? "Novo modelo" : "Novo usuário"}
              </button>
            )}
          </>
        )}
      </PageHeading>
      <div
        className="account-tabs"
        role="tablist"
        aria-label="Gestão de acessos"
      >
        <button
          role="tab"
          aria-selected={tab === "users"}
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          <UserAccessIcon size={17} />
          Usuários <span>{accounts.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "profiles"}
          className={tab === "profiles" ? "active" : ""}
          onClick={() => setTab("profiles")}
        >
          <TaskBlueprintIcon size={17} />
          Modelos de acesso <span>{data.workspace.accessProfiles.length}</span>
        </button>
        {canManage && (
          <button
            role="tab"
            aria-selected={tab === "client"}
            className={tab === "client" ? "active" : ""}
            onClick={() => setTab("client")}
          >
            <ExternalLinkIcon size={17} />
            Portal do Cliente
          </button>
        )}
      </div>
      {tab === "client" && canManage ? (
        <ClientPortalUsers companies={data.companies} />
      ) : tab === "users" ? (
        <section className="surface">
          <div className="table-toolbar">
            <label className="search-field">
              <SearchIcon size={17} />
              <input
                aria-label="Buscar usuários"
                placeholder="Nome, usuário, e-mail ou departamento..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <span className="account-list-total">
              {filtered.length} usuários
            </span>
          </div>
          {!canManage ? (
            <EmptyState
              title="Acesso indisponível"
              text="Seu usuário não pode gerenciar usuários."
            />
          ) : query.isPending ? (
            <div className="account-loading">
              <Busy busy>Carregando usuários...</Busy>
            </div>
          ) : query.isError ? (
            <div className="account-list-error">
              <FormError
                message={
                  query.error instanceof Error
                    ? query.error.message
                    : "Não foi possível carregar."
                }
              />
              <button
                className="button button-white"
                onClick={() => void query.refetch()}
              >
                Tentar novamente
              </button>
            </div>
          ) : filtered.length ? (
            <div className="table-wrap">
              <table className="data-table account-table">
                <thead>
                  <tr>
                    <th>NOME / USUÁRIO</th>
                    <th>CARGO / GESTOR</th>
                    <th>DEPARTAMENTOS</th>
                    <th>ACESSOS</th>
                    <th>SITUAÇÃO</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr
                      key={user.userId}
                      className="row-clickable"
                      onClick={(event) => {
                        if (fromControl(event)) return;
                        setSelected(user);
                        setOpen(true);
                      }}
                    >
                      <td>
                        <span className="account-name">
                          <span className="avatar avatar-small">
                            {user.initials}
                          </span>
                          <span>
                            <strong>{user.name}</strong>
                            <span>{user.username}</span>
                            {user.email && <span>{user.email}</span>}
                          </span>
                        </span>
                      </td>
                      <td data-label="Cargo / gestor">
                        <div className="account-status">
                          <span>{roleLabels[user.role]}</span>
                          <small>
                            {accounts.find(
                              (item) => item.userId === user.managerId,
                            )?.name ?? "Sem gestor vinculado"}
                          </small>
                        </div>
                      </td>
                      <td data-label="Departamentos">
                        <span className="account-department-list">
                          {user.departments.map(departmentName).join(" · ")}
                        </span>
                      </td>
                      <td data-label="Acessos">
                        <span className="account-access-count">
                          {user.permissions.length} permissões
                        </span>
                        <small className="account-home-label">
                          {HOME_LABELS[user.homeView ?? "personal"]}
                        </small>
                      </td>
                      <td data-label="Situação">
                        <div className="account-status">
                          <span
                            className={`badge ${user.active ? "status-done" : "status-dispensed"}`}
                          >
                            {user.active ? "Ativo" : "Inativo"}
                          </span>
                          {user.mustChangePassword && (
                            <small>Troca de senha pendente</small>
                          )}
                        </div>
                      </td>
                      <td className="account-actions-cell">
                        <button
                          className="text-button"
                          aria-label={`Editar usuário ${user.name}`}
                          onClick={() => {
                            setSelected(user);
                            setOpen(true);
                          }}
                        >
                          <EditIcon size={14} />
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nenhum usuário encontrado"
              text="Ajuste a busca ou cadastre um usuário."
            />
          )}
          <footer className="table-footer">
            <span>
              {filtered.length} de {accounts.length} usuários
            </span>
            <span>Concessões individuais, sem limite por cargo</span>
          </footer>
        </section>
      ) : (
        <section>
          <p className="account-profile-intro">
            Prepare acessos reutilizáveis e aplique ao cadastrar ou editar uma
            pessoa. Alterar o modelo não modifica contas já criadas.
          </p>
          <div className="account-profile-grid">
            {data.workspace.accessProfiles.map((item) => (
              <article className="surface account-profile-card" key={item.id}>
                <TaskBlueprintIcon size={22} />
                <h2>{item.name}</h2>
                <p>
                  {roleLabels[item.role]} ·{" "}
                  {HOME_LABELS[item.homeView ?? "personal"]}
                </p>
                <div className="account-profile-chips">
                  {item.departments.map((id) => (
                    <span className="badge status-todo" key={id}>
                      {departmentName(id)}
                    </span>
                  ))}
                </div>
                <small>{item.permissions.length} permissões configuradas</small>
                <footer>
                  <button
                    className="text-button"
                    onClick={() => {
                      setProfile(item);
                      setProfileOpen(true);
                    }}
                  >
                    <EditIcon size={14} />
                    Editar
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setProfile({
                        ...item,
                        id: crypto.randomUUID(),
                        name: `${item.name} — cópia`,
                      });
                      setProfileOpen(true);
                    }}
                  >
                    <DuplicateIcon size={14} />
                    Duplicar
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remover modelo ${item.name}`}
                    onClick={() => {
                      setDeleteProfile(item);
                      setProfileError("");
                    }}
                  >
                    <DeleteIcon size={15} />
                  </button>
                </footer>
              </article>
            ))}
          </div>
          {!data.workspace.accessProfiles.length && (
            <EmptyState
              title="Crie o primeiro modelo de acesso"
              text="Defina departamentos e ações para reutilizar nos próximos cadastros."
            />
          )}
        </section>
      )}
      <Modal
        open={open && canManage}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title={selected ? "Editar usuário" : "Novo usuário"}
        description="Defina identidade, gestor, departamentos e acessos individuais."
        wide
      >
        <AccountEditor
          key={selected?.userId ?? "new"}
          user={selected}
          accounts={accounts}
          busy={busy}
          setBusy={setBusy}
          onCancel={() => setOpen(false)}
          onSaved={saved}
        />
      </Modal>
      <Modal
        open={profileOpen && canManage}
        onOpenChange={setProfileOpen}
        title={profile ? "Editar modelo de acesso" : "Novo modelo de acesso"}
        description="Configuração reutilizável; dados pessoais e senhas não fazem parte do modelo."
        wide
      >
        <ProfileEditor
          key={profile?.id ?? "new"}
          profile={profile}
          onClose={() => setProfileOpen(false)}
        />
      </Modal>
      <Modal
        open={!!deleteProfile}
        onOpenChange={(value) => {
          if (!value && !busy) setDeleteProfile(undefined);
        }}
        title="Remover modelo de acesso"
        description="Os usuários que receberam este modelo manterão suas permissões."
      >
        <p>Remover {deleteProfile?.name}?</p>
        <FormError message={profileError} />
        <footer className="form-actions">
          <button
            className="button button-white"
            disabled={busy}
            onClick={() => setDeleteProfile(undefined)}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void removeProfile()}
          >
            <Busy busy={busy}>Remover modelo</Busy>
          </button>
        </footer>
      </Modal>
    </>
  );
}
