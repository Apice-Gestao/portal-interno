import { useState } from "react";
import type { FormEvent } from "react";
import type { Company } from "@apice/domain";
import {
  AddIcon,
  EditIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "../../shared/icons";
import { EmptyState, Modal } from "../../shared/ui/components";
import { SelectField } from "../../shared/ui/SelectField";

// DEMONSTRATION ONLY (17/10/2026): the user asked for an illustrative client
// portal registration with fictitious data. Nothing here reaches the API or the database.

type ClientAccess = "documents" | "upload" | "obligations";
interface ClientUser {
  id: string;
  name: string;
  email: string;
  companyId: string;
  access: ClientAccess[];
  active: boolean;
}

const ACCESS_LABELS: Record<ClientAccess, string> = {
  documents: "Ver e baixar documentos",
  upload: "Enviar documentos",
  obligations: "Acompanhar obrigações",
};
const ACCESS_SHORT: Record<ClientAccess, string> = {
  documents: "Documentos",
  upload: "Envio",
  obligations: "Obrigações",
};
const ACCESS_ORDER: ClientAccess[] = ["documents", "upload", "obligations"];

function sampleUsers(companies: Company[]): ClientUser[] {
  const pick = (index: number) =>
    companies[index]?.id ?? companies[0]?.id ?? "";
  return [
    {
      id: "demo-client-1",
      name: "Carla Mendes",
      email: "carla.mendes@cliente.exemplo",
      companyId: pick(0),
      access: ["documents", "upload", "obligations"],
      active: true,
    },
    {
      id: "demo-client-2",
      name: "Roberto Lima",
      email: "financeiro@cliente.exemplo",
      companyId: pick(1),
      access: ["documents"],
      active: true,
    },
    {
      id: "demo-client-3",
      name: "Patrícia Souza",
      email: "patricia@cliente.exemplo",
      companyId: pick(2),
      access: ["documents", "obligations"],
      active: false,
    },
  ];
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

function ClientUserForm({
  user,
  companies,
  onCancel,
  onSave,
}: {
  user?: ClientUser;
  companies: Company[];
  onCancel: () => void;
  onSave: (user: ClientUser) => void;
}) {
  const [companyId, setCompanyId] = useState(
    user?.companyId ?? companies[0]?.id ?? "",
  );
  const [access, setAccess] = useState<ClientAccess[]>(
    user?.access ?? ["documents"],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: user?.id ?? `demo-client-${Date.now()}`,
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      companyId,
      access: ACCESS_ORDER.filter((item) => access.includes(item)),
      active: user ? form.get("active") === "on" : true,
    });
  };
  return (
    <form onSubmit={submit}>
      <p className="client-portal-note">
        Demonstração: os dados são fictícios e não são salvos.
      </p>
      <div className="form-grid">
        <label className="full">
          Nome completo
          <input
            name="name"
            required
            minLength={3}
            maxLength={100}
            defaultValue={user?.name ?? ""}
          />
        </label>
        <label className="full">
          E-mail
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={user?.email ?? ""}
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className="full">
          Empresa vinculada
          <SelectField
            aria-label="Empresa vinculada"
            value={companyId}
            onValueChange={setCompanyId}
            options={companies.map((company) => ({
              value: company.id,
              label: company.name,
            }))}
          />
        </label>
      </div>
      <fieldset className="client-access-fieldset">
        <legend>Acessos no Portal do Cliente</legend>
        {ACCESS_ORDER.map((item) => (
          <label className="account-checkbox" key={item}>
            <input
              type="checkbox"
              checked={access.includes(item)}
              onChange={(event) =>
                setAccess((current) =>
                  event.target.checked
                    ? [...current, item]
                    : current.filter((value) => value !== item),
                )
              }
            />
            <span>
              {ACCESS_LABELS[item]}
              {item === "obligations" && (
                <em className="client-optional">Opcional</em>
              )}
            </span>
          </label>
        ))}
        <p className="account-field-note">
          Acompanhar obrigações é facultativo: quando marcado, o cliente vê a
          situação das entregas da competência.
        </p>
      </fieldset>
      {user && (
        <div className="account-active-state">
          <label className="account-checkbox">
            <input name="active" type="checkbox" defaultChecked={user.active} />
            <span>Usuário ativo</span>
          </label>
        </div>
      )}
      <footer className="form-actions">
        <button
          type="button"
          className="button button-white"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button type="submit" className="button button-primary">
          {user ? "Salvar alterações" : "Cadastrar usuário do cliente"}
        </button>
      </footer>
    </form>
  );
}

export function ClientPortalUsers({ companies }: { companies: Company[] }) {
  const [users, setUsers] = useState<ClientUser[]>(() =>
    sampleUsers(companies),
  );
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientUser>();
  const [open, setOpen] = useState(false);
  const companyName = (id: string) =>
    companies.find((company) => company.id === id)?.name ?? "Empresa fictícia";
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = users.filter((user) =>
    `${user.name} ${user.email} ${companyName(user.companyId)}`
      .toLocaleLowerCase("pt-BR")
      .includes(term),
  );
  const save = (user: ClientUser) => {
    setUsers((current) =>
      current.some((item) => item.id === user.id)
        ? current.map((item) => (item.id === user.id ? user : item))
        : [...current, user],
    );
    setOpen(false);
  };
  return (
    <section className="surface client-portal">
      <div className="client-portal-intro">
        <span className="client-portal-icon">
          <ExternalLinkIcon size={18} />
        </span>
        <div>
          <strong>Usuários do Portal do Cliente</strong>
          <p>
            Acessos externos dos clientes, separados dos colaboradores do
            escritório. Cada pessoa vê apenas a empresa vinculada.
          </p>
        </div>
        <span className="client-portal-demo">Demonstração</span>
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <SearchIcon size={17} />
          <input
            aria-label="Buscar usuários do cliente"
            placeholder="Nome, e-mail ou empresa..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          <AddIcon size={16} />
          Novo usuário do cliente
        </button>
      </div>
      {filtered.length ? (
        <div className="table-wrap">
          <table className="data-table account-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Empresa</th>
                <th>Acessos</th>
                <th>Situação</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="account-name">
                      <span className="avatar avatar-small">
                        {initials(user.name)}
                      </span>
                      <span>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>{companyName(user.companyId)}</td>
                  <td>
                    <span className="client-access-tags">
                      {user.access.length ? (
                        user.access.map((item) => (
                          <span key={item} title={ACCESS_LABELS[item]}>
                            {ACCESS_SHORT[item]}
                          </span>
                        ))
                      ) : (
                        <small>Sem acessos</small>
                      )}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${user.active ? "status-done" : "status-dispensed"}`}
                    >
                      {user.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Editar usuário do cliente ${user.name}`}
                      onClick={() => {
                        setEditing(user);
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
          title="Nenhum usuário do cliente encontrado"
          text="Ajuste a busca ou cadastre um usuário do cliente."
        />
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={
          editing ? "Editar usuário do cliente" : "Novo usuário do cliente"
        }
        description="Acesso externo ao Portal do Cliente, vinculado a uma empresa."
      >
        <ClientUserForm
          key={editing?.id ?? "new"}
          user={editing}
          companies={companies}
          onCancel={() => setOpen(false)}
          onSave={save}
        />
      </Modal>
    </section>
  );
}
