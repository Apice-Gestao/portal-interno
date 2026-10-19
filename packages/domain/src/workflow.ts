import type { Company, TaskTemplate, WorkflowStep } from "./types.js";

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

// Steps for new tasks of this company: its own customization when present, otherwise the template's.
export function getCompanyWorkflow(
  template: Pick<TaskTemplate, "id" | "workflowSteps">,
  company: Pick<Company, "workflowOverrides">,
): WorkflowStep[] {
  const override = company.workflowOverrides?.[template.id];
  return override
    ? override.steps.map((step) => ({ ...step }))
    : getTemplateWorkflow(template);
}

// True when the general template changed after the company's customization was made.
export function isWorkflowOverrideOutdated(
  template: Pick<TaskTemplate, "id" | "version">,
  company: Pick<Company, "workflowOverrides">,
): boolean {
  const override = company.workflowOverrides?.[template.id];
  return !!override && override.baseVersion < template.version;
}
