import { downloadText } from "../../shared/downloads";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ListTodo,
  Plus,
  Search,
  SlidersHorizontal,
  Download,
  X,
} from "lucide-react";
import {
  csvCell,
  dateLabel,
  deadline,
  hasPermission,
  metric,
  matchesSelection,
  statusLabels,
} from "@apice/domain";
import type { TaskStatus } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  CompetenceSelect,
  EmptyState,
  PageHeading,
} from "../../shared/ui/components";
import { TaskDrawer } from "./TaskDrawer";
import { NewTaskModal } from "./TaskForms";
import {
  TaskDeadlineBadge,
  TaskWorkflowLabel,
} from "../../shared/ui/TaskStatus";
import { SelectField } from "../../shared/ui/SelectField";
import { FilterMenu } from "../../shared/ui/FilterMenu";
export default function TasksPage() {
  const {
    data,
    actor,
    department,
    competence,
    setCompetence,
    notify,
    updating,
  } = usePortal();
  const [params, setParams] = useSearchParams();
  const [create, setCreate] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const tasks = data.tasks.filter(
    (t) => t.department === department && t.competence === competence,
  );
  const today = data.now.slice(0, 10);
  const m = metric(tasks, today);
  const status = params.get("status") ?? "all";
  const search = params.get("q") ?? "";
  const obligation = params.get("obligation") ?? "";
  const urgency = params.get("urgency") ?? "";
  const owner = params.get("owner") ?? "";
  const companyFilter = params.get("company") ?? "";
  const model = params.get("model") ?? "";
  const selected = params.get("task");
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  }
  function toggleLateTasks() {
    const next = new URLSearchParams(params);
    if (urgency === "legal") next.delete("urgency");
    else {
      next.set("urgency", "legal");
      // Closed deliveries cannot be legally overdue. Preserve the other refinements.
      if (["done", "dispensed", "closed"].includes(status))
        next.delete("status");
    }
    next.delete("page");
    setParams(next, { replace: true });
  }
  function openTask(id?: string) {
    const next = new URLSearchParams(params);
    if (id) next.set("task", id);
    else next.delete("task");
    setParams(next, { replace: !id });
  }
  const filtered = tasks
    .filter(
      (t) =>
        matchesSelection(
          t,
          { status, obligation, owner, urgency, company: companyFilter, model },
          today,
        ) &&
        `${data.companies.find((c) => c.id === t.companyId)?.name} ${t.title}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    )
    .sort(
      (a, b) =>
        (["done", "dispensed"].includes(a.status) ? 1 : 0) -
          (["done", "dispensed"].includes(b.status) ? 1 : 0) ||
        a.legalDue.localeCompare(b.legalDue) ||
        a.internalDue.localeCompare(b.internalDue),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * 8, current * 8);
  function exportTasks() {
    downloadText(
      `apice-tarefas-${competence}.csv`,
      [
        ["Empresa", "Obrigação", "Meta interna", "Prazo legal", "Status"],
        ...filtered.map((t) => [
          data.companies.find((c) => c.id === t.companyId)?.name,
          t.title,
          t.internalDue,
          t.legalDue,
          statusLabels[t.status],
        ]),
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n"),
    );
    notify("Exportação preparada com os filtros atuais.");
  }
  const tabs: { value: TaskStatus | "all"; label: string; count: number }[] = [
    { value: "all", label: "Todas as tarefas", count: tasks.length },
    {
      value: "todo",
      label: "A fazer",
      count: tasks.filter((t) => t.status === "todo").length,
    },
    {
      value: "in_progress",
      label: "Em andamento",
      count: tasks.filter((t) => t.status === "in_progress").length,
    },
    { value: "in_review", label: "Em conferência", count: m.review },
    { value: "done", label: "Concluídas", count: m.done },
  ];
  return (
    <>
      <PageHeading
        title={
          hasPermission(actor, "tasks.team.view")
            ? "Tarefas da equipe"
            : "Minhas tarefas"
        }
      >
        <CompetenceSelect />
        {hasPermission(actor, "tasks.create") && (
          <button
            className="button button-primary"
            onClick={() => setCreate(true)}
          >
            <Plus size={17} />
            Nova tarefa
          </button>
        )}
      </PageHeading>
      <div className="task-summary">
        <div className="summary-intro">
          <span className="summary-icon">
            <ListTodo size={22} />
          </span>
          <div>
            <strong>{tasks.length} tarefas</strong>
            <p>
              {
                data.companies.filter((c) =>
                  tasks.some((t) => t.companyId === c.id),
                ).length
              }{" "}
              empresas
            </p>
          </div>
        </div>
        <div className="summary-progress">
          <div>
            <span>Concluídas ou dispensadas</span>
            <strong>{m.progress}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${m.progress}%` }} />
          </div>
        </div>
        <button
          className={`summary-stat summary-late-filter ${m.legalLate ? "summary-stat-alert" : ""}`}
          onClick={toggleLateTasks}
          aria-pressed={urgency === "legal"}
          aria-label={`Filtrar ${m.legalLate} tarefas atrasadas`}
        >
          <CircleAlert size={18} />
          <div>
            <strong>{m.legalLate}</strong>
            <span>Atrasadas</span>
          </div>
        </button>
      </div>
      <FilterMenu
        label="Filtrar por status"
        value={status}
        options={tabs}
        onChange={(value) => filter("status", value)}
      />
      <section className="surface tasks-surface" aria-label="Lista de tarefas">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Buscar empresa ou obrigação..."
              value={search}
              onChange={(e) => filter("q", e.target.value)}
              aria-label="Buscar tarefas"
            />
          </label>
          <div className="toolbar-actions">
            <label className="filter-select">
              <SelectField
                aria-label="Filtrar obrigação"
                value={obligation}
                onValueChange={(value) => filter("obligation", value)}
              >
                <option value="">Todas as obrigações</option>
                {[...new Set(tasks.map((t) => t.title))].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </SelectField>
            </label>
            <label className="filter-select">
              <SelectField
                aria-label="Situação do prazo"
                value={urgency}
                onValueChange={(value) => filter("urgency", value)}
              >
                <option value="">Situação do prazo</option>
                <option value="today">Vence hoje</option>
                <option value="meta-only">Meta vencida</option>
                <option value="legal">Atrasada</option>
                <option value="on-time">Entregue no prazo</option>
              </SelectField>
            </label>
            <button
              className={`filter-button ${advanced ? "selected" : ""}`}
              onClick={() => setAdvanced(!advanced)}
              aria-expanded={advanced}
            >
              <SlidersHorizontal size={16} />
              Filtros
            </button>
            {hasPermission(actor, "tasks.export") && (
              <button
                className="icon-button"
                aria-label="Exportar tarefas em CSV"
                onClick={exportTasks}
              >
                <Download size={17} />
              </button>
            )}
          </div>
        </div>
        {advanced && (
          <div className="advanced-filters">
            <label>
              Status
              <SelectField
                aria-label="Filtrar status"
                value={status}
                onValueChange={(value) => filter("status", value)}
              >
                <option value="all">Todos os status</option>
                <option value="open">Em aberto</option>
                <option value="closed">
                  Encerradas: concluídas ou dispensadas
                </option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
            {hasPermission(actor, "tasks.team.view") && (
              <label>
                Responsável
                <SelectField
                  aria-label="Filtrar responsável"
                  value={owner}
                  onValueChange={(value) => filter("owner", value)}
                >
                  <option value="">Todos os responsáveis</option>
                  {data.users.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            <button
              className="text-button"
              onClick={() => setParams(selected ? { task: selected } : {})}
            >
              <X size={14} />
              Limpar filtros
            </button>
          </div>
        )}
        {filtered.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table task-table">
                <colgroup>
                  <col className="task-company-column" />
                  <col className="task-date-column" />
                  <col className="task-date-column" />
                  <col className="task-situation-column" />
                  <col className="task-owner-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Empresa / obrigação</th>
                    <th>Meta interna</th>
                    <th>Prazo legal</th>
                    <th>Situação</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => {
                    const company = data.companies.find(
                      (c) => c.id === t.companyId,
                    );
                    const d = deadline(t, today);
                    const user = data.users.find(
                      (u) => u.userId === t.assigneeId,
                    );
                    return (
                      <tr key={t.id} className="task-row">
                        <td>
                          <button
                            className="company-cell row-action"
                            onClick={() => openTask(t.id)}
                            aria-label={`Abrir ${t.title} de ${company?.name}`}
                          >
                            <span
                              className={`company-monogram monogram-${Number(company?.code ?? 0) % 4}`}
                            >
                              {company?.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="company-info">
                              <strong>{company?.name ?? "Empresa"}</strong>
                              <span>{t.title}</span>
                            </span>
                          </button>
                        </td>
                        <td>
                          <time
                            dateTime={t.internalDue}
                            title={`${dateLabel(t.internalDue)}/${t.internalDue.slice(0, 4)}`}
                            aria-label={`${dateLabel(t.internalDue)}/${t.internalDue.slice(0, 4)}`}
                            className={`date-value ${d.internalLate && !["done", "dispensed"].includes(t.status) ? "date-warning" : ""}`}
                          >
                            {dateLabel(t.internalDue)}
                          </time>
                        </td>
                        <td>
                          <time
                            dateTime={t.legalDue}
                            title={`${dateLabel(t.legalDue)}/${t.legalDue.slice(0, 4)}`}
                            aria-label={`${dateLabel(t.legalDue)}/${t.legalDue.slice(0, 4)}`}
                            className={`date-value ${d.legalLate && !["done", "dispensed"].includes(t.status) ? "date-danger" : ""}`}
                          >
                            {dateLabel(t.legalDue)}
                          </time>
                        </td>
                        <td>
                          <div className="task-situation">
                            <TaskDeadlineBadge task={t} today={today} />
                            {!["done", "dispensed"].includes(t.status) && (
                              <TaskWorkflowLabel status={t.status} />
                            )}
                            {t.dispenseRequested && (
                              <span className="date-hint">
                                Dispensa solicitada
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="owner-cell">
                            <span className="avatar avatar-tiny">
                              {user?.initials}
                            </span>
                            {user?.name.split(" ")[0]}{" "}
                            {user?.name.split(" ").at(-1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>
                {(current - 1) * 8 + 1}–{Math.min(current * 8, filtered.length)}{" "}
                de {filtered.length} tarefas
              </span>
              <div className="pagination">
                <button
                  aria-label="Página anterior"
                  disabled={current === 1}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("page", String(current - 1));
                    setParams(next);
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <span>
                  {current} / {pageCount}
                </span>
                <button
                  aria-label="Próxima página"
                  disabled={current === pageCount}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("page", String(current + 1));
                    setParams(next);
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <span>
                <Clock3 size={14} />
                {updating ? "Atualizando…" : "Atualizado agora"}
              </span>
            </footer>
          </>
        ) : (
          <EmptyState
            title="Nenhuma tarefa nesta seleção"
            text="Escolha outra competência ou ajuste os filtros."
            action={
              <button
                className="button button-white"
                onClick={() => {
                  setCompetence("2026-09");
                  setParams({});
                }}
              >
                Ver setembro
              </button>
            }
          />
        )}
      </section>
      <NewTaskModal
        open={create && hasPermission(actor, "tasks.create")}
        onOpenChange={setCreate}
      />
      <TaskDrawer
        key={selected ?? "closed"}
        taskId={selected}
        onClose={() => openTask()}
      />
    </>
  );
}
