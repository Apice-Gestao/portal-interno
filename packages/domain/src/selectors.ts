import type { Actor, Task } from "./types.js";
import { hasPermission } from "./access.js";
export const statusLabels = {
  todo: "A fazer",
  in_progress: "Em andamento",
  in_review: "Em conferência",
  returned: "Devolvida",
  waiting: "Aguardando cliente",
  done: "Concluída",
  dispensed: "Dispensada",
} as const;
export const roleLabels = {
  operator: "Operador",
  coordinator: "Coordenador",
  admin: "Administrador",
  supervisor: "Supervisor",
  viewer: "Consulta",
} as const;
export function isManager(actor: Actor): boolean {
  return actor.permissions === undefined
    ? actor.role === "admin" ||
        actor.role === "coordinator" ||
        actor.role === "supervisor"
    : hasPermission(actor, "tasks.manage");
}
export function canSeeTask(actor: Actor, task: Task): boolean {
  return (
    actor.tenantId === task.tenantId &&
    (hasPermission(actor, "tasks.view") ||
      hasPermission(actor, "reports.view") ||
      hasPermission(actor, "documents.view") ||
      hasPermission(actor, "overview.view")) &&
    actor.departments.includes(task.department) &&
    (actor.permissions !== undefined
      ? hasPermission(actor, "tasks.team.view") ||
        task.assigneeId === actor.userId
      : actor.role !== "operator" ||
        task.assigneeId === actor.userId ||
        (task.status === "in_review" &&
          !task.executionActorIds.includes(actor.userId)))
  );
}
export function deadline(
  task: Task,
  today: string,
): {
  label: string;
  tone: "danger" | "warning" | "success" | "neutral";
  internalLate: boolean;
  legalLate: boolean;
} {
  if (task.status === "dispensed")
    return {
      label: "Dispensada",
      tone: "neutral",
      internalLate: false,
      legalLate: false,
    };
  const date = task.completedAt?.slice(0, 10) ?? today;
  const internalLate = date > task.internalDue;
  const legalLate = date > task.legalDue;
  return {
    label:
      task.status === "done"
        ? legalLate
          ? "Após prazo legal"
          : internalLate
            ? "Após meta interna"
            : "Entregue na meta"
        : legalLate
          ? "Prazo legal vencido"
          : task.legalDue === today
            ? "Prazo legal hoje"
            : internalLate
              ? "Meta vencida"
              : task.internalDue === today
                ? "Meta vence hoje"
                : "No prazo",
    tone: legalLate
      ? "danger"
      : internalLate || task.legalDue === today || task.internalDue === today
        ? "warning"
        : task.status === "done"
          ? "success"
          : "neutral",
    internalLate,
    legalLate,
  };
}
export function dateLabel(iso: string): string {
  const parts = iso.slice(0, 10).split("-");
  return `${parts[2]}/${parts[1]}`;
}
export function competenceLabel(value: string): string {
  return `${value.slice(5)}/${value.slice(0, 4)}`;
}
export function metric(tasks: Task[], today: string) {
  const done = tasks.filter((t) => t.status === "done");
  const dispensed = tasks.filter((t) => t.status === "dispensed");
  return {
    total: tasks.length,
    done: done.length,
    dispensed: dispensed.length,
    open: tasks.length - done.length - dispensed.length,
    review: tasks.filter((t) => t.status === "in_review").length,
    legalLate: tasks.filter(
      (t) =>
        !["done", "dispensed"].includes(t.status) &&
        deadline(t, today).legalLate,
    ).length,
    internalLate: tasks.filter(
      (t) =>
        !["done", "dispensed"].includes(t.status) &&
        deadline(t, today).internalLate,
    ).length,
    onTimePercent: done.length
      ? Math.round(
          (done.filter((t) => !deadline(t, today).internalLate).length /
            done.length) *
            100,
        )
      : 0,
    progress: tasks.length
      ? Math.round(((done.length + dispensed.length) / tasks.length) * 100)
      : 0,
  };
}
