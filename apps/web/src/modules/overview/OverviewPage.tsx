import { Link } from "react-router-dom";
import {
  ListTodo,
  CircleCheck,
  Clock3,
  TriangleAlert,
  ShieldCheck,
  Activity,
  CalendarDays,
} from "lucide-react";
import { dateLabel, deadline, metric } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  CompetenceSelect,
  EmptyState,
  PageHeading,
} from "../../shared/ui/components";
export default function OverviewPage() {
  const { data, actor, department, competence } = usePortal();
  const tasks = data.tasks.filter(
    (t) => t.department === department && t.competence === competence,
  );
  const today = data.now.slice(0, 10);
  const m = metric(tasks, today);
  const upcoming = tasks
    .filter((t) => !["done", "dispensed"].includes(t.status))
    .sort((a, b) => a.legalDue.localeCompare(b.legalDue))
    .slice(0, 5);
  const metrics = [
    {
      label: "Tarefas em aberto",
      value: m.open,
      icon: ListTodo,
      tone: "teal",
      url: "/tarefas?status=open",
      caption: "Entregas a executar",
    },
    {
      label: "Concluídas",
      value: m.done,
      icon: CircleCheck,
      tone: "green",
      url: "/tarefas?status=done",
      caption: `${m.onTimePercent}% entregues na meta`,
      captionUrl: "/tarefas?status=done&urgency=on-time",
    },
    {
      label: "Em conferência",
      value: m.review,
      icon: ShieldCheck,
      tone: "purple",
      url: "/tarefas?status=in_review",
      caption: "Aguardando aprovação",
    },
    {
      label: "Prazo legal vencido",
      value: m.legalLate,
      icon: TriangleAlert,
      tone: "red",
      url: "/tarefas?urgency=legal",
      caption: `${m.internalLate} com meta vencida`,
      captionUrl: "/tarefas?status=open&urgency=internal",
    },
  ];
  return (
    <>
      <PageHeading
        title="Visão geral"
        description={`Olá, ${actor.name.split(" ")[0]}. Este é o panorama de ${department}.`}
      >
        <CompetenceSelect />
      </PageHeading>
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
            <p>
              {item.captionUrl ? (
                <Link to={item.captionUrl}>{item.caption}</Link>
              ) : (
                item.caption
              )}
            </p>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="surface progress-surface">
          <div className="surface-heading">
            <div>
              <span className="eyebrow">ACOMPANHAMENTO</span>
              <h2>Entregas por obrigação</h2>
            </div>
            <span className="badge status-todo">
              {competence.slice(5)}/{competence.slice(0, 4)}
            </span>
          </div>
          <div className="obligation-bars">
            {[...new Set(tasks.map((t) => t.title))].map((title) => {
              const group = tasks.filter((t) => t.title === title);
              const done = group.filter((t) => t.status === "done").length;
              return (
                <div key={title} className="obligation-row">
                  <div>
                    <strong>
                      <Link
                        to={`/tarefas?obligation=${encodeURIComponent(title)}`}
                      >
                        {title}
                      </Link>
                    </strong>
                    <span>
                      <Link
                        to={`/tarefas?obligation=${encodeURIComponent(title)}&status=done`}
                      >
                        {done}
                      </Link>{" "}
                      de{" "}
                      <Link
                        to={`/tarefas?obligation=${encodeURIComponent(title)}`}
                      >
                        {group.length}
                      </Link>{" "}
                      entregas
                    </span>
                  </div>
                  <Link
                    to={`/tarefas?obligation=${encodeURIComponent(title)}`}
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
                text="Selecione setembro para acompanhar os dados piloto."
              />
            )}
          </div>
          <div className="progress-total">
            <span>Progresso geral</span>
            <strong>
              <Link
                to="/tarefas?status=closed"
                aria-label="Ver tarefas concluídas ou dispensadas"
              >
                {m.progress}%
              </Link>
            </strong>
            <small>
              <Link to="/tarefas?status=dispensed">
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
            <CalendarDays size={20} />
          </div>
          <div className="upcoming-list">
            {upcoming.map((task) => (
              <Link
                to={`/tarefas?task=${task.id}`}
                className="upcoming-item"
                key={task.id}
              >
                <span
                  className={`calendar-tile ${deadline(task, today).legalLate ? "late" : ""}`}
                >
                  <strong>{task.legalDue.slice(8)}</strong>
                  <small>
                    {new Intl.DateTimeFormat("pt-BR", {
                      month: "short",
                      timeZone: "UTC",
                    })
                      .format(new Date(task.legalDue + "T00:00:00Z"))
                      .replace(".", "")
                      .toUpperCase()}
                  </small>
                </span>
                <div>
                  <strong>{task.title}</strong>
                  <p>
                    {data.companies.find((c) => c.id === task.companyId)?.name}
                  </p>
                  <span
                    className={`small-text ${deadline(task, today).legalLate ? "danger-text" : "warning-text"}`}
                  >
                    {deadline(task, today).label}
                  </span>
                </div>
              </Link>
            ))}
            {!upcoming.length && (
              <EmptyState
                title="Todas as entregas acompanhadas"
                text="Não há prazos abertos nesta seleção."
              />
            )}
          </div>
        </section>
      </div>
      <section className="surface activity-surface">
        <div className="surface-heading">
          <div>
            <span className="eyebrow">OPERAÇÃO EM MOVIMENTO</span>
            <h2>Últimas atualizações</h2>
          </div>
          <Activity size={19} />
        </div>
        <div className="activity-list">
          {data.audit
            .filter((e) => !e.department || e.department === department)
            .slice(0, 5)
            .map((event) => (
              <Link
                to={
                  event.taskId
                    ? `/tarefas?task=${event.taskId}`
                    : "/configuracoes"
                }
                className="activity-row"
                key={event.id}
              >
                <span className="avatar avatar-small">
                  {data.users.find((u) => u.userId === event.actorId)
                    ?.initials ?? "SI"}
                </span>
                <div>
                  <strong>{event.action}</strong>
                  <p>{event.detail}</p>
                </div>
                <span>
                  {event.actorName}
                  <small>
                    <Clock3 size={12} />
                    {dateLabel(event.at)} · {event.at.slice(11, 16)}
                  </small>
                </span>
              </Link>
            ))}
        </div>
      </section>
      <div className="page-footnote">
        <ShieldCheck size={14} />
        <span>
          Todos os indicadores abrem as tarefas que compõem o resultado.
        </span>
      </div>
    </>
  );
}
