import { useState } from "react";
import { Link } from "react-router-dom";
import {
  TaskChecklistIcon,
  CompletedIcon,
  ClockIcon,
  DeadlineWarningIcon,
  ReviewIcon,
  OperationActivityIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListViewIcon,
  ForwardIcon,
  AnalyticsIcon,
} from "../../shared/icons";
import {
  dateLabel,
  businessTime,
  deadline,
  metric,
  hasPermission,
  competenceLabel,
  businessDate,
} from "@apice/domain";
import type { Task } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  CompetenceSelect,
  EmptyState,
  PageHeading,
} from "../../shared/ui/components";
import { SelectField } from "../../shared/ui/SelectField";
import { calendarTasksUrl } from "./overview-navigation";
import type { DeadlineMode } from "./overview-navigation";
import "./overview.css";

function Calendar({
  tasks,
  scope,
  ownerId,
}: {
  tasks: Task[];
  scope: string;
  ownerId?: string;
}) {
  const { data, competence } = usePortal();
  const initialDate =
    tasks
      .map((task) => task.legalDue)
      .sort()[0]
      ?.slice(0, 7) ?? competence;
  const [month, setMonth] = useState(initialDate);
  const [mode, setMode] = useState<DeadlineMode>("both");
  const [selectedDay, setSelectedDay] = useState("");
  const [year = 2026, monthNumber = 10] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = (start.getUTCDay() + 6) % 7;
  const entries = tasks
    .flatMap((task) => [
      ...(mode !== "legal"
        ? [{ task, day: task.internalDue, type: "meta" as const }]
        : []),
      ...(mode !== "meta"
        ? [{ task, day: task.legalDue, type: "legal" as const }]
        : []),
    ])
    .filter((entry) => entry.day.startsWith(month));
  function moveMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
    setSelectedDay("");
  }
  const selection = entries.filter((entry) => entry.day === selectedDay);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
  return (
    <section className="surface dashboard-calendar">
      <div className="surface-heading">
        <div>
          <span className="eyebrow">AGENDA DE ENTREGAS</span>
          <h2>Calendário de prazos</h2>
        </div>
        <SelectField
          aria-label="Prazos no calendário"
          value={mode}
          onValueChange={(value) => setMode(value as DeadlineMode)}
          options={[
            { value: "both", label: "Meta e prazo legal" },
            { value: "meta", label: "Meta interna" },
            { value: "legal", label: "Prazo legal" },
          ]}
        />
      </div>
      <div className="calendar-controls">
        <button
          className="icon-button"
          aria-label="Mês anterior"
          onClick={() => moveMonth(-1)}
        >
          <ChevronLeftIcon size={18} />
        </button>
        <strong>{monthLabel}</strong>
        <button
          className="icon-button"
          aria-label="Próximo mês"
          onClick={() => moveMonth(1)}
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>
      <div className="calendar-legend">
        <span>
          <i className="calendar-meta-dot" />
          Meta interna
        </span>
        <span>
          <i className="calendar-legal-dot" />
          Prazo legal
        </span>
        <small>Vencimentos de todas as competências no seu acesso.</small>
      </div>
      <div className="calendar-grid" role="group" aria-label={monthLabel}>
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
          <span className="calendar-weekday" key={day}>
            {day}
          </span>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} className="calendar-day-empty" />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, "0")}`;
          const scheduled = entries.filter((entry) => entry.day === day);
          const unique = new Set(scheduled.map((entry) => entry.task.id)).size;
          return (
            <button
              key={day}
              className={`calendar-day ${selectedDay === day ? "selected" : ""} ${day === businessDate(data.now) ? "today" : ""}`}
              onClick={() => setSelectedDay(day)}
              aria-label={`${dateLabel(day)}: ${unique} tarefas`}
              aria-pressed={selectedDay === day}
            >
              <strong>{index + 1}</strong>
              <span className="calendar-day-markers">
                {scheduled.some((entry) => entry.type === "meta") && (
                  <i className="calendar-meta-dot" />
                )}
                {scheduled.some((entry) => entry.type === "legal") && (
                  <i className="calendar-legal-dot" />
                )}
              </span>
              {unique > 0 && (
                <small>
                  {unique}
                  <span> tarefas</span>
                </small>
              )}
            </button>
          );
        })}
      </div>
      {selectedDay ? (
        <div className="calendar-day-detail">
          <div>
            <strong>{dateLabel(selectedDay)}</strong>
            <Link
              className="text-button"
              to={calendarTasksUrl({
                department: scope,
                day: selectedDay,
                mode,
                month,
                ownerId,
              })}
            >
              Abrir tarefas do dia <ForwardIcon size={14} />
            </Link>
          </div>
          {selection.length ? (
            selection.map((entry) => (
              <Link
                key={`${entry.task.id}-${entry.type}`}
                to={`/tarefas?task=${entry.task.id}&department=${encodeURIComponent(entry.task.department)}&competence=${entry.task.competence}`}
                className="calendar-task-entry"
              >
                <span className={`calendar-${entry.type}-dot`} />
                <span>
                  <strong>{entry.task.title}</strong>
                  <small>
                    {
                      data.companies.find(
                        (company) => company.id === entry.task.companyId,
                      )?.name
                    }{" "}
                    ·{" "}
                    {data.users.find(
                      (user) => user.userId === entry.task.assigneeId,
                    )?.name ?? "Fila do departamento"}
                  </small>
                </span>
                <small>{entry.type === "meta" ? "Meta" : "Legal"}</small>
              </Link>
            ))
          ) : (
            <p>Nenhum prazo neste dia.</p>
          )}
        </div>
      ) : (
        <p className="calendar-help">
          Selecione um dia para ver as tarefas e os responsáveis.
        </p>
      )}
    </section>
  );
}

export default function OverviewPage() {
  const { data, actor, department, competence } = usePortal();
  const canTeam = hasPermission(actor, "tasks.team.view");
  const [scope, setScope] = useState(
    actor.homeView === "executive" || actor.homeView === "management"
      ? "all"
      : "department",
  );
  const [view, setView] = useState<"summary" | "calendar">("summary");
  const visibleTasks = data.tasks.filter(
    (task) =>
      !task.cancelled &&
      (scope === "all" || task.department === department) &&
      (scope !== "personal" || task.assigneeId === actor.userId),
  );
  const tasks = visibleTasks.filter((task) => task.competence === competence);
  const today = businessDate(data.now);
  const m = metric(tasks, today);
  const departmentName =
    data.workspace.departments.find((item) => item.id === department)?.name ??
    department;
  const scopeQuery = scope === "all" ? "all" : department;
  const taskUrl = (query: string) =>
    `/tarefas?department=${encodeURIComponent(scopeQuery)}&competence=${competence}${scope === "personal" ? `&owner=${actor.userId}` : ""}&${query}`;
  const upcoming = tasks
    .filter((task) => !["done", "dispensed"].includes(task.status))
    .sort((a, b) => a.legalDue.localeCompare(b.legalDue))
    .slice(0, 3);
  const metrics = [
    {
      label: "Tarefas em aberto",
      value: m.open,
      icon: TaskChecklistIcon,
      tone: "teal",
      url: taskUrl("status=open"),
      caption: "Execução e conferência",
    },
    {
      label: "Concluídas",
      value: m.done,
      icon: CompletedIcon,
      tone: "green",
      url: taskUrl("status=done"),
      caption: `${m.onTimePercent}% entregues na meta`,
    },
    {
      label: "Em conferência",
      value: m.review,
      icon: ReviewIcon,
      tone: "teal",
      url: taskUrl("status=in_review"),
      caption: "Aguardando aprovação",
    },
    {
      label: "Prazo legal vencido",
      value: m.legalLate,
      icon: DeadlineWarningIcon,
      tone: "red",
      url: taskUrl("urgency=legal"),
      caption: `${m.internalLate} com meta vencida`,
    },
  ];
  const departments = data.workspace.departments.filter((item) =>
    actor.departments.includes(item.id),
  );
  const owners = data.users.filter((user) =>
    tasks.some((task) => task.assigneeId === user.userId),
  );
  return (
    <>
      <PageHeading
        title={
          actor.homeView === "executive"
            ? "Panorama executivo"
            : scope === "personal" || !canTeam
              ? "Meu panorama"
              : "Visão geral"
        }
        description={`Olá, ${actor.name.split(" ")[0]}. ${scope === "all" ? "Visão consolidada dos departamentos autorizados." : `Acompanhe as entregas de ${departmentName}.`}`}
      >
        <CompetenceSelect />
        {canTeam && (
          <SelectField
            aria-label="Escopo do panorama"
            value={scope}
            onValueChange={setScope}
            options={[
              { value: "personal", label: "Minhas tarefas" },
              { value: "department", label: "Equipe do departamento" },
              { value: "all", label: "Todos os meus departamentos" },
            ]}
          />
        )}
      </PageHeading>
      <div
        className="dashboard-view-switch"
        role="group"
        aria-label="Apresentação do panorama"
      >
        <button
          className={view === "summary" ? "active" : ""}
          onClick={() => setView("summary")}
          aria-pressed={view === "summary"}
        >
          <AnalyticsIcon size={16} />
          Resumo
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
          aria-pressed={view === "calendar"}
        >
          <CalendarIcon size={16} />
          Calendário
        </button>
        {hasPermission(actor, "reports.view") && (
          <Link className="text-button dashboard-reports-link" to="/relatorios">
            Relatórios e análises <ForwardIcon size={15} />
          </Link>
        )}
      </div>
      <div className="metric-grid">
        {metrics.map((item) => (
          <article
            key={item.label}
            className={`metric-card metric-${item.tone}`}
          >
            <Link to={item.url} className="metric-main">
              <div>
                <span>{item.label}</span>
                <item.icon size={18} />
              </div>
              <strong>{item.value.toString().padStart(2, "0")}</strong>
            </Link>
            <p>{item.caption}</p>
          </article>
        ))}
      </div>
      {view === "calendar" ? (
        <Calendar
          key={`${scope}-${department}-${competence}`}
          tasks={visibleTasks}
          scope={scopeQuery}
          ownerId={scope === "personal" ? actor.userId : undefined}
        />
      ) : (
        <>
          {scope === "all" && departments.length > 1 && (
            <section
              className="dashboard-departments"
              aria-label="Resumo por departamento"
            >
              {departments.map((item) => {
                const stats = metric(
                  tasks.filter((task) => task.department === item.id),
                  today,
                );
                return (
                  <Link
                    className="surface dashboard-department-card"
                    to={`/tarefas?department=${encodeURIComponent(item.id)}&competence=${competence}`}
                    key={item.id}
                  >
                    <strong>{item.name}</strong>
                    <span>
                      {stats.total} tarefas · {stats.open} abertas
                    </span>
                    <div className="progress-track">
                      <span style={{ width: `${stats.progress}%` }} />
                    </div>
                    <small>
                      {stats.progress}% encerradas <ForwardIcon size={14} />
                    </small>
                  </Link>
                );
              })}
            </section>
          )}
          <div className="overview-grid">
            <section className="surface progress-surface">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">ACOMPANHAMENTO</span>
                  <h2>Entregas por obrigação</h2>
                </div>
                <span className="badge status-todo">
                  {competenceLabel(competence)}
                </span>
              </div>
              <div className="obligation-bars">
                {[...new Set(tasks.map((task) => task.title))].map((title) => {
                  const group = tasks.filter((task) => task.title === title);
                  const done = group.filter(
                    (task) => task.status === "done",
                  ).length;
                  return (
                    <div key={title} className="obligation-row">
                      <div>
                        <strong>
                          <Link
                            to={taskUrl(
                              `obligation=${encodeURIComponent(title)}`,
                            )}
                          >
                            {title}
                          </Link>
                        </strong>
                        <span>
                          <Link
                            to={taskUrl(
                              `obligation=${encodeURIComponent(title)}&status=done`,
                            )}
                          >
                            {done}
                          </Link>{" "}
                          de{" "}
                          <Link
                            to={taskUrl(
                              `obligation=${encodeURIComponent(title)}`,
                            )}
                          >
                            {group.length}
                          </Link>{" "}
                          entregas
                        </span>
                      </div>
                      <Link
                        to={taskUrl(`obligation=${encodeURIComponent(title)}`)}
                        aria-label={`Ver todas as tarefas de ${title}`}
                        className="progress-track"
                      >
                        <span
                          style={{ width: `${(done / group.length) * 100}%` }}
                        />
                      </Link>
                    </div>
                  );
                })}
                {!tasks.length && (
                  <EmptyState
                    title="Sem entregas nesta competência"
                    text="Selecione outra competência ou gere as rotinas aplicáveis."
                  />
                )}
              </div>
              <div className="progress-total">
                <span>Progresso geral</span>
                <strong>
                  <Link to={taskUrl("status=closed")}>{m.progress}%</Link>
                </strong>
                <small>
                  <Link to={taskUrl("status=dispensed")}>
                    {m.dispensed} dispensadas
                  </Link>
                  , contabilizadas separadamente
                </small>
              </div>
            </section>
            <section className="surface deadline-surface">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">PRIORIDADES</span>
                  <h2>Próximos prazos legais</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Ver calendário de prazos"
                  onClick={() => setView("calendar")}
                >
                  <CalendarIcon size={20} />
                </button>
              </div>
              <div className="upcoming-list">
                {upcoming.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tarefas?task=${task.id}&department=${encodeURIComponent(task.department)}&competence=${task.competence}`}
                    className="upcoming-item"
                  >
                    <time
                      dateTime={task.legalDue}
                      className={`upcoming-date ${deadline(task, today).legalLate ? "is-late" : ""}`}
                    >
                      {dateLabel(task.legalDue)}
                    </time>
                    <span className="upcoming-main">
                      <strong>{task.title}</strong>
                      <span>
                        {
                          data.companies.find(
                            (company) => company.id === task.companyId,
                          )?.name
                        }
                      </span>
                    </span>
                    <span
                      className={`upcoming-state ${deadline(task, today).legalLate ? "is-late" : "is-warning"}`}
                    >
                      {deadline(task, today).label}
                    </span>
                  </Link>
                ))}
                {!upcoming.length && (
                  <EmptyState
                    title="Entregas acompanhadas"
                    text="Não há prazos abertos nesta seleção."
                  />
                )}
              </div>
              <Link
                className="dashboard-priority-all text-button"
                to={taskUrl("status=open")}
              >
                <ListViewIcon size={15} />
                Ver todas as pendências
              </Link>
            </section>
          </div>
          {canTeam && hasPermission(actor, "reports.performance.view") && (
            <section className="surface dashboard-team">
              <div className="surface-heading">
                <div>
                  <span className="eyebrow">EQUIPE</span>
                  <h2>Andamento por colaborador</h2>
                </div>
                <Link
                  className="text-button"
                  to="/relatorios?tipo=productivity"
                >
                  Analisar entregas <ForwardIcon size={14} />
                </Link>
              </div>
              <div className="dashboard-team-grid">
                {owners.map((user) => {
                  const stats = metric(
                    tasks.filter((task) => task.assigneeId === user.userId),
                    today,
                  );
                  return (
                    <Link
                      key={user.userId}
                      className="dashboard-person"
                      to={taskUrl(`owner=${user.userId}`)}
                    >
                      <span className="avatar">{user.initials}</span>
                      <div>
                        <strong>{user.name}</strong>
                        <small>
                          {stats.done} concluídas · {stats.open} abertas
                        </small>
                        <div className="progress-track">
                          <span style={{ width: `${stats.progress}%` }} />
                        </div>
                      </div>
                      <strong>{stats.progress}%</strong>
                    </Link>
                  );
                })}
              </div>
              {!owners.length && (
                <EmptyState title="Sem tarefas atribuídas nesta seleção" />
              )}
            </section>
          )}
        </>
      )}
      <section className="surface activity-surface">
        <div className="surface-heading">
          <div>
            <span className="eyebrow">OPERAÇÃO EM MOVIMENTO</span>
            <h2>Últimas atualizações</h2>
          </div>
          <OperationActivityIcon size={19} />
        </div>
        <div className="activity-list">
          {data.audit
            .filter(
              (event) =>
                scope === "all" ||
                !event.department ||
                event.department === department,
            )
            .slice(0, 4)
            .map((event) => (
              <div className="activity-row" key={event.id}>
                <span className="avatar avatar-small">
                  {data.users.find((user) => user.userId === event.actorId)
                    ?.initials ?? "SI"}
                </span>
                <div>
                  <strong>
                    {event.taskId ? (
                      <Link to={`/tarefas?task=${event.taskId}`}>
                        {event.action}
                      </Link>
                    ) : (
                      event.action
                    )}
                  </strong>
                  <p>{event.detail}</p>
                </div>
                <span>
                  {event.actorName}
                  <small>
                    <ClockIcon size={12} />
                    {dateLabel(event.at)} · {businessTime(event.at)}
                  </small>
                </span>
              </div>
            ))}
        </div>
        {!data.audit.length && (
          <EmptyState title="Nenhuma movimentação nesta seleção" />
        )}
      </section>
      <div className="page-footnote">
        <ReviewIcon size={14} />
        <span>
          Indicadores usam as tarefas do seu acesso. Competência e mês do
          vencimento são filtros diferentes.
        </span>
      </div>
    </>
  );
}
