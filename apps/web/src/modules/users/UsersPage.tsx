import { SelectField } from "../../shared/ui/SelectField";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Pencil, UsersRound } from "lucide-react";
import {
  hasPermission,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "@apice/domain";
import type {
  AccountInput,
  AccountUpdate,
  AccountUser,
  Department,
  Permission,
  Role,
} from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  Busy,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import "./users.css";

const DEPARTMENTS: Department[] = ["Fiscal", "Contábil", "Pessoal"];
const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  coordinator: "Coordenador",
  operator: "Operador",
  viewer: "Consulta",
};

function AccountEditor({
  user,
  busy,
  setBusy,
  onCancel,
  onSaved,
}: {
  user?: AccountUser;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: (user: AccountUser) => Promise<void>;
}) {
  const { client, localTest } = usePortal();
  const shortcutAccount =
    localTest && !!user && ["helena", "julia"].includes(user.userId);
  const [role, setRole] = useState<Role>(user?.role ?? "operator");
  const [departments, setDepartments] = useState<Department[]>(
    user?.departments ?? [],
  );
  const [permissions, setPermissions] = useState<Permission[]>(
    user?.permissions ?? [],
  );
  const [error, setError] = useState("");
  const submitting = useRef(false);

  function changeRole(next: Role) {
    setRole(next);
  }

  function toggleDepartment(department: Department, checked: boolean) {
    setDepartments((current) =>
      checked
        ? [...current, department]
        : current.filter((value) => value !== department),
    );
  }

  function togglePermission(permission: Permission, checked: boolean) {
    setPermissions((current) =>
      checked
        ? [...current, permission]
        : current.filter((value) => value !== permission),
    );
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
        if (localTest && !input.email) delete update.email;
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
          : "Não foi possível salvar o usuário. Tente novamente.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const groups = PERMISSION_GROUPS;

  return (
    <form className="account-form" onSubmit={submit}>
      <fieldset className="account-fields" disabled={busy}>
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
              required={!localTest || !user}
              maxLength={254}
              defaultValue={user?.email ?? ""}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="account-email-help"
            />
          </label>
          <p className="account-field-note full" id="account-email-help">
            {localTest && user
              ? "E-mail opcional para esta conta fictícia de teste."
              : "Usado na recuperação de senha."}
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
            Tipo de usuário
            <SelectField
              aria-label="Tipo de usuário"
              value={role}
              onValueChange={(value) => changeRole(value as Role)}
            >
              <option value="operator">Operador</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrador</option>
              {user?.role === "viewer" && (
                <option value="viewer">Consulta</option>
              )}
              {user?.role === "coordinator" && (
                <option value="coordinator">Coordenador</option>
              )}
            </SelectField>
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
                aria-describedby="account-password-help"
              />
            </label>
          )}
          <p className="account-field-note full" id="account-password-help">
            {shortcutAccount
              ? "Senha gerida pela configuração local de testes."
              : user
                ? "Em branco mantém a senha. Uma nova senha exige troca no próximo acesso."
                : "12 a 128 caracteres. Troca obrigatória no primeiro acesso."}
          </p>
        </div>

        <fieldset className="account-selection">
          <legend>Departamentos</legend>
          <div className="account-departments">
            {DEPARTMENTS.map((department) => (
              <label className="account-checkbox" key={department}>
                <input
                  type="checkbox"
                  checked={departments.includes(department)}
                  onChange={(event) =>
                    toggleDepartment(department, event.target.checked)
                  }
                />
                <span>{department}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="account-selection">
          <legend>Abas e ações permitidas</legend>
          <p>Habilite a aba antes de conceder suas ações.</p>
          <details className="account-scope-help">
            <summary>Como os acessos funcionam</summary>
            <p>
              O cargo não limita as permissões. Você pode conceder qualquer
              acesso, inclusive tarefas da equipe, a qualquer usuário.
            </p>
          </details>
          <div className="account-permission-groups">
            {groups.map((group) => (
              <fieldset key={group.label} className="account-permission-group">
                <legend>{group.label}</legend>
                {group.permissions.map((permission) => (
                  <label className="account-checkbox" key={permission}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={(event) =>
                        togglePermission(permission, event.target.checked)
                      }
                    />
                    <span>{PERMISSION_LABELS[permission]}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </fieldset>

        {user && (
          <div className="account-active-state">
            <label className="account-checkbox">
              <input
                name="active"
                type="checkbox"
                defaultChecked={user.active}
              />
              <span>Usuário ativo</span>
            </label>
            <p>
              Desativar bloqueia o acesso e preserva o histórico do usuário.
            </p>
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

export default function UsersPage() {
  const { actor, client, refresh, notify } = usePortal();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AccountUser>();
  const [busy, setBusy] = useState(false);
  const canManage = hasPermission(actor, "users.manage");
  const query = useQuery({
    queryKey: ["account-users", actor.tenantId, actor.userId],
    queryFn: () => client.listUsers(),
    enabled: canManage,
    retry: false,
  });
  const accounts = query.data ?? [];
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = accounts.filter((user) =>
    `${user.name} ${user.username} ${user.email ?? ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(term),
  );

  async function saved(user: AccountUser) {
    setOpen(false);
    notify(
      selected
        ? "Usuário e permissões atualizados."
        : "Usuário criado. A troca de senha será exigida no primeiro acesso.",
    );
    await query.refetch();
    try {
      await refresh();
    } catch {
      notify(
        `O usuário ${user.name} foi salvo. Atualize a página para recarregar os acessos.`,
      );
    }
  }

  return (
    <>
      <PageHeading
        title="Usuários e permissões"
        description="Contas, departamentos e acessos."
      >
        {canManage && (
          <button
            className="button button-primary"
            onClick={() => {
              setSelected(undefined);
              setOpen(true);
            }}
          >
            <Plus size={17} />
            Novo usuário
          </button>
        )}
      </PageHeading>
      <section className="surface">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Buscar usuários"
              placeholder="Buscar por nome, usuário ou e-mail..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span className="account-list-total">
            <UsersRound size={16} aria-hidden="true" />
            {accounts.length} usuários
          </span>
        </div>
        {!canManage ? (
          <EmptyState
            title="Acesso indisponível"
            text="Seu usuário não tem permissão para gerenciar usuários."
          />
        ) : query.isPending ? (
          <div className="account-loading" role="status">
            <Busy busy>Carregando usuários...</Busy>
          </div>
        ) : query.isError ? (
          <div className="account-list-error">
            <FormError
              message={
                query.error instanceof Error
                  ? query.error.message
                  : "Não foi possível carregar os usuários."
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
                  <th>TIPO</th>
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
                  <tr key={user.userId}>
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
                    <td>{ROLE_LABELS[user.role]}</td>
                    <td>
                      <span className="account-department-list">
                        {user.departments.join(" · ") || "Nenhum"}
                      </span>
                    </td>
                    <td>
                      <span className="account-access-count">
                        {user.permissions.length} permissões
                      </span>
                    </td>
                    <td>
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
                    <td>
                      <button
                        className="text-button"
                        aria-label={`Editar usuário ${user.name}`}
                        onClick={() => {
                          setSelected(user);
                          setOpen(true);
                        }}
                      >
                        <Pencil size={14} aria-hidden="true" />
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
            title={
              accounts.length
                ? "Nenhum usuário encontrado"
                : "Nenhum usuário cadastrado"
            }
            text={
              accounts.length
                ? "Ajuste a busca para encontrar o usuário."
                : "Cadastre um usuário e escolha as abas e ações permitidas."
            }
          />
        )}
        {!query.isPending && !query.isError && canManage && (
          <footer className="table-footer">
            <span>
              {filtered.length} de {accounts.length} usuários
            </span>
          </footer>
        )}
      </section>
      <Modal
        open={open && canManage}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title={selected ? "Editar usuário" : "Novo usuário"}
        description={
          selected
            ? "Atualize os dados, a situação e os acessos deste usuário."
            : "Cadastre o usuário e marque as abas e ações que ele poderá acessar."
        }
        wide
      >
        <AccountEditor
          key={selected?.userId ?? "new"}
          user={selected}
          busy={busy}
          setBusy={setBusy}
          onCancel={() => setOpen(false)}
          onSaved={saved}
        />
      </Modal>
    </>
  );
}
