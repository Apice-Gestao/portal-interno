import type { Company, TaskTemplate } from "@apice/domain";

// Companies this template applies to (same rule as task generation).
export function applicableCompanies(
  template: TaskTemplate,
  companies: Company[],
) {
  return companies.filter(
    (company) =>
      company.active &&
      (template.regime === "Todos" || template.regime === company.regime),
  );
}

export function customizedCompanies(
  template: TaskTemplate,
  companies: Company[],
) {
  return companies.filter(
    (company) => company.workflowOverrides?.[template.id],
  );
}
