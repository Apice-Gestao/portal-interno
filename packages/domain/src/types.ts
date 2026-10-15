import type { Permission } from "./access.js";
export type Role =
  "admin" | "supervisor" | "coordinator" | "operator" | "viewer";
export type Department = "Fiscal" | "Contábil" | "Pessoal";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "returned"
  | "waiting"
  | "done"
  | "dispensed";
export interface Actor {
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
  name: string;
  username: string;
  email: string;
  password: string;
  departments: Department[];
  permissions: Permission[];
  role: Role;
}
export type AccountUpdate = Partial<AccountInput> & { active?: boolean };
export interface Company {
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
export interface DocumentVersion {
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
}
export interface PortalState {
  companies: Company[];
  templates: TaskTemplate[];
  tasks: Task[];
  audit: AuditEvent[];
  users: Actor[];
}
export interface Snapshot extends PortalState {
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
      type: "return" | "wait" | "request_dispense" | "dispense" | "reopen";
      expectedRevision: number;
      reason: string;
    }
  | { type: "assign"; expectedRevision: number; assigneeId: string }
  | { type: "resume"; expectedRevision: number };
export interface UploadEvidence {
  name: string;
  bytes: number;
  kind: "PDF" | "XML";
  hash?: string;
}
export interface CreateCompany {
  name: string;
  cnpj: string;
  regime: string;
  city: string;
  ownerId: string;
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
