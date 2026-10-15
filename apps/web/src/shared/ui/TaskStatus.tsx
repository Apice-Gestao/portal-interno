import {
  Circle,
  CircleAlert,
  CircleCheck,
  Clock3,
  Hourglass,
  MinusCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
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
      label: "Dispensada",
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
  neutral: Circle,
  today: Clock3,
  warning: TriangleAlert,
  danger: CircleAlert,
  success: CircleCheck,
};

export function TaskDeadlineBadge({
  task,
  today,
}: {
  task: Task;
  today: string;
}) {
  const state = taskDeadlinePresentation(task, today);
  const Icon =
    task.status === "dispensed" ? MinusCircle : deadlineIcons[state.tone];
  return (
    <span className={`task-deadline task-deadline-${state.tone}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{state.label}</span>
      {state.late && <Clock3 size={13} aria-hidden="true" />}
    </span>
  );
}

const workflowIcons = {
  todo: Circle,
  in_progress: Play,
  in_review: ShieldCheck,
  returned: RotateCcw,
  waiting: Hourglass,
  done: CircleCheck,
  dispensed: MinusCircle,
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
