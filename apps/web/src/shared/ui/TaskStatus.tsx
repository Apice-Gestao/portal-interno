import {
  PendingIcon,
  OverdueIcon,
  CompletedIcon,
  ClockIcon,
  WaitingIcon,
  DispensedIcon,
  StartIcon,
  ReturnedIcon,
  ReviewIcon,
  DeadlineWarningIcon,
  OnTimeIcon,
  TodayIcon,
  CancelledIcon,
} from "../icons";
import { deadline, statusLabels } from "@apice/domain";
import type { Task, TaskStatus } from "@apice/domain";
import "./tasks-status.css";

type DeadlineTone = "neutral" | "today" | "warning" | "danger" | "success";

// Deadline colors describe the delivery date; workflow labels remain separate.
function taskDeadlinePresentation(task: Task, today: string) {
  const due = deadline(task, today);
  if (task.status === "dispensed")
    return {
      tone: "neutral" as DeadlineTone,
      label: task.cancelled ? "Cancelada" : "Dispensada",
      late: false,
    };
  if (task.status === "done")
    return {
      tone: "success" as DeadlineTone,
      label:
        due.internalLate || due.legalLate
          ? "Entregue com atraso"
          : "Entregue no prazo",
      late: due.internalLate || due.legalLate,
    };
  if (due.legalLate)
    return { tone: "danger" as DeadlineTone, label: "Atrasada", late: false };
  if (task.internalDue === today || task.legalDue === today)
    return { tone: "today" as DeadlineTone, label: "Vence hoje", late: false };
  if (due.internalLate)
    return {
      tone: "warning" as DeadlineTone,
      label: "Meta vencida",
      late: false,
    };
  return { tone: "neutral" as DeadlineTone, label: "No prazo", late: false };
}

const deadlineIcons = {
  neutral: OnTimeIcon,
  today: TodayIcon,
  warning: DeadlineWarningIcon,
  danger: OverdueIcon,
  success: CompletedIcon,
};

export function TaskDeadlineBadge({
  task,
  today,
}: {
  task: Task;
  today: string;
}) {
  const state = taskDeadlinePresentation(task, today);
  const Icon = task.cancelled
    ? CancelledIcon
    : task.status === "dispensed"
      ? DispensedIcon
      : deadlineIcons[state.tone];
  return (
    <span className={`task-deadline task-deadline-${state.tone}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{state.label}</span>
      {state.late && <ClockIcon size={13} aria-hidden="true" />}
    </span>
  );
}

const workflowIcons = {
  todo: PendingIcon,
  in_progress: StartIcon,
  in_review: ReviewIcon,
  returned: ReturnedIcon,
  waiting: WaitingIcon,
  done: CompletedIcon,
  dispensed: DispensedIcon,
};

export function TaskWorkflowLabel({ status }: { status: TaskStatus }) {
  const Icon = workflowIcons[status];
  return (
    <span className={`task-workflow task-workflow-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
