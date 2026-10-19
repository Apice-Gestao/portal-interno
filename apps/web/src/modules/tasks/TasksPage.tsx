import { downloadText } from "../../shared/downloads";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  OverdueIcon,
  ClockIcon,
  TaskChecklistIcon,
  AddIcon,
  SearchIcon,
  FilterIcon,
  DownloadIcon,
  CloseIcon,
  BoardIcon,
  ListViewIcon,
  CalendarIcon,
} from "../../shared/icons";
import {
  csvCell,
  businessDate,
  closedCompetence,
  competenceLabel,
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
import "./task-views.css";
import { BulkImport, BulkTaskTransfer } from "../../shared/ui/BulkOperations";
// Clicking anywhere on the row opens it; controls inside keep their own action.
const fromControl = (event: { target: EventTarget }) =>
  !!(event.target as HTMLElement).closest?.("button, a, input, label, select");
export default function TasksPage() {
  const {
    data,
    actor,
    department,
    competence,
    setCompetence,
    setDepartment,
    notify,
    updating,
  } = usePortal();
  const [params, setParams] = useSearchParams();
  const [create, setCreate] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [presentation, setPresentation] = useState<"list" | "board">("list");
  const routeDepartment = params.get("department");
  const routeCompetence = params.get("competence");
  const dueDate = params.get("dueDate") ?? "";
  const dueMode = params.get("dueMode") ?? "both";
  const calendarMonth = params.get("calendarMonth") ?? "";
  useEffect(() => {
    const next = new URLSearchParams(params);
    let changed = false;
    if (routeCompetence && /^\d{4}-(0[1-9]|1[0-2])$/.test(routeCompetence)) {
      setCompetence(routeCompetence);
      next.delete("competence");
      changed = true;
    }
    if (
      routeDepartment &&
      routeDepartment !== "all" &&
      actor.departments.includes(routeDepartment)
    ) {
      setDepartment(routeDepartment);
      next.delete("department");
      changed = true;
    }
    if (changed) setParams(next, { replace: true });
  }, [
    routeCompetence,
    routeDepartment,
    params,
    setCompetence,
    setDepartment,
    setParams,
    actor.departments,
  ]);
  const selectedDepartment =
    routeDepartment === "all"
      ? "all"
      : routeDepartment && actor.departments.includes(routeDepartment)
        ? routeDepartment
        : department;
  const selectedCompetence =
    routeCompetence && /^\d{4}-(0[1-9]|1[0-2])$/.test(routeCompetence)
      ? routeCompetence
      : competence;
  const calendarFilter =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(calendarMonth) ||
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  const tasks = data.tasks.filter(
    (t) =>
      (selectedDepartment === "all" || t.department === selectedDepartment) &&
      (calendarFilter
        ? (dueMode !== "legal" &&
            (dueDate
              ? t.internalDue === dueDate
              : t.internalDue.startsWith(calendarMonth))) ||
          (dueMode !== "meta" &&
            (dueDate
              ? t.legalDue === dueDate
              : t.legalDue.startsWith(calendarMonth)))
        : t.competence === selectedCompetence),
  );
  const today = businessDate(data.now);
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
      if (["done", "dispensed", "closed", "cancelled"].includes(status))
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
        (!params.get("regime") ||
          data.companies.find((company) => company.id === t.companyId)
            ?.regime === params.get("regime")) &&
        (!params.get("group") ||
          data.companies
            .find((company) => company.id === t.companyId)
            ?.tags?.includes(params.get("group")!)) &&
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
          t.cancelled ? "Cancelada" : statusLabels[t.status],
        ]),
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n"),
    );
    notify("Exportação preparada com os filtros atuais.");
  }
  const tabs: { value: TaskStatus | "all"; label: string; count: number }[] = [
    { value: "all", label: "Todas as tarefas", count: m.total },
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
        {!calendarFilter && <CompetenceSelect />}
        {hasPermission(actor, "tasks.create") && <BulkImport kind="tasks" />}
        {hasPermission(actor, "tasks.assign") && <BulkTaskTransfer />}
        {hasPermission(actor, "tasks.create") && (
          <button
            className="button button-primary"
            onClick={() => setCreate(true)}
          >
            <AddIcon size={17} />
            Nova tarefa
          </button>
        )}
      </PageHeading>
      {(calendarFilter || selectedDepartment === "all") && (
        <div className="task-filter-context">
          <CalendarIcon size={16} />
          <span>
            {calendarFilter
              ? `Vencimentos ${dueDate ? `de ${dateLabel(dueDate)}` : `do mês ${calendarMonth}`} · ${dueMode === "meta" ? "Meta interna" : dueMode === "legal" ? "Prazo legal" : "Meta e prazo legal"}`
              : "Competência selecionada"}
            {selectedDepartment === "all"
              ? " · Todos os departamentos autorizados"
              : ""}
          </span>
          <button
            className="text-button"
            onClick={() => {
              const next = new URLSearchParams(params);
              ["dueDate", "dueMode", "calendarMonth", "department"].forEach(
                (key) => next.delete(key),
              );
              setParams(next);
            }}
          >
            Voltar ao departamento <CloseIcon size={13} />
          </button>
        </div>
      )}
      <div className="task-summary">
        <div className="summary-intro">
          <span className="summary-icon">
            <TaskChecklistIcon size={22} />
          </span>
          <div>
            <strong>{m.total} tarefas</strong>
            <p>
              {
                data.companies.filter((c) =>
                  tasks.some((t) => !t.cancelled && t.companyId === c.id),
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
          <OverdueIcon size={18} />
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
      <div
        className="task-presentation"
        role="group"
        aria-label="Apresentação das tarefas"
      >
        <button
          aria-pressed={presentation === "list"}
          onClick={() => setPresentation("list")}
          className={presentation === "list" ? "active" : ""}
        >
          <ListViewIcon size={16} />
          Lista
        </button>
        <button
          aria-pressed={presentation === "board"}
          onClick={() => setPresentation("board")}
          className={presentation === "board" ? "active" : ""}
        >
          <BoardIcon size={16} />
          Quadro
        </button>
        <span>Clique na tarefa para executar ou acompanhar.</span>
      </div>
      <section className="surface tasks-surface" aria-label="Lista de tarefas">
        <div className="table-toolbar">
          <label className="search-field">
            <SearchIcon size={17} />
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
              <FilterIcon size={16} />
              Filtros
            </button>
            <SelectField
              aria-label="Regime das empresas"
              value={params.get("regime") ?? ""}
              onValueChange={(value) => filter("regime", value)}
            >
              <option value="">Todos os regimes</option>
              {[
                ...new Set(data.companies.map((company) => company.regime)),
              ].map((regime) => (
                <option key={regime}>{regime}</option>
              ))}
            </SelectField>
            <SelectField
              aria-label="Agrupador de clientes das tarefas"
              value={params.get("group") ?? ""}
              onValueChange={(value) => filter("group", value)}
            >
              <option value="">Todos os agrupadores</option>
              {[
                ...new Set(
                  data.companies.flatMap((company) => company.tags ?? []),
                ),
              ].map((tag) => (
                <option key={tag}>{tag}</option>
              ))}
            </SelectField>
            {hasPermission(actor, "tasks.export") && (
              <button
                className="icon-button"
                aria-label="Exportar tarefas em CSV"
                onClick={exportTasks}
              >
                <DownloadIcon size={17} />
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
                <option value="cancelled">Canceladas</option>
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
              <CloseIcon size={14} />
              Limpar filtros
            </button>
          </div>
        )}
        {filtered.length ? (
          <>
            {presentation === "board" ? (
              <div className="task-board">
                {[
                  { id: "todo", label: "A fazer", statuses: ["todo"] },
                  {
                    id: "progress",
                    label: "Em andamento",
                    statuses: ["in_progress", "waiting", "returned"],
                  },
                  {
                    id: "review",
                    label: "Em conferência",
                    statuses: ["in_review"],
                  },
                  {
                    id: "closed",
                    label: "Encerradas",
                    statuses: ["done", "dispensed"],
                  },
                ].map((column) => (
                  <section
                    className={`task-board-column task-board-${column.id}`}
                    key={column.id}
                  >
                    <h2>
                      {column.label}
                      <span>
                        {
                          filtered.filter((task) =>
                            column.statuses.includes(task.status),
                          ).length
                        }
                      </span>
                    </h2>
                    {visible
                      .filter((task) => column.statuses.includes(task.status))
                      .map((task) => {
                        const company = data.companies.find(
                          (item) => item.id === task.companyId,
                        );
                        const owner = data.users.find(
                          (item) => item.userId === task.assigneeId,
                        );
                        return (
                          <button
                            key={task.id}
                            className="task-board-card"
                            onClick={() => openTask(task.id)}
                          >
                            <small>
                              {company?.code} · {company?.name}
                            </small>
                            <strong>{task.title}</strong>
                            <TaskDeadlineBadge task={task} today={today} />
                            <span className="task-board-dates">
                              Meta {dateLabel(task.internalDue)} · Legal{" "}
                              {dateLabel(task.legalDue)}
                            </span>
                            <span className="task-board-owner">
                              <span className="avatar avatar-tiny">
                                {owner?.initials ?? "EQ"}
                              </span>
                              {owner?.name ?? "Fila do departamento"}
                            </span>
                          </button>
                        );
                      })}
                    {!visible.some((task) =>
                      column.statuses.includes(task.status),
                    ) && (
                      <p className="task-board-empty">
                        Nenhuma tarefa nesta página
                      </p>
                    )}
                  </section>
                ))}
              </div>
            ) : (
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
                        <tr
                          key={t.id}
                          className="task-row row-clickable"
                          onClick={(event) => {
                            if (!fromControl(event)) openTask(t.id);
                          }}
                        >
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
                              {t.dispenseRequested &&
                                !["done", "dispensed"].includes(t.status) && (
                                <span className="date-hint">
                                  Dispensa solicitada
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="owner-cell">
                              <span className="avatar avatar-tiny">
                                {user?.initials ?? "EQ"}
                              </span>
                              {user
                                ? `${user.name.split(" ")[0]} ${user.name.split(" ").at(-1)}`
                                : "Fila do departamento"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                  <ChevronLeftIcon size={15} />
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
                  <ChevronRightIcon size={15} />
                </button>
              </div>
              <span>
                <ClockIcon size={14} />
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
                  setCompetence(closedCompetence(data.now));
                  setParams({});
                }}
              >
                Ver competência {competenceLabel(closedCompetence(data.now))}
              </button>
            }
          />
        )}
      </section>
      <NewTaskModal
        // Fresh form (and competence) each time it opens.
        key={create ? `open:${competence}` : "closed"}
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
