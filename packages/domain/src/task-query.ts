import type { Task } from "./types.js";
import { deadline } from "./selectors.js";
export interface TaskSelection {
  status?: string;
  urgency?: string;
  owner?: string;
  obligation?: string;
  company?: string;
  model?: string;
}
export function matchesSelection(
  task: Task,
  selection: TaskSelection,
  today: string,
): boolean {
  const closed = ["done", "dispensed"].includes(task.status);
  const {
    status = "all",
    urgency,
    owner,
    obligation,
    company,
    model,
  } = selection;
  return (
    (status === "all" ||
      (status === "open"
        ? !closed
        : status === "closed"
          ? closed
          : task.status === status)) &&
    (!owner || task.assigneeId === owner) &&
    (!obligation || task.title === obligation) &&
    (!company || task.companyId === company) &&
    (!model || task.templateId === model) &&
    (!urgency ||
      (urgency === "legal"
        ? deadline(task, today).legalLate && !closed
        : urgency === "meta-only"
          ? !closed && task.internalDue < today && task.legalDue > today
          : urgency === "internal"
            ? deadline(task, today).internalLate && !closed
            : urgency === "on-time"
              ? task.status === "done" && !deadline(task, today).internalLate
              : !closed &&
                (task.internalDue === today || task.legalDue === today)))
  );
}
export function obligationGroups(tasks: Task[]) {
  const groups = new Map<
    string,
    { key: string; title: string; model: string }
  >();
  for (const task of tasks) {
    const key =
      task.templateId === "avulsa" ? `avulsa:${task.title}` : task.templateId;
    groups.set(key, { key, title: task.title, model: task.templateId });
  }
  return [...groups.values()];
}
export function obligationCell(
  tasks: Task[],
  companyId: string,
  group: { title: string; model: string },
) {
  return tasks.filter(
    (task) =>
      task.companyId === companyId &&
      task.templateId === group.model &&
      (group.model !== "avulsa" || task.title === group.title),
  );
}
