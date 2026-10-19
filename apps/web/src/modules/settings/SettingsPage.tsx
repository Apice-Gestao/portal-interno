import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SecurityIcon,
  TeamIcon,
  AuditHistoryIcon,
  StorageIcon,
  SearchIcon,
  AccessLockIcon,
  CompletedIcon,
  ServerIcon,
  AccessKeyIcon,
} from "../../shared/icons";
import { businessTime, dateLabel, roleLabels } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { isHostedDemo } from "../../services/portal-client";
import { EmptyState, PageHeading } from "../../shared/ui/components";
import { DepartmentSettings } from "./DepartmentSettings";
const tabs = [
  { id: "departments", label: "Departamentos", icon: TeamIcon },
  { id: "team", label: "Equipe e acesso", icon: TeamIcon },
  { id: "audit", label: "Auditoria", icon: AuditHistoryIcon },
  { id: "storage", label: "Ambiente e armazenamento", icon: StorageIcon },
];
export default function SettingsPage() {
  const { data, actor } = usePortal();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("aba") ?? "departments");
  const [search, setSearch] = useState("");
  const [eventPage, setEventPage] = useState(1);
  const events = data.audit.filter((e) =>
    `${e.actorName} ${e.action} ${e.detail}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const pageCount = Math.max(1, Math.ceil(events.length / 100));
  const currentPage = Math.min(eventPage, pageCount);
  return (
    <>
      <PageHeading
        title="Configurações"
        description="Estrutura do escritório, acessos e rastreabilidade da operação."
      />
      <div className="settings-tabs">
        {tabs.map((item) => (
          <button
            className={tab === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={17} />
            {item.label}
          </button>
        ))}
      </div>
      {tab === "departments" && <DepartmentSettings />}
      {tab === "team" && (
        <>
          <section className="surface">
            <div className="surface-heading">
              <div>
                <span className="eyebrow">ÁPICE CONTÁBIL</span>
                <h2>Equipe e perfis</h2>
              </div>
              <span className="badge status-todo">
                {data.users.length} pessoas no escopo
              </span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PESSOA</th>
                    <th>PERFIL</th>
                    <th>DEPARTAMENTOS</th>
                    <th>PERMISSÕES ATRIBUÍDAS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.userId}>
                      <td>
                        <span className="owner-cell">
                          <span className="avatar avatar-small">
                            {user.initials}
                          </span>
                          {user.name}
                          {user.userId === actor.userId && (
                            <span className="badge status-todo">Você</span>
                          )}
                        </span>
                      </td>
                      <td>{roleLabels[user.role]}</td>
                      <td>{user.departments.join(", ")}</td>
                      <td>
                        <span className="badge status-done">
                          {user.permissions === undefined
                            ? "Demonstração"
                            : `${user.permissions.length} ${user.permissions.length === 1 ? "permissão" : "permissões"}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="settings-info-grid">
            <div className="surface settings-info">
              <SecurityIcon size={23} />
              <h3>Permissões por perfil e escopo</h3>
              <p>
                O administrador define abas, ações e departamentos por pessoa. O
                cargo não concede nem bloqueia acessos automaticamente.
              </p>
            </div>
            <div className="surface settings-info">
              <AccessKeyIcon size={23} />
              <h3>Login individual</h3>
              <p>
                Contas e permissões ficam no banco. Senhas são armazenadas como
                hash; a senha temporária deve ser trocada no primeiro acesso.
                Desativar a conta revoga seu acesso.
              </p>
            </div>
          </div>
        </>
      )}
      {tab === "audit" && (
        <section className="surface">
          <div className="table-toolbar">
            <label className="search-field">
              <SearchIcon size={17} />
              <input
                placeholder="Buscar evento ou pessoa..."
                aria-label="Buscar auditoria"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setEventPage(1);
                }}
              />
            </label>
            <span className="badge status-todo">
              <AccessLockIcon size={13} />
              Somente leitura
            </span>
          </div>
          {events.length ? (
            <div className="table-wrap">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th>EVENTO</th>
                    <th>CONTEXTO / JUSTIFICATIVA</th>
                    <th>AUTOR</th>
                    <th>DATA E HORA</th>
                  </tr>
                </thead>
                <tbody>
                  {events
                    .slice((currentPage - 1) * 100, currentPage * 100)
                    .map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.action}</strong>
                        </td>
                        <td>{event.detail}</td>
                        <td>{event.actorName}</td>
                        <td>
                          {dateLabel(event.at)} · {businessTime(event.at)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState />
          )}
          <footer className="table-footer">
            <span>{events.length} eventos no seu escopo</span>
            <div className="pagination">
              <button
                className="icon-button"
                disabled={currentPage === 1}
                onClick={() => setEventPage(currentPage - 1)}
                aria-label="Eventos anteriores"
              >
                ‹
              </button>
              <span>
                {currentPage} / {pageCount}
              </span>
              <button
                className="icon-button"
                disabled={currentPage === pageCount}
                onClick={() => setEventPage(currentPage + 1)}
                aria-label="Próximos eventos"
              >
                ›
              </button>
            </div>
            <span>
              {data.persistence === "postgres"
                ? "Histórico persistido no banco local"
                : "Histórico temporário desta demonstração"}
            </span>
          </footer>
        </section>
      )}
      {tab === "storage" && (
        <section className="surface environment-surface">
          <div className="surface-heading">
            <div>
              <span className="eyebrow">AMBIENTE ATUAL</span>
              <h2>
                {data.persistence === "postgres"
                  ? "Banco local, dados preservados"
                  : "Dados temporários, estrutura preparada"}
              </h2>
            </div>
            <ServerIcon size={23} />
          </div>
          <div className="environment-rows">
            <div>
              <span>Interface</span>
              <strong>React + Vite + TypeScript</strong>
              <CompletedIcon size={17} />
            </div>
            <div>
              <span>API em execução</span>
              <strong>
                {isHostedDemo
                  ? "Demonstração no navegador"
                  : "NestJS · ambiente local"}
              </strong>
              <CompletedIcon size={17} />
            </div>
            <div>
              <span>Persistência</span>
              <strong>
                {data.persistence === "postgres"
                  ? "PostgreSQL local"
                  : "Memória do ambiente"}
              </strong>
              <span className="badge status-waiting">
                {data.persistence === "postgres" ? "Persistente" : "Temporária"}
              </span>
            </div>
            <div>
              <span>Banco de dados</span>
              <strong>
                {data.persistence === "postgres"
                  ? "PostgreSQL · migrações portáveis"
                  : "Supabase PostgreSQL"}
              </strong>
              <span className="badge status-todo">
                {data.persistence === "postgres"
                  ? "Local"
                  : "Integração futura"}
              </span>
            </div>
            <div>
              <span>Destino documental</span>
              <strong>
                {data.persistence === "postgres"
                  ? "Evidências privadas no banco local"
                  : "Memória da prévia"}
              </strong>
              <span className="badge status-todo">Conector futuro</span>
            </div>
          </div>
          <div className="info-box">
            <SecurityIcon size={20} />
            <p>
              Use apenas dados fictícios.{" "}
              {data.persistence === "postgres"
                ? "Tarefas, evidências e contas sobrevivem ao reinício. As sessões precisam de novo login."
                : "Recarregar a prévia restaura os dados de demonstração."}
            </p>
          </div>
        </section>
      )}
    </>
  );
}
