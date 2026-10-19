import type {
  Actor,
  Company,
  PortalState,
  WorkspaceSettings,
} from "./types.js";
import { OPERATOR_PERMISSIONS, PERMISSIONS, hasPermission } from "./access.js";
import { roleLabels } from "./selectors.js";
export function workspaceForActor(
  workspace: WorkspaceSettings,
  actor: Actor,
): WorkspaceSettings {
  const result = structuredClone(workspace);
  if (!hasPermission(actor, "users.manage"))
    result.departments = result.departments.map((department) => ({
      ...department,
      members: department.members
        ?.filter((member) => member.userId === actor.userId)
        .map((member) => ({
          userId: member.userId,
          positionId: member.positionId,
        })),
    }));
  return result;
}
export function departmentPositionLabel(
  workspace: WorkspaceSettings,
  actor: Actor,
  departmentId: string,
): string {
  const department = workspace.departments.find(
    (item) => item.id === departmentId,
  );
  const member = department?.members?.find(
    (item) => item.userId === actor.userId,
  );
  return (
    department?.positions?.find(
      (position) => position.id === member?.positionId,
    )?.name ?? roleLabels[actor.role]
  );
}

export function defaultWorkspace(
  tenantId: string,
  departments: string[] = [],
): WorkspaceSettings {
  const ids = [...new Set(["Fiscal", "Contábil", "Pessoal", ...departments])];
  return {
    id: "settings",
    tenantId,
    revision: 1,
    departments: ids.map((id) => ({ id, name: id, active: true })),
    accessProfiles: [
      {
        id: "operator",
        name: "Operação",
        role: "operator",
        departments: [ids[0]!],
        permissions: [...OPERATOR_PERMISSIONS],
        homeView: "personal",
      },
      {
        id: "coordinator",
        name: "Coordenação",
        role: "coordinator",
        departments: [ids[0]!],
        permissions: [
          "overview.view",
          "tasks.view",
          "tasks.team.view",
          "tasks.execute",
          "tasks.attach",
          "tasks.download",
          "tasks.review",
          "tasks.assign",
          "tasks.comment",
          "companies.view",
          "reports.view",
        ],
        homeView: "team",
      },
      {
        id: "director",
        name: "Diretoria",
        role: "director",
        departments: ids,
        permissions: [
          "overview.view",
          "tasks.view",
          "tasks.team.view",
          "companies.view",
          "reports.view",
          "reports.performance.view",
        ],
        homeView: "executive",
      },
      {
        id: "admin",
        name: "Administração",
        role: "admin",
        departments: ids,
        permissions: [...PERMISSIONS],
        homeView: "management",
      },
    ],
    documentTypes: [
      { id: "receipt", name: "Recibo ou comprovante", formats: ["PDF", "XML"] },
      { id: "guide", name: "Guia", formats: ["PDF"] },
      { id: "support", name: "Memória de cálculo", formats: ["PDF", "XML"] },
    ],
    documentRules: [],
  };
}

export function workspaceOf(
  state: PortalState,
  tenantId: string,
): WorkspaceSettings {
  return structuredClone(
    state.workspaces?.find((w) => w.tenantId === tenantId) ??
      defaultWorkspace(
        tenantId,
        state.users
          .filter((u) => u.tenantId === tenantId)
          .flatMap((u) => u.departments),
      ),
  );
}

export function companyAtCompetence(
  company: Company,
  competence: string,
): Company {
  const result = structuredClone(company);
  for (const change of [...(company.operationalHistory ?? [])].sort((a, b) =>
    a.effectiveCompetence.localeCompare(b.effectiveCompetence),
  )) {
    if (change.effectiveCompetence > competence) continue;
    const {
      effectiveCompetence: _effective,
      proposalId: _proposal,
      ...patch
    } = change;
    void _effective;
    void _proposal;
    const responsibilities = patch.responsibilities
      ? { ...result.responsibilities, ...patch.responsibilities }
      : result.responsibilities;
    Object.assign(result, patch);
    if (responsibilities) result.responsibilities = responsibilities;
    // Any active situation (custom ones included) reopens the service unless
    // the same change sets a new end.
    if (
      change.status &&
      companyStatusBase(change.status) === "active" &&
      !change.serviceEndCompetence
    )
      delete result.serviceEndCompetence;
  }
  if (result.status) result.active = companyStatusGeneratesTasks(result.status);
  return result;
}

/**
 * Whether a company, already projected to `competence`, receives tasks in it.
 * Suspended never does (even with an end left by an earlier closing); closing
 * and inactive are served up to their final competence.
 */
export function companyServes(company: Company, competence: string): boolean {
  if (company.serviceEndCompetence && competence > company.serviceEndCompetence)
    return false;
  const base = companyStatusBase(company.status);
  if (company.status && base === "suspended") return false;
  return company.active || !!company.serviceEndCompetence;
}

export function requiredDocumentTypes(
  state: PortalState,
  tenantId: string,
  templateId: string,
): string[] {
  return [
    ...new Set(
      workspaceOf(state, tenantId)
        .documentRules.filter(
          (rule) =>
            rule.active &&
            rule.required &&
            (rule.templateIds.length === 0 ||
              rule.templateIds.includes(templateId)),
        )
        .flatMap((rule) => rule.documentTypeIds),
    ),
  ];
}

// ---- Company situations (17/10/2026) ----
const BASE_STATUSES = ["active", "suspended", "inactive", "closing"] as const;
export const COMPANY_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  inactive: "Inativa",
  closing: "Em encerramento",
};
/** The built-in behaviour behind any situation, including created ones. */
export function companyStatusBase(
  status?: string,
): (typeof BASE_STATUSES)[number] {
  const base = (status ?? "active").split(":")[0];
  return (BASE_STATUSES as readonly string[]).includes(base!)
    ? (base as (typeof BASE_STATUSES)[number])
    : "active";
}
/** Suspended and inactive companies stop receiving new recurring tasks. */
export function companyStatusGeneratesTasks(status?: string): boolean {
  return !["inactive", "suspended"].includes(companyStatusBase(status));
}
/** Closing and inactive ask for the last competence served. */
export function companyStatusNeedsEnd(status?: string): boolean {
  return ["closing", "inactive"].includes(companyStatusBase(status));
}
export function companyStatusOptions(
  workspace?: Pick<WorkspaceSettings, "companyStatuses">,
) {
  return [
    ...BASE_STATUSES.map((id) => ({
      id: id as string,
      label: COMPANY_STATUS_LABELS[id]!,
      custom: false,
    })),
    ...(workspace?.companyStatuses ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      custom: true,
    })),
  ];
}
export function companyStatusLabel(
  status: string | undefined,
  workspace?: Pick<WorkspaceSettings, "companyStatuses">,
): string {
  const id = status ?? "active";
  return (
    COMPANY_STATUS_LABELS[id] ??
    workspace?.companyStatuses?.find((item) => item.id === id)?.label ??
    COMPANY_STATUS_LABELS[companyStatusBase(id)]!
  );
}
export function isKnownCompanyStatus(
  status: string | undefined,
  workspace?: Pick<WorkspaceSettings, "companyStatuses">,
): boolean {
  return (
    !status ||
    status in COMPANY_STATUS_LABELS ||
    !!workspace?.companyStatuses?.some((item) => item.id === status)
  );
}
