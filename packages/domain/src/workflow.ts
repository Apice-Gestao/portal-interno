import type { TaskTemplate, WorkflowStep } from "./types.js";

const defaultWorkflow: readonly WorkflowStep[] = [
  { id: "check", title: "Conferir dados e documentos da empresa" },
  { id: "calculate", title: "Realizar apuração e validar os valores" },
  { id: "prepare", title: "Preparar a entrega e anexar a evidência" },
];

export function getTemplateWorkflow(
  template: Pick<TaskTemplate, "workflowSteps">,
): WorkflowStep[] {
  return (template.workflowSteps ?? defaultWorkflow).map((step) => ({
    ...step,
  }));
}
