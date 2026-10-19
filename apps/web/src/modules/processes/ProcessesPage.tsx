import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  DepartmentFlowIcon,
  TaskBlueprintIcon,
  BoardIcon,
  ListViewIcon,
  ExportFileIcon,
  ForwardIcon,
} from "../../shared/icons";
import { csvCell, hasPermission, statusLabels } from "@apice/domain";
import type { Task } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { EmptyState, FormError, PageHeading } from "../../shared/ui/components";
import { DepartmentFlowsPage } from "../templates/DepartmentFlowsPage";
import { TaskTemplatesPage } from "../templates/TemplatesPage";
import { downloadText } from "../../shared/downloads";
import "./processes.css";
const columns = [
  { id: "todo", title: "A fazer" },
  { id: "in_progress", title: "Em execução" },
  { id: "in_review", title: "Em conferência" },
  { id: "closed", title: "Encerradas" },
];
export default function ProcessesPage() {
  const { data, actor, client, refresh, setDepartment, setCompetence, notify } =
    usePortal();
  const [params, setParams] = useSearchParams();
  // One area for task templates, department flows and follow-up (17/10/2026).
  const tabs = [
    {
      id: "acompanhamento",
      label: "Acompanhamento",
      icon: BoardIcon,
      allowed: hasPermission(actor, "processes.view"),
    },
    {
      id: "fluxos",
      label: "Fluxos entre setores",
      icon: DepartmentFlowIcon,
      allowed:
        hasPermission(actor, "processes.view") ||
        hasPermission(actor, "templates.view"),
    },
    {
      id: "modelos",
      label: "Modelos de tarefa",
      icon: TaskBlueprintIcon,
      allowed: hasPermission(actor, "templates.view"),
    },
  ].filter((tab) => tab.allowed);
  const requested =
    params.get("aba") ?? (params.get("empresa") ? "fluxos" : undefined);
  const view = tabs.some((tab) => tab.id === requested)
    ? requested
    : tabs[0]?.id;
  const setView = (id: string) => setParams({ aba: id });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const tasks = data.tasks.filter((task) => !!task.onboardingId);
  const canOpenTask = hasPermission(actor, "tasks.view");
  function exportProcesses() {
    if (!tasks.length && data.companyOnboardings.length) {
      downloadText(
        "processos-apice.csv",
        [
          ["Processo", "Competência", "Setor", "Etapa", "Andamento"],
          ...data.companyOnboardings.flatMap((run) =>
            run.stages.map((stage) => [
              run.flowTitle,
              run.competence,
              stage.department,
              stage.title,
              stage.status === "done"
                ? "Concluída"
                : stage.status === "active"
                  ? "Liberada para execução"
                  : "Aguarda o setor anterior",
            ]),
          ),
        ]
          .map((row) => row.map(csvCell).join(";"))
          .join("\r\n"),
      );
      return;
    }
    downloadText(
      "processos-apice.csv",
      [
        [
          "Empresa",
          "Processo",
          "Setor",
          "Tarefa",
          "Responsável",
          "Situação",
          "Meta",
          "Prazo",
        ],
        ...tasks.map((task) => [
          data.companies.find((company) => company.id === task.companyId)?.name,
          data.companyOnboardings.find((run) => run.id === task.onboardingId)
            ?.flowTitle,
          task.department,
          task.title,
          data.users.find((user) => user.userId === task.assigneeId)?.name,
          statusLabels[task.status],
          task.internalDue,
          task.legalDue,
        ]),
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n"),
    );
  }
  async function move(id: string, target: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task || busy) return;
    setError("");
    const type =
      target === "in_progress" && ["todo", "returned"].includes(task.status)
        ? "start"
        : target === "in_review" &&
            task.status === "in_progress" &&
            task.requiresReview
          ? "submit"
          : target === "closed" &&
              task.status === "in_progress" &&
              !task.requiresReview
            ? "complete"
            : target === "closed" && task.status === "in_review"
              ? "approve"
              : undefined;
    if (!type) {
      setError(
        "Esta movimentação exige uma ação específica. Abra a tarefa para conferir etapas, documentos e permissões.",
      );
      return;
    }
    setBusy(true);
    try {
      await client.command(id, { type, expectedRevision: task.revision });
      await refresh();
      notify(
        "Etapa atualizada. O próximo setor será liberado conforme o fluxo.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Movimentação não permitida.",
      );
    } finally {
      setBusy(false);
    }
  }
  function open(task: Task) {
    setDepartment(task.department);
    setCompetence(task.competence);
  }
  return (
    <>
      <div
        className="section-tabs"
        role="tablist"
        aria-label="Fluxos e processos"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            className={view === tab.id ? "active" : ""}
            onClick={() => setView(tab.id)}
          >
            <tab.icon size={17} />
            {tab.label}
          </button>
        ))}
      </div>
      {view === "modelos" ? (
        <TaskTemplatesPage />
      ) : view === "fluxos" ? (
        <DepartmentFlowsPage
          key={params.get("empresa") ?? "flows"}
          initialCompanyId={params.get("empresa") ?? undefined}
        />
      ) : (
        <>
          <PageHeading
            title="Fluxos e processos"
            description="Acompanhe a implantação e as atividades que passam entre os setores."
          >
            <button className="button button-white" onClick={exportProcesses}>
              <ExportFileIcon size={16} />
              Exportar
            </button>
            {hasPermission(actor, "processes.manage") && (
              <button
                className="button button-primary"
                onClick={() => setView("fluxos")}
              >
                <ListViewIcon size={16} />
                Criar ou iniciar processo
              </button>
            )}
          </PageHeading>
          <p className="muted-note process-instruction">
            Arraste uma atividade para iniciar, enviar à conferência ou
            concluir. As mesmas regras da tarefa são verificadas; as próximas
            etapas continuam bloqueadas até a entrega anterior.
          </p>
          <FormError message={error} />
          <div className="process-board">
            {columns.map((column) => (
              <section
                className={`process-column process-${column.id}`}
                key={column.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void move(
                    event.dataTransfer.getData("text/plain"),
                    column.id,
                  );
                }}
              >
                <header>
                  <h2>{column.title}</h2>
                  <span>
                    {
                      tasks.filter((task) =>
                        column.id === "closed"
                          ? ["done", "dispensed"].includes(task.status)
                          : column.id === "todo"
                            ? ["todo", "returned", "waiting"].includes(
                                task.status,
                              )
                            : task.status === column.id,
                      ).length
                    }
                  </span>
                </header>
                {tasks
                  .filter((task) =>
                    column.id === "closed"
                      ? ["done", "dispensed"].includes(task.status)
                      : column.id === "todo"
                        ? ["todo", "returned", "waiting"].includes(task.status)
                        : task.status === column.id,
                  )
                  .map((task) => (
                    <article
                      draggable={
                        canOpenTask &&
                        !busy &&
                        !["done", "dispensed"].includes(task.status) &&
                        (hasPermission(actor, "tasks.execute") ||
                          hasPermission(actor, "tasks.review"))
                      }
                      onDragStart={(event) =>
                        event.dataTransfer.setData("text/plain", task.id)
                      }
                      className="process-card"
                      key={task.id}
                    >
                      <span className="badge status-todo">
                        {task.department}
                      </span>
                      <h3>{task.title}</h3>
                      <p>
                        {
                          data.companies.find(
                            (company) => company.id === task.companyId,
                          )?.name
                        }
                      </p>
                      <small>
                        {data.users.find(
                          (user) => user.userId === task.assigneeId,
                        )?.name ?? "Fila do setor"}
                      </small>
                      <div className="process-card-steps">
                        {task.steps.filter((step) => step.completed).length}/
                        {task.steps.length} etapas · {task.legalDue.slice(8)}/
                        {task.legalDue.slice(5, 7)}
                      </div>
                      {canOpenTask && (
                        <Link
                          className="text-button"
                          onClick={() => open(task)}
                          to={`/tarefas?task=${encodeURIComponent(task.id)}&department=${encodeURIComponent(task.department)}&competence=${task.competence}`}
                        >
                          Abrir atividade <ForwardIcon size={15} />
                        </Link>
                      )}
                    </article>
                  ))}
              </section>
            ))}
          </div>
          {!tasks.length && data.companyOnboardings.length > 0 && (
            <section className="surface" aria-label="Processos no seu escopo">
              <div className="surface-heading">
                <h2>Processos no seu escopo</h2>
              </div>
              <p className="report-note">
                Você pode acompanhar os setores abaixo. Abertura e execução de
                atividades dependem das permissões de tarefas.
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Processo</th>
                      <th>Competência</th>
                      <th>Setor / etapa</th>
                      <th>Andamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companyOnboardings.flatMap((run) =>
                      run.stages.map((stage) => (
                        <tr key={`${run.id}:${stage.id}`}>
                          <td>{run.flowTitle}</td>
                          <td>{run.competence}</td>
                          <td>
                            {stage.department} · {stage.title}
                          </td>
                          <td>
                            {stage.status === "done"
                              ? "Concluída"
                              : stage.status === "active"
                                ? "Liberada para execução"
                                : "Aguarda o setor anterior"}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              <button className="text-button" onClick={() => setView("fluxos")}>
                Ver modelos e andamento completo
              </button>
            </section>
          )}
          {!tasks.length && !data.companyOnboardings.length && (
            <EmptyState
              title="Nenhum processo iniciado"
              text="Crie um fluxo com blocos por departamento e vincule-o a uma empresa."
              action={
                <button
                  className="button button-primary"
                  onClick={() => setView("fluxos")}
                >
                  Ver modelos de processo
                </button>
              }
            />
          )}
        </>
      )}
    </>
  );
}
