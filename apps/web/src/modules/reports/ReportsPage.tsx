import { downloadText } from "../../shared/downloads";
import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Printer,
  Check,
  ChartNoAxesCombined,
  ListTodo,
  Grid2X2,
  Users,
  History,
  ShieldCheck,
} from "lucide-react";
import {
  competenceLabel,
  csvCell,
  dateLabel,
  deadline,
  hasPermission,
  metric,
  obligationGroups,
  obligationCell,
  statusLabels,
} from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  CompetenceSelect,
  EmptyState,
  PageHeading,
} from "../../shared/ui/components";
const reports = [
  {
    id: "deliveries",
    title: "Entregas por competência",
    caption: "Conclusões por empresa e obrigação",
    icon: ChartNoAxesCombined,
  },
  {
    id: "pending",
    title: "Pendências e atrasos",
    caption: "Entregas abertas e seus prazos",
    icon: ListTodo,
  },
  {
    id: "matrix",
    title: "Matriz de obrigações",
    caption: "Empresa × obrigação",
    icon: Grid2X2,
  },
  {
    id: "productivity",
    title: "Entregas por colaborador",
    caption: "Volume, meta e conferência",
    icon: Users,
  },
  {
    id: "changes",
    title: "Dispensas e reaberturas",
    caption: "Motivos e responsáveis",
    icon: History,
  },
];
function ReportTaskLink({
  enabled,
  to,
  ...props
}: {
  enabled: boolean;
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
  "aria-label"?: string;
}) {
  return enabled ? <Link to={to} {...props} /> : <span {...props} />;
}
export default function ReportsPage() {
  const { data, actor, department, competence, notify } = usePortal();
  const canOpenTask = hasPermission(actor, "tasks.view");
  const [selected, setSelected] = useState("pending");
  const report = reports.find((r) => r.id === selected)!;
  const tasks = data.tasks.filter(
    (t) => t.department === department && t.competence === competence,
  );
  const today = data.now.slice(0, 10);
  const events = data.audit.filter(
    (e) =>
      e.taskId &&
      tasks.some((t) => t.id === e.taskId) &&
      /dispensa|reabert|correção/i.test(e.action),
  );
  const group =
    selected === "deliveries"
      ? tasks.filter((t) => t.status === "done")
      : tasks.filter((t) => !["done", "dispensed"].includes(t.status));
  const obligations = obligationGroups(tasks);
  const companies = data.companies.filter((c) =>
    tasks.some((t) => t.companyId === c.id),
  );
  const owners = data.users.filter((u) =>
    tasks.some((t) => t.assigneeId === u.userId),
  );
  function exportReport() {
    let rows: unknown[][];
    if (selected === "productivity")
      rows = [
        ["Colaborador", "Geradas", "Concluídas", "Em conferência", "% na meta"],
        ...owners.map((u) => {
          const m = metric(
            tasks.filter((t) => t.assigneeId === u.userId),
            today,
          );
          return [u.name, m.total, m.done, m.review, `${m.onTimePercent}%`];
        }),
      ];
    else if (selected === "changes")
      rows = [
        ["Ação", "Motivo", "Responsável", "Data"],
        ...events.map((e) => [e.action, e.detail, e.actorName, e.at]),
      ];
    else if (selected === "matrix")
      rows = [
        ["Empresa", ...obligations.map((g) => g.title)],
        ...companies.map((c) => [
          c.name,
          ...obligations.map((group) => {
            const matching = obligationCell(tasks, c.id, group);
            return matching.length
              ? matching.map((t) => statusLabels[t.status]).join(" | ")
              : "Não se aplica";
          }),
        ]),
      ];
    else
      rows = [
        [
          "Empresa",
          "Obrigação",
          "Meta interna",
          "Prazo legal",
          "Status",
          "Situação",
        ],
        ...group.map((t) => [
          data.companies.find((c) => c.id === t.companyId)?.name,
          t.title,
          t.internalDue,
          t.legalDue,
          statusLabels[t.status],
          deadline(t, today).label,
        ]),
      ];
    downloadText(
      `apice-${selected}-${competence}.csv`,
      rows.map((row) => row.map(csvCell).join(";")).join("\r\n"),
    );
    notify("Relatório exportado com o escopo e a competência atuais.");
  }
  return (
    <>
      <PageHeading
        title="Relatórios"
        description="Dados da operação para acompanhar entregas e tomar decisões."
      >
        <CompetenceSelect />
        <button className="button button-white" onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir / PDF
        </button>
        <button className="button button-primary" onClick={exportReport}>
          <Download size={16} />
          Exportar CSV
        </button>
      </PageHeading>
      <div className="report-layout">
        <aside className="report-menu" aria-label="Relatórios disponíveis">
          <span className="eyebrow">RELATÓRIOS ESSENCIAIS</span>
          {reports.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item.id)}
              className={selected === item.id ? "active" : ""}
            >
              <item.icon size={19} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.caption}</small>
              </span>
            </button>
          ))}
          <div className="report-scope">
            <ShieldCheck size={17} />
            <p>Os resultados respeitam seu perfil e escopo de acesso.</p>
          </div>
        </aside>
        <section className="surface report-surface">
          <div className="surface-heading">
            <div>
              <span className="eyebrow">
                {department.toUpperCase()} · {competenceLabel(competence)}
              </span>
              <h2>{report.title}</h2>
            </div>
            <report.icon size={22} />
          </div>
          {(selected === "deliveries" || selected === "pending") &&
            (group.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>EMPRESA / OBRIGAÇÃO</th>
                      <th>META</th>
                      <th>PRAZO LEGAL</th>
                      <th>SITUAÇÃO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <ReportTaskLink
                            enabled={canOpenTask}
                            className="report-task-link"
                            to={`/tarefas?task=${t.id}`}
                          >
                            <strong>
                              {
                                data.companies.find((c) => c.id === t.companyId)
                                  ?.name
                              }
                            </strong>
                            <small>
                              {t.title} · {statusLabels[t.status]}
                            </small>
                          </ReportTaskLink>
                        </td>
                        <td>{dateLabel(t.internalDue)}</td>
                        <td>{dateLabel(t.legalDue)}</td>
                        <td>
                          <span
                            className={`badge tone-${deadline(t, today).tone}`}
                          >
                            {deadline(t, today).label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Nenhuma entrega nesta seleção"
                text="Escolha outro relatório ou competência."
              />
            ))}
          {selected === "matrix" &&
            (tasks.length ? (
              <div className="table-wrap">
                <table className="data-table matrix-table">
                  <thead>
                    <tr>
                      <th>EMPRESA</th>
                      {obligations.map((group) => (
                        <th key={group.key}>{group.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        {obligations.map((group) => {
                          const matching = obligationCell(tasks, c.id, group);
                          const task = matching[0];
                          return (
                            <td key={group.key}>
                              {task ? (
                                <ReportTaskLink
                                  enabled={canOpenTask}
                                  to={
                                    matching.length === 1
                                      ? `/tarefas?task=${task.id}`
                                      : `/tarefas?company=${encodeURIComponent(c.id)}&model=${encodeURIComponent(group.model)}&obligation=${encodeURIComponent(group.title)}`
                                  }
                                  className={`matrix-status status-${task.status}`}
                                  title={matching
                                    .map((t) => statusLabels[t.status])
                                    .join(" | ")}
                                  aria-label={`${group.title} de ${c.name}: ${matching.length} tarefas`}
                                >
                                  {matching.length > 1 ? (
                                    `${matching.length} tarefas`
                                  ) : task.status === "done" ? (
                                    <Check size={16} />
                                  ) : (
                                    statusLabels[task.status]
                                  )}
                                </ReportTaskLink>
                              ) : (
                                <span className="muted-note">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState />
            ))}
          {selected === "productivity" && (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>COLABORADOR</th>
                      <th>TAREFAS</th>
                      <th>CONCLUÍDAS</th>
                      <th>CONFERÊNCIA</th>
                      <th>NA META</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.map((user) => {
                      const m = metric(
                        tasks.filter((t) => t.assigneeId === user.userId),
                        today,
                      );
                      return (
                        <tr key={user.userId}>
                          <td>
                            <ReportTaskLink
                              enabled={canOpenTask}
                              to={`/tarefas?owner=${user.userId}`}
                              className="owner-cell"
                            >
                              <span className="avatar avatar-small">
                                {user.initials}
                              </span>
                              {user.name}
                            </ReportTaskLink>
                          </td>
                          <td>
                            <ReportTaskLink
                              enabled={canOpenTask}
                              to={`/tarefas?owner=${user.userId}`}
                            >
                              {m.total}
                            </ReportTaskLink>
                          </td>
                          <td>
                            <ReportTaskLink
                              enabled={canOpenTask}
                              to={`/tarefas?owner=${user.userId}&status=done`}
                            >
                              {m.done}
                            </ReportTaskLink>
                          </td>
                          <td>
                            <ReportTaskLink
                              enabled={canOpenTask}
                              to={`/tarefas?owner=${user.userId}&status=in_review`}
                            >
                              {m.review}
                            </ReportTaskLink>
                          </td>
                          <td>
                            <ReportTaskLink
                              enabled={canOpenTask}
                              to={`/tarefas?owner=${user.userId}&status=done&urgency=on-time`}
                              className="badge status-done"
                            >
                              {m.onTimePercent}%
                            </ReportTaskLink>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="report-note">
                Na meta = tarefas concluídas até a meta interna ÷ tarefas
                concluídas. Sem conclusões, o percentual exibido é 0%. Tempo de
                trabalho ativo ainda não é medido.
              </p>
            </>
          )}
          {selected === "changes" &&
            (events.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>EVENTO</th>
                      <th>JUSTIFICATIVA</th>
                      <th>RESPONSÁVEL</th>
                      <th>DATA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.action}</td>
                        <td>{e.detail}</td>
                        <td>{e.actorName}</td>
                        <td>{dateLabel(e.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Nenhuma dispensa ou reabertura"
                text="As movimentações aprovadas aparecerão neste relatório."
              />
            ))}
          <footer className="table-footer">
            <span>Competência {competenceLabel(competence)}</span>
            <span>Fonte: tarefas e histórico da operação</span>
          </footer>
        </section>
      </div>
    </>
  );
}
