import { useState } from "react";
import { businessDate, canExecute, dateLabel, deadline } from "@apice/domain";
import type { Task } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { SearchIcon, TeamIcon } from "../../shared/icons";
import { SelectField } from "../../shared/ui/SelectField";
import { EmptyState } from "../../shared/ui/components";
import {
  TaskDeadlineBadge,
  TaskWorkflowLabel,
} from "../../shared/ui/TaskStatus";
import { TaskDrawer } from "../tasks/TaskDrawer";
import "../tasks/task-views.css";

const CLOSED = ["done", "dispensed", "cancelled"];

// Most urgent first: legal deadline missed, internal goal missed, then by goal date.
function urgency(task: Task, today: string) {
  const state = deadline(task, today);
  return state.legalLate ? 0 : state.internalLate ? 1 : 2;
}

// Central do gestor · Equipe (17/10/2026): open tasks grouped by person (and the
// department queues), with the task detail opening right here.
export function TeamTasks() {
  const { data, actor } = usePortal();
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const today = businessDate(data.now);
  const departments = [
    ...new Set(data.tasks.map((task) => task.department)),
  ].filter((item) => actor.departments.includes(item));
  const open = data.tasks.filter(
    (task) =>
      actor.departments.includes(task.department) &&
      !CLOSED.includes(task.status) &&
      !task.cancelled &&
      (department === "all" || task.department === department),
  );
  const departmentName = (id: string) =>
    data.workspace.departments.find((item) => item.id === id)?.name ?? id;
  const holds = (userId: string) =>
    open.some((task) => task.assigneeId === userId);
  const people = data.users.filter(
    (user) =>
      ((user.active !== false &&
        canExecute(user) &&
        user.departments.some((item) => actor.departments.includes(item)) &&
        (department === "all" || user.departments.includes(department))) ||
        // Deactivated or without execution but still holding open tasks:
        // shown so the manager can transfer them (R09).
        holds(user.userId)),
  );
  const known = new Set([
    ...people.map((user) => user.userId),
    ...departments.map((item) => `department:${item}`),
  ]);
  const byUrgency = (a: Task, b: Task) =>
    urgency(a, today) - urgency(b, today) ||
    a.internalDue.localeCompare(b.internalDue);
  const groups = [
    ...people.map((user) => {
      const attention =
        user.active === false
          ? "Desativado · transfira as tarefas"
          : !canExecute(user)
            ? "Sem permissão de execução · transfira as tarefas"
            : "";
      return {
        id: user.userId,
        name: user.name,
        detail:
          attention ||
          user.departments
            .filter((item) => actor.departments.includes(item))
            .map(departmentName)
            .join(" · "),
        queue: false,
        attention: !!attention,
        tasks: open
          .filter((task) => task.assigneeId === user.userId)
          .sort(byUrgency),
      };
    }),
    ...departments
      .filter((item) => department === "all" || item === department)
      .map((item) => ({
        id: `department:${item}`,
        name: `Fila de ${departmentName(item)}`,
        detail: "Sem responsável definido",
        queue: true,
        attention: false,
        tasks: open
          .filter((task) => task.assigneeId === `department:${item}`)
          .sort(byUrgency),
      })),
    {
      id: "outside",
      name: "Responsável fora da equipe",
      detail: "Pessoa sem acesso a este setor · transfira as tarefas",
      queue: true,
      attention: true,
      tasks: open
        .filter((task) => !known.has(task.assigneeId))
        .sort(byUrgency),
    },
  ]
    .filter(
      (group) =>
        (!group.queue || group.tasks.length) &&
        group.name
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    );
  const late = open.filter((task) => {
    const state = deadline(task, today);
    return state.internalLate || state.legalLate;
  }).length;

  return (
    <>
      <div className="team-summary">
        <div>
          <strong>{open.length}</strong>
          <span>abertas</span>
        </div>
        <div className={late ? "is-late" : ""}>
          <strong>{late}</strong>
          <span>com prazo vencido</span>
        </div>
        <div>
          <strong>
            {open.filter((task) => task.status === "in_review").length}
          </strong>
          <span>em conferência</span>
        </div>
        <div>
          <strong>
            {
              open.filter((task) => task.assigneeId.startsWith("department:"))
                .length
            }
          </strong>
          <span>na fila do setor</span>
        </div>
      </div>
      <div className="team-toolbar">
        <label className="search-field">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pessoa..."
            aria-label="Buscar pessoa"
          />
        </label>
        <SelectField
          aria-label="Setor"
          value={department}
          onValueChange={setDepartment}
          options={[
            { value: "all", label: "Todos os setores" },
            ...departments.map((item) => ({
              value: item,
              label: departmentName(item),
            })),
          ]}
        />
      </div>
      <div className="team-board" aria-label="Quadro da equipe">
        {groups.map((group) => {
          const groupLate = group.tasks.filter((task) => {
            const state = deadline(task, today);
            return state.internalLate || state.legalLate;
          }).length;
          return (
            <section
              key={group.id}
              className={`team-column ${group.queue ? "is-queue" : ""} ${group.attention ? "is-attention" : ""}`}
              aria-label={group.name}
            >
              <header className="team-column-head">
                <h2>{group.name}</h2>
                <p>
                  {group.tasks.length}{" "}
                  {group.tasks.length === 1 ? "aberta" : "abertas"}
                  {groupLate > 0 && (
                    <span className="date-danger">
                      {" "}
                      · {groupLate} {groupLate === 1 ? "vencida" : "vencidas"}
                    </span>
                  )}
                </p>
                <small title={group.detail}>{group.detail}</small>
              </header>
              <ol className="team-column-list">
                {group.tasks.map((task) => {
                  const company = data.companies.find(
                    (item) => item.id === task.companyId,
                  );
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="team-card"
                        onClick={() => setTaskId(task.id)}
                        aria-label={`Abrir ${task.title} de ${company?.name ?? "empresa"}`}
                      >
                        <strong>{company?.name ?? "Empresa"}</strong>
                        <span className="team-card-title">
                          {task.title} · {task.competence.slice(5)}/
                          {task.competence.slice(0, 4)}
                        </span>
                        <span className="team-card-foot">
                          <TaskDeadlineBadge task={task} today={today} />
                          <time dateTime={task.legalDue}>
                            Legal {dateLabel(task.legalDue)}
                          </time>
                        </span>
                        <TaskWorkflowLabel status={task.status} />
                      </button>
                    </li>
                  );
                })}
              </ol>
              {!group.tasks.length && (
                <p className="team-empty">Nenhuma tarefa aberta.</p>
              )}
            </section>
          );
        })}
      </div>
      {!groups.length && (
        <EmptyState
          title="Ninguém nesta seleção"
          text="Ajuste o setor ou a busca para ver a equipe."
        />
      )}
      <p className="team-note">
        <TeamIcon size={15} aria-hidden="true" />
        Clique numa tarefa para abrir o detalhe aqui mesmo, com as ações que seu
        acesso permite (transferir, conferir, reabrir…).
      </p>
      <TaskDrawer
        key={taskId ?? "closed"}
        taskId={taskId}
        onClose={() => setTaskId(null)}
      />
    </>
  );
}
