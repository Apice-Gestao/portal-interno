import type { Permission } from "./access.js";

export type Role =
  | "admin"
  | "supervisor"
  | "coordinator"
  | "operator"
  | "viewer"
  | "manager"
  | "director";

export type Department = string;

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "returned"
  | "waiting"
  | "done"
  | "dispensed";

export interface Actor {
  managerId?: string;

  homeView?: "personal" | "team" | "management" | "executive";

  userId: string;

  tenantId: string;

  name: string;

  initials: string;

  role: Role;

  departments: Department[];

  permissions?: Permission[];

  active?: boolean;
}

export interface AccountUser extends Actor {
  username: string;

  email?: string;

  permissions: Permission[];

  active: boolean;

  mustChangePassword: boolean;
}

export interface AccountInput {
  managerId?: string;

  homeView?: "personal" | "team" | "management" | "executive";

  name: string;

  username: string;

  email: string;

  password: string;

  departments: Department[];

  permissions: Permission[];

  role: Role;
}

export type AccountUpdate = Partial<AccountInput> & { active?: boolean };

// Steps a single company uses for one task template (17/10/2026).
// `baseVersion` is the template version the customization was made from.
export interface CompanyWorkflowOverride {
  steps: WorkflowStep[];
  baseVersion: number;
  updatedAt: string;
  updatedBy: string;
}

export interface Company {
  createdAt?: string;

  workflowOverrides?: Record<string, CompanyWorkflowOverride>;

  revision?: number;

  status?: CompanyStatus;

  serviceEndCompetence?: string;

  responsibilities?: Record<Department, CompanyResponsibility>;

  tags?: string[];

  operationalHistory?: CompanyOperationalChange[];

  id: string;

  tenantId: string;

  code: string;

  name: string;

  cnpj: string;

  regime: string;

  city: string;

  active: boolean;

  ownerId: string;

  startDate: string;
}

export interface WorkflowStep {
  id: string;

  title: string;
}

export interface TaskTemplate {
  id: string;

  tenantId: string;

  title: string;

  description: string;

  department: Department;

  regime: string;

  periodicity: "Mensal";

  internalDay: number;

  legalDay: number;

  requiresReview: boolean;

  requiredDocument: string;

  version: number;

  active: boolean;

  workflowSteps?: WorkflowStep[];
}

export interface DepartmentFlowStage {
  id: string;

  title: string;

  department: Department;

  workflowSteps: WorkflowStep[];

  internalDays: number;

  legalDays: number;

  requiresReview: boolean;

  requiredDocument: string;
}

export interface CreateDepartmentFlow {
  kind?: "onboarding" | "process";

  title: string;

  description?: string;

  stages: DepartmentFlowStage[];
}

export interface UpdateDepartmentFlow extends CreateDepartmentFlow {
  expectedVersion: number;

  active: boolean;
}

export interface DepartmentFlow extends CreateDepartmentFlow {
  id: string;

  tenantId: string;

  version: number;

  active: boolean;
}

export interface StartCompanyOnboarding {
  companyId: string;

  flowId: string;

  expectedFlowVersion: number;

  competence: string;

  blockRecurring: boolean;

  assignments: Record<string, string>;
}

export interface CompanyOnboarding {
  kind?: "onboarding" | "process";

  id: string;

  tenantId: string;

  companyId: string;

  flowId: string;

  flowVersion: number;

  flowTitle: string;

  competence: string;

  blockRecurring: boolean;

  status: "active" | "completed";

  startedAt: string;

  completedAt?: string;

  revision: number;

  stages: (DepartmentFlowStage & {
    assigneeId: string;
    taskId?: string;
    status: "blocked" | "active" | "done";
  })[];
}
export interface UpdateCompanyOnboarding {
  expectedRevision: number;
  assignments: Record<string, string>;
}

export interface DocumentVersion {
  logicalId?: string;

  logicalVersion?: number;

  documentTypeId?: string;

  id: string;

  version: number;

  name: string;

  bytes: number;

  kind: "PDF" | "XML";

  createdAt: string;

  authorId: string;

  validation: "accepted" | "rejected";

  hash?: string;
}

export type TaskAuditState = Pick<
  Task,
  | "status"
  | "assigneeId"
  | "revision"
  | "internalDue"
  | "legalDue"
  | "completedAt"
  | "reopenedCount"
> & {
  completedStepIds: string[];

  documentVersions: number;
};

export interface AuditEvent {
  id: string;

  tenantId: string;

  taskId?: string;

  companyId?: string;

  department?: Department;

  actorId: string;

  actorName: string;

  action: string;

  detail: string;

  at: string;

  before?: TaskAuditState;

  after?: TaskAuditState;

  templateId?: string;

  beforeTemplate?: TaskTemplate;

  afterTemplate?: TaskTemplate;

  category?: "security";

  ip?: string;

  device?: string;
}

export interface Task {
  requiredDocumentTypeIds?: string[];

  comments?: TaskComment[];

  applicabilityReview?: { proposalId: string; reason: string };

  cancelled?: boolean;

  /** Status held when the task was cancelled; reopening restores it. */
  cancelledFromStatus?: TaskStatus;

  id: string;

  tenantId: string;

  companyId: string;

  templateId: string;

  templateVersion: number;

  title: string;

  description: string;

  department: Department;

  competence: string;

  internalDue: string;

  legalDue: string;

  status: TaskStatus;

  assigneeId: string;

  executorId?: string;

  executionActorIds: string[];

  requiresReview: boolean;

  steps: { id: string; title: string; completed: boolean }[];

  documentLabel: string;

  documents: DocumentVersion[];

  revision: number;

  dispenseRequested: boolean;

  startedAt?: string;

  originalCompletedAt?: string;

  completedAt?: string;

  reopenedCount: number;

  onboardingId?: string;

  onboardingStageId?: string;

  evidenceRequired?: boolean;
}

export interface PortalState {
  workspaces?: WorkspaceSettings[];

  changeProposals?: CompanyChangeProposal[];

  companies: Company[];

  templates: TaskTemplate[];

  tasks: Task[];

  audit: AuditEvent[];

  users: Actor[];

  departmentFlows?: DepartmentFlow[];

  companyOnboardings?: CompanyOnboarding[];
}

export interface Snapshot extends PortalState {
  workspace: WorkspaceSettings;

  changeProposals: CompanyChangeProposal[];

  departmentFlows: DepartmentFlow[];

  companyOnboardings: CompanyOnboarding[];

  now: string;

  persistence: "memory" | "postgres";

  actor: Actor;
}

export type TaskCommand =
  | {
      type: "start" | "submit" | "complete" | "approve";

      expectedRevision: number;
    }
  | {
      type: "step";

      expectedRevision: number;

      stepId: string;

      completed: boolean;
    }
  | {
      type:
        | "return"
        | "wait"
        | "request_dispense"
        | "deny_dispense"
        | "dispense"
        | "reopen"
        | "cancel"
        | "retain_applicability";

      expectedRevision: number;

      reason: string;
    }
  | { type: "assign"; expectedRevision: number; assigneeId: string }
  | { type: "resume"; expectedRevision: number };

export interface UploadEvidence {
  logicalId?: string;

  documentTypeId?: string;

  name: string;

  bytes: number;

  kind: "PDF" | "XML";

  hash?: string;
}

export interface CreateCompany {
  code?: string;

  status?: CompanyStatus;

  serviceEndCompetence?: string;

  responsibilities?: Record<Department, CompanyResponsibility>;

  tags?: string[];

  onboarding?: Omit<StartCompanyOnboarding, "companyId">;

  name: string;

  cnpj: string;

  regime: string;

  city: string;

  ownerId: string;
}

export interface CompanyResponsibility {
  mode: "person" | "department" | "none";
  userId?: string;
}

export interface CompanyOperationalPatch {
  regime?: string;
  responsibilities?: Record<Department, CompanyResponsibility>;
  status?: CompanyStatus;
  serviceEndCompetence?: string;
}

export interface CompanyOperationalChange extends CompanyOperationalPatch {
  effectiveCompetence: string;
  proposalId: string;
}

export interface UpdateCompany {
  expectedRevision: number;
  name?: string;
  code?: string;
  city?: string;
  tags?: string[];
}

export interface ProposeCompanyChange {
  companyId: string;
  expectedRevision: number;
  patch: CompanyOperationalPatch;
  effectiveCompetence: string;
  reason: string;
  transferOpenTasks?: boolean;
}

export interface CompanyChangeProposal {
  id: string;
  tenantId: string;
  companyId: string;
  expectedCompanyRevision: number;
  revision: number;
  status: "pending" | "approved" | "rejected";
  patch: CompanyOperationalPatch;
  effectiveCompetence: string;
  transferOpenTasks?: boolean;
  reason: string;
  createdAt: string;
  createdBy: string;
  decidedAt?: string;
  decidedBy?: string;
  impact: {
    create: number;
    retain: number;
    review: number;
    transfer: number;
    taskIds: string[];
  };
}

export interface DecideChangeProposal {
  expectedRevision: number;
  decision: "approve" | "reject";
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: string;
}

export interface AddTaskComment {
  expectedRevision: number;
  text: string;
}

export interface AccessProfile {
  id: string;
  name: string;
  role: Role;
  departments: Department[];
  permissions: Permission[];
  homeView?: "personal" | "team" | "management" | "executive";
}

export interface DepartmentDefinition {
  id: string;
  name: string;
  active: boolean;
  positions?: { id: string; name: string }[];
  members?: { userId: string; positionId: string; reportsTo?: string }[];
}

export interface DocumentType {
  id: string;
  name: string;
  description?: string;
  formats: ("PDF" | "XML")[];
}

export interface DocumentRule {
  id: string;
  name: string;
  templateIds: string[];
  documentTypeIds: string[];
  required: boolean;
  keywords: string[];
  fields: ("cnpj" | "competence" | "obligation")[];
  active: boolean;
  cnpjField?: string;
  competenceField?: string;
  obligationField?: string;
}

/** "active" | "closing" | "inactive" | "suspended", or "<base>:<slug>" created by the group. */
export type CompanyStatus = string;
export interface CompanyStatusDefinition {
  id: string;
  label: string;
}

export interface WorkspaceSettings {
  id: string;
  tenantId: string;
  revision: number;
  departments: DepartmentDefinition[];
  accessProfiles: AccessProfile[];
  documentTypes: DocumentType[];
  documentRules: DocumentRule[];
  companyStatuses?: CompanyStatusDefinition[];
}

export interface UpdateWorkspaceSettings {
  expectedRevision: number;
  departments?: DepartmentDefinition[];
  accessProfiles?: AccessProfile[];
  documentTypes?: DocumentType[];
  documentRules?: DocumentRule[];
  companyStatuses?: CompanyStatusDefinition[];
}

export interface TransferCompanies {
  companyIds: string[];
  department: Department;
  target: CompanyResponsibility;
  transferOpenTasks: boolean;
  expectedRevisions: Record<string, number>;
  effectiveCompetence?: string;
}

export interface CreateTemplate {
  title: string;

  description: string;

  department: Department;

  regime: string;

  internalDay: number;

  legalDay: number;

  requiresReview: boolean;

  requiredDocument: string;

  workflowSteps?: WorkflowStep[];
}

export interface UpdateTemplate extends CreateTemplate {
  workflowSteps: WorkflowStep[];

  expectedVersion: number;
}

export interface CreateTask {
  title: string;

  description: string;

  companyId: string;

  department: Department;

  internalDue: string;

  legalDue: string;

  assigneeId: string;

  requiresReview: boolean;

  /** Defaults to the current month in Brasília. */
  competence?: string;
}

export interface PortalRepository {
  read(): PortalState;

  replace(state: PortalState): void;
}

export class MemoryRepository implements PortalRepository {
  private state: PortalState;

  constructor(initial: PortalState) {
    this.state = structuredClone(initial);
  }

  read(): PortalState {
    return structuredClone(this.state);
  }

  replace(state: PortalState): void {
    this.state = structuredClone(state);
  }
}
