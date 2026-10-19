import { SelectField } from "../../shared/ui/SelectField";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  SearchIcon,
  DocumentIcon,
  DownloadIcon,
  DocumentVaultIcon,
  ReviewIcon,
  DocumentRuleIcon,
  SecurityIcon,
  AuditHistoryIcon,
  CloseIcon,
  FilterIcon,
  ExternalLinkIcon,
} from "../../shared/icons";
import {
  businessDate,
  competenceLabel,
  dateLabel,
  hasPermission,
} from "@apice/domain";
import type { DocumentVersion, Task } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  CompetenceSelect,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import { DatePicker } from "../../shared/ui/CompetencePicker";
import { DocumentBatch } from "./DocumentBatch";
import { DocumentConfiguration } from "./DocumentConfiguration";
import { latestDocuments } from "./document-utils";
import { downloadBlob } from "../../shared/downloads";
import "./documents.css";
export default function DocumentsPage() {
  const { actor } = usePortal();
  const [tab, setTab] = useState("files");
  return (
    <>
      <div className="section-tabs" aria-label="Áreas de documentos">
        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => setTab("files")}
        >
          <DocumentVaultIcon size={17} />
          Arquivos
        </button>
        {hasPermission(actor, "tasks.attach") && (
          <button
            className={tab === "batch" ? "active" : ""}
            onClick={() => setTab("batch")}
          >
            <DocumentIcon size={17} />
            Enviar em lote
          </button>
        )}
        <button
          className={tab === "rules" ? "active" : ""}
          onClick={() => setTab("rules")}
        >
          <DocumentRuleIcon size={17} />
          Tipos e regras
        </button>
      </div>
      {tab === "files" ? (
        <DocumentsList />
      ) : tab === "batch" ? (
        <>
          <PageHeading
            title="Envio de documentos em lote"
            description="Reconheça, revise e vincule documentos às atividades."
          />
          <DocumentBatch />
        </>
      ) : (
        <>
          <PageHeading
            title="Tipos e regras documentais"
            description="Documentos esperados e critérios de identificação por obrigação."
          />
          <DocumentConfiguration />
        </>
      )}
    </>
  );
}
interface DocumentFilters {
  scope: string;
  period: "competence" | "all";
  owner: string;
  author: string;
  company: string;
  obligation: string;
  type: string;
  kind: string;
  validation: string;
  from?: string;
  to?: string;
}
const EMPTY_FILTERS: DocumentFilters = {
  scope: "current",
  period: "competence",
  owner: "",
  author: "",
  company: "",
  obligation: "",
  type: "",
  kind: "",
  validation: "",
};
// Filters work on the documents already authorized in the session snapshot; no rule changes.
function DocumentsList() {
  const { data, actor, department, competence, client, notify } = usePortal();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DocumentFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Task>();
  const [error, setError] = useState("");
  const set = (patch: Partial<DocumentFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  const departmentName = (id: string) =>
    data.workspace.departments.find((item) => item.id === id)?.name ?? id;
  const userName = (id: string) =>
    id.startsWith("department:")
      ? `Fila · ${departmentName(id.slice(11))}`
      : (data.users.find((user) => user.userId === id)?.name ??
        "Colaborador fora do recorte");
  const companyName = (id: string) =>
    data.companies.find((company) => company.id === id)?.name ?? "";
  const typeName = (id?: string) =>
    data.workspace.documentTypes.find((type) => type.id === id)?.name;
  const scopeDepartments =
    filters.scope === "current"
      ? [department]
      : filters.scope === "all"
        ? actor.departments
        : [filters.scope];
  const tasks = data.tasks.filter(
    (t) =>
      scopeDepartments.includes(t.department) &&
      (filters.period === "all" || t.competence === competence),
  );
  const all = tasks.flatMap((task) => {
    return latestDocuments(task.documents).map((document) => ({
      task,
      document,
    }));
  });
  const term = search.toLocaleLowerCase("pt-BR");
  const documents = all.filter(({ task, document }) => {
    const sent = businessDate(document.createdAt);
    return (
      (!filters.kind || document.kind === filters.kind) &&
      (!filters.owner || task.assigneeId === filters.owner) &&
      (!filters.author || document.authorId === filters.author) &&
      (!filters.company || task.companyId === filters.company) &&
      (!filters.obligation || task.title === filters.obligation) &&
      (!filters.type || document.documentTypeId === filters.type) &&
      (!filters.validation || document.validation === filters.validation) &&
      (!filters.from || sent >= filters.from) &&
      (!filters.to || sent <= filters.to) &&
      `${document.name} ${companyName(task.companyId)} ${task.title} ${userName(task.assigneeId)}`
        .toLocaleLowerCase("pt-BR")
        .includes(term)
    );
  });
  const activeFilters = (
    Object.keys(EMPTY_FILTERS) as (keyof DocumentFilters)[]
  )
    .concat(["from", "to"])
    .filter(
      (key) => filters[key] && filters[key] !== EMPTY_FILTERS[key],
    ).length;
  const option = <T extends string>(values: T[], label: (value: T) => string) =>
    [...new Set(values)]
      .filter(Boolean)
      .map((value) => ({ value, label: label(value) }))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  const owners = option(
    all.map(({ task }) => task.assigneeId),
    userName,
  );
  const authors = option(
    all.map(({ document }) => document.authorId),
    userName,
  );
  const companiesOptions = option(
    all.map(({ task }) => task.companyId),
    companyName,
  );
  const obligations = option(
    all.map(({ task }) => task.title),
    (value) => value,
  );
  const types = option(
    all.map(({ document }) => document.documentTypeId ?? ""),
    (value) => typeName(value) ?? value,
  );
  async function download(task: Task, doc: DocumentVersion) {
    setError("");
    try {
      const blob = await client.downloadDocument(task.id, doc.id);
      if (downloadBlob(doc.name, blob)) notify("Download preparado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download indisponível.");
    }
  }
  return (
    <>
      <PageHeading
        title="Documentos"
        description="Evidências vinculadas a empresas, tarefas e competências."
      >
        <CompetenceSelect />
      </PageHeading>
      <div className="document-summary">
        <span className="summary-icon">
          <DocumentVaultIcon size={23} />
        </span>
        <div>
          <strong>{all.length} evidências disponíveis</strong>
          <p>
            {tasks.reduce((n, t) => n + t.documents.length, 0)} versões
            preservadas ·{" "}
            {filters.scope === "all"
              ? "todos os departamentos"
              : departmentName(scopeDepartments[0] ?? department)}
            {filters.period === "all" ? " · todas as competências" : ""}
          </p>
        </div>
        <span className="badge status-todo">
          <SecurityIcon size={14} />
          Visibilidade interna
        </span>
      </div>
      <FormError message={error} />
      <section className="surface">
        <div className="table-toolbar">
          <label className="search-field">
            <SearchIcon size={17} />
            <input
              placeholder="Buscar arquivo ou empresa..."
              aria-label="Buscar documentos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span className="document-filter-count">
            <FilterIcon size={15} />
            {activeFilters
              ? `${activeFilters} ${activeFilters === 1 ? "filtro ativo" : "filtros ativos"}`
              : "Sem filtros"}
          </span>
          {activeFilters > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              <CloseIcon size={14} />
              Limpar filtros
            </button>
          )}
        </div>
        <div className="document-filters">
          <label>
            Departamento
            <SelectField
              aria-label="Departamento"
              value={filters.scope}
              onValueChange={(scope) => set({ scope })}
            >
              <option value="current">
                Atual · {departmentName(department)}
              </option>
              {actor.departments.length > 1 && (
                <option value="all">Todos os meus departamentos</option>
              )}
              {actor.departments
                .filter((item) => item !== department)
                .map((item) => (
                  <option key={item} value={item}>
                    {departmentName(item)}
                  </option>
                ))}
            </SelectField>
          </label>
          <label>
            Período
            <SelectField
              aria-label="Período"
              value={filters.period}
              onValueChange={(period) =>
                set({ period: period as DocumentFilters["period"] })
              }
            >
              <option value="competence">
                Competência {competenceLabel(competence)}
              </option>
              <option value="all">Todas as competências</option>
            </SelectField>
          </label>
          <label>
            Colaborador responsável
            <SelectField
              aria-label="Colaborador responsável"
              value={filters.owner}
              onValueChange={(owner) => set({ owner })}
              options={[{ value: "", label: "Todos" }, ...owners]}
            />
          </label>
          <label>
            Enviado por
            <SelectField
              aria-label="Enviado por"
              value={filters.author}
              onValueChange={(author) => set({ author })}
              options={[{ value: "", label: "Todos" }, ...authors]}
            />
          </label>
          <label>
            Empresa
            <SelectField
              aria-label="Empresa"
              value={filters.company}
              onValueChange={(company) => set({ company })}
              options={[{ value: "", label: "Todas" }, ...companiesOptions]}
            />
          </label>
          <label>
            Obrigação
            <SelectField
              aria-label="Obrigação"
              value={filters.obligation}
              onValueChange={(obligation) => set({ obligation })}
              options={[{ value: "", label: "Todas" }, ...obligations]}
            />
          </label>
          <label>
            Tipo de documento
            <SelectField
              aria-label="Tipo de documento"
              value={filters.type}
              onValueChange={(type) => set({ type })}
              options={[{ value: "", label: "Todos" }, ...types]}
            />
          </label>
          <label>
            Formato
            <SelectField
              aria-label="Formato"
              value={filters.kind}
              onValueChange={(kind) => set({ kind })}
            >
              <option value="">Todos</option>
              <option value="PDF">PDF</option>
              <option value="XML">XML</option>
            </SelectField>
          </label>
          <label>
            Validação
            <SelectField
              aria-label="Validação"
              value={filters.validation}
              onValueChange={(validation) => set({ validation })}
            >
              <option value="">Todas</option>
              <option value="accepted">Aceitos</option>
              <option value="rejected">Rejeitados</option>
            </SelectField>
          </label>
          <label>
            Enviado de
            <DatePicker
              label="Enviado a partir de"
              placeholder="Qualquer data"
              value={filters.from}
              onValueChange={(from) => set({ from })}
            />
          </label>
          <label>
            Enviado até
            <DatePicker
              label="Enviado até"
              placeholder="Qualquer data"
              value={filters.to}
              onValueChange={(to) => set({ to })}
            />
          </label>
        </div>
        {documents.length ? (
          <div className="table-wrap">
            <table className="data-table document-table">
              <thead>
                <tr>
                  <th>ARQUIVO</th>
                  <th>EMPRESA</th>
                  <th>RESPONSÁVEL</th>
                  <th>DEPARTAMENTO</th>
                  <th>COMPETÊNCIA</th>
                  <th>VERSÃO</th>
                  <th>VERIFICAÇÃO</th>
                  <th>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(({ task, document }) => (
                  <tr key={document.id}>
                    <td>
                      <button
                        className="document-file row-action"
                        onClick={() => setSelected(task)}
                      >
                        <span className="file-icon">
                          <DocumentIcon size={20} />
                        </span>
                        <span>
                          <strong>{document.name}</strong>
                          <small>
                            {task.title} · {(document.bytes / 1024).toFixed(0)}{" "}
                            KB
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>{companyName(task.companyId)}</td>
                    <td>{userName(task.assigneeId)}</td>
                    <td>{departmentName(task.department)}</td>
                    <td>{competenceLabel(task.competence)}</td>
                    <td>
                      <span className="version-label">
                        v{document.logicalVersion ?? document.version}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${document.validation === "accepted" ? "status-done" : "status-returned"}`}
                        title={`Enviado por ${userName(document.authorId)} em ${dateLabel(document.createdAt)}`}
                      >
                        {document.validation === "accepted"
                          ? "Formato verificado"
                          : "Rejeitado"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Ver versões de ${document.name}`}
                          onClick={() => setSelected(task)}
                        >
                          <AuditHistoryIcon size={17} />
                        </button>
                        {hasPermission(actor, "tasks.download") && (
                          <button
                            className="icon-button"
                            aria-label={`Baixar ${document.name}`}
                            onClick={() => void download(task, document)}
                          >
                            <DownloadIcon size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhum documento nesta seleção"
            text="As evidências anexadas às tarefas aparecerão aqui."
          />
        )}
        <footer className="table-footer">
          <span>{documents.length} documentos encontrados</span>
          <span>Última versão de cada evidência</span>
        </footer>
      </section>
      <div className="page-footnote">
        <ReviewIcon size={14} />
        <span>
          Os documentos deste ambiente são fictícios e não têm validade fiscal.
        </span>
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(undefined);
        }}
        title="Histórico do documento"
        description={
          selected
            ? `${selected.title} · ${data.companies.find((c) => c.id === selected.companyId)?.name}`
            : undefined
        }
      >
        {selected && (
          <>
            <div className="document-versions-list">
              {[...selected.documents].reverse().map((doc) => (
                <div className="document-version" key={doc.id}>
                  <span className="file-icon">
                    <DocumentIcon size={21} />
                  </span>
                  <div>
                    <strong>{doc.name}</strong>
                    <p>
                      v{doc.logicalVersion ?? doc.version} ·{" "}
                      {dateLabel(doc.createdAt)} ·{" "}
                      {(doc.bytes / 1024).toFixed(0)} KB
                    </p>
                    <span className="badge status-done">
                      Formato verificado
                    </span>
                  </div>
                  {hasPermission(actor, "tasks.download") && (
                    <button
                      className="icon-button"
                      aria-label={`Baixar versão ${doc.version}`}
                      onClick={() => void download(selected, doc)}
                    >
                      <DownloadIcon size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="muted-note">
              A validação fiscal avançada não é executada neste ambiente.
            </p>
            {hasPermission(actor, "tasks.view") && (
              <footer className="form-actions">
                <Link
                  to={`/tarefas?task=${selected.id}`}
                  className="button button-primary"
                >
                  <ExternalLinkIcon size={15} />
                  Abrir tarefa vinculada
                </Link>
              </footer>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
