import { canSeeTask, isManager } from "./selectors.js";
import { buildReport } from "./reports.js";
import { businessDate } from "./dates.js";
import { closedCompetence, SYSTEM_ACTOR_ID } from "./automation.js";
import { latestDocuments } from "./documents.js";
import type { ReportFilters } from "./reports.js";
import {
  generationSchema,
  taskSchema,
  templateSchema,
  updateTemplateSchema,
  companySchema,
  createDepartmentFlowSchema,
  updateDepartmentFlowSchema,
  startCompanyOnboardingSchema,
  updateCompanyOnboardingSchema,
  updateWorkspaceSettingsSchema,
  workspaceSettingsSchema,
  updateCompanySchema,
  proposeCompanyChangeSchema,
  decideChangeProposalSchema,
  taskCommentSchema,
  transferCompaniesSchema,
  companyWorkflowSchema,
} from "./schemas.js";
import type { CompanyWorkflowInput } from "./schemas.js";
import { getCompanyWorkflow, getTemplateWorkflow } from "./workflow.js";
import { hasPermission, canExecute } from "./access.js";
import { MemoryRepository } from "./types.js";
import {
  companyAtCompetence,
  companyServes,
  companyStatusGeneratesTasks,
  isKnownCompanyStatus,
  requiredDocumentTypes,
  workspaceOf,
  workspaceForActor,
} from "./workspace.js";
import type { Permission } from "./access.js";
import type {
  Actor,
  AuditEvent,
  CreateCompany,
  CreateTask,
  CreateTemplate,
  Department,
  DocumentVersion,
  PortalRepository,
  PortalState,
  Snapshot,
  Task,
  TaskAuditState,
  TaskCommand,
  TaskTemplate,
  UpdateTemplate,
  UploadEvidence,
  CreateDepartmentFlow,
  UpdateDepartmentFlow,
  DepartmentFlow,
  CompanyOnboarding,
  StartCompanyOnboarding,
  UpdateCompanyOnboarding,
  WorkspaceSettings,
  UpdateWorkspaceSettings,
  Company,
  UpdateCompany,
  ProposeCompanyChange,
  CompanyChangeProposal,
  DecideChangeProposal,
  AddTaskComment,
  TransferCompanies,
  CompanyResponsibility,
} from "./types.js";
import { DomainError } from "./errors.js";
export { DomainError };
export class PortalEngine {
  private counter = 1000;
  constructor(
    private readonly repository: PortalRepository,
    private readonly clock: () => string,
    private readonly uniqueId?: () => string,
  ) {}
  private id(prefix: string) {
    return `${prefix}-${this.uniqueId ? this.uniqueId() : ++this.counter}`;
  }
  private record(
    state: PortalState,
    actor: Actor,
    action: string,
    detail: string,
    context: {
      task?: Task;
      before?: TaskAuditState;
      department?: Department;
      companyId?: string;
      templateId?: string;
      beforeTemplate?: TaskTemplate;
      afterTemplate?: TaskTemplate;
    } = {},
  ) {
    const { task, before } = context;
    const e: AuditEvent = {
      id: this.id("event"),
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorName: actor.name,
      action,
      detail,
      at: this.clock(),
      taskId: task?.id,
      companyId: task?.companyId ?? context.companyId,
      department: task?.department ?? context.department,
      before,
      after: task ? this.auditState(task) : undefined,
      templateId: context.templateId,
      beforeTemplate: context.beforeTemplate,
      afterTemplate: context.afterTemplate,
    };
    state.audit.unshift(e);
    return e;
  }
  logSecurity(
    actor: Actor,
    action: string,
    detail: string,
    context: { ip?: string; device?: string; taskId?: string } = {},
  ) {
    const state = this.repository.read();
    const event = this.record(state, actor, action, detail);
    Object.assign(event, { category: "security" as const, ...context });
    this.repository.replace(state);
  }
  private auditState(task: Task): TaskAuditState {
    return {
      status: task.status,
      assigneeId: task.assigneeId,
      revision: task.revision,
      internalDue: task.internalDue,
      legalDue: task.legalDue,
      completedAt: task.completedAt,
      reopenedCount: task.reopenedCount,
      completedStepIds: task.steps
        .filter((step) => step.completed)
        .map((step) => step.id),
      documentVersions: task.documents.length,
    };
  }
  snapshot(actor: Actor): Snapshot {
    const state = this.repository.read();
    const tasks = state.tasks.filter((t) => canSeeTask(actor, t));
    const ids = new Set(tasks.map((t) => t.companyId));
    const workspace = workspaceForActor(
      workspaceOf(state, actor.tenantId),
      actor,
    );
    return {
      workspace,
      changeProposals: (state.changeProposals ?? []).filter(
        (p) =>
          p.tenantId === actor.tenantId &&
          (hasPermission(actor, "changes.manage") ||
            hasPermission(actor, "companies.manage")),
      ),
      now: this.clock(),
      persistence: "memory",
      actor: {
        ...structuredClone(actor),
        departments: [
          ...workspace.departments
            .filter((department) => actor.departments.includes(department.id))
            .map((department) => department.id),
          ...actor.departments.filter(
            (id) =>
              !workspace.departments.some((department) => department.id === id),
          ),
        ],
      },
      tasks,
      departmentFlows: (state.departmentFlows ?? []).filter(
        (flow) =>
          flow.tenantId === actor.tenantId &&
          (hasPermission(actor, "templates.view") ||
            hasPermission(actor, "companies.manage") ||
            hasPermission(actor, "processes.view")) &&
          flow.stages.every((stage) =>
            actor.departments.includes(stage.department),
          ),
      ),
      companyOnboardings: (state.companyOnboardings ?? []).filter(
        (onboarding) =>
          onboarding.tenantId === actor.tenantId &&
          (hasPermission(actor, "companies.view") ||
            hasPermission(actor, "processes.view") ||
            tasks.some((task) => task.onboardingId === onboarding.id)) &&
          onboarding.stages.every((stage) =>
            actor.departments.includes(stage.department),
          ),
      ),
      companies: state.companies
        .filter(
          (c) =>
            c.tenantId === actor.tenantId &&
            (actor.permissions === undefined ||
              hasPermission(actor, "companies.view") ||
              hasPermission(actor, "tasks.create") ||
              ids.has(c.id)) &&
            (actor.permissions !== undefined
              ? hasPermission(actor, "companies.view") ||
                hasPermission(actor, "tasks.create") ||
                ids.has(c.id)
              : actor.role !== "operator" ||
                c.ownerId === actor.userId ||
                ids.has(c.id)),
        )
        .map((company) => this.companyView(state, actor, company)),
      templates: state.templates.filter(
        (t) =>
          t.tenantId === actor.tenantId &&
          (actor.permissions === undefined ||
            hasPermission(actor, "templates.view") ||
            tasks.some((task) => task.templateId === t.id)) &&
          actor.departments.includes(t.department),
      ),
      users: state.users.filter(
        (u) =>
          u.tenantId === actor.tenantId &&
          (actor.permissions === undefined ||
            hasPermission(actor, "tasks.create") ||
            hasPermission(actor, "tasks.manage") ||
            hasPermission(actor, "tasks.assign") ||
            hasPermission(actor, "companies.manage") ||
            hasPermission(actor, "templates.manage") ||
            hasPermission(actor, "processes.manage") ||
            hasPermission(actor, "users.manage") ||
            u.userId === actor.userId ||
            tasks.some((t) => t.assigneeId === u.userId)) &&
          u.departments.some((d) => actor.departments.includes(d)),
      ),
      audit: state.audit.filter(
        (e) =>
          e.tenantId === actor.tenantId &&
          (actor.permissions === undefined ||
            hasPermission(actor, "settings.view") ||
            (e.taskId && tasks.some((t) => t.id === e.taskId)) ||
            e.actorId === actor.userId) &&
          (e.category !== "security" ||
            (hasPermission(actor, "settings.view") &&
              actor.permissions !== undefined) ||
            isManager(actor) ||
            e.actorId === actor.userId) &&
          (!e.department || actor.departments.includes(e.department)) &&
          (actor.permissions !== undefined
            ? hasPermission(actor, "settings.view") ||
              e.actorId === actor.userId ||
              (!!e.taskId && tasks.some((t) => t.id === e.taskId))
            : actor.role !== "operator" ||
              e.actorId === actor.userId ||
              tasks.some((t) => t.id === e.taskId)),
      ),
    };
  }
  report(actor: Actor, filters: ReportFilters) {
    return buildReport(this.snapshot(actor), actor, filters);
  }
  private getTask(
    state: PortalState,
    actor: Actor,
    id: string,
    expectedRevision: number,
  ): Task {
    const task = state.tasks.find((t) => t.id === id && canSeeTask(actor, t));
    if (!task)
      throw new DomainError(
        "NOT_FOUND",
        "Tarefa não encontrada neste escopo.",
        404,
      );
    if (task.revision !== expectedRevision)
      throw new DomainError(
        "CONFLICT",
        "Esta tarefa mudou. Atualize a lista antes de continuar.",
        409,
      );
    return task;
  }
  private writable(actor: Actor) {
    if (actor.permissions === undefined && actor.role === "viewer")
      throw new DomainError(
        "FORBIDDEN",
        "Seu perfil permite apenas consulta.",
        403,
      );
  }
  private requirePermission(
    actor: Actor,
    permission: Permission,
    legacyAllowed = true,
  ) {
    if (
      actor.permissions === undefined
        ? !legacyAllowed
        : !hasPermission(actor, permission)
    )
      throw new DomainError(
        "FORBIDDEN",
        "Seu acesso não permite esta ação.",
        403,
      );
  }
  private nextCompanyCode(state: PortalState, tenantId: string) {
    const codes = state.companies
      .filter((c) => c.tenantId === tenantId)
      .map((c) => Number(c.code))
      .filter(Number.isSafeInteger);
    return String(Math.max(100, ...codes) + 1).padStart(4, "0");
  }
  private checkReady(task: Task) {
    if (task.steps.some((s) => !s.completed))
      throw new DomainError(
        "MISSING_STEPS",
        "Conclua todas as etapas obrigatórias.",
      );
    const documents = latestDocuments(task.documents);
    if (
      task.evidenceRequired !== false &&
      !documents.some((document) => document.validation === "accepted")
    )
      throw new DomainError(
        "MISSING_DOCUMENT",
        "Anexe uma evidência válida antes de continuar.",
      );
    if (
      (task.requiredDocumentTypeIds ?? []).some(
        (typeId) =>
          !documents.some(
            (doc) =>
              doc.documentTypeId === typeId && doc.validation === "accepted",
          ),
      )
    )
      throw new DomainError(
        "MISSING_DOCUMENT_TYPE",
        "Anexe todos os tipos de documentos obrigatórios desta tarefa.",
      );
  }
  command(actor: Actor, id: string, command: TaskCommand): Task {
    this.requirePermission(
      actor,
      ["approve", "return"].includes(command.type)
        ? "tasks.review"
        : command.type === "retain_applicability"
          ? "tasks.manage"
          : ["assign", "dispense", "reopen", "cancel"].includes(command.type)
            ? (`tasks.${command.type}` as Permission)
            : "tasks.execute",
      command.type !== "retain_applicability",
    );
    this.writable(actor);
    const state = this.repository.read();
    const t = this.getTask(state, actor, id, command.expectedRevision);
    const before = this.auditState(t);
    if (
      t.applicabilityReview &&
      !["retain_applicability", "cancel", "assign"].includes(command.type)
    )
      throw new DomainError(
        "APPLICABILITY_REVIEW",
        "A alteração da empresa exige revisão do gestor antes de continuar esta tarefa.",
        409,
      );
    if (command.type === "reopen" && t.onboardingId) {
      const onboarding = (state.companyOnboardings ?? []).find(
        (item) => item.id === t.onboardingId,
      );
      if (
        onboarding &&
        (onboarding.status === "completed" ||
          onboarding.stages.some(
            (stage) =>
              stage.taskId !== t.id &&
              !!stage.taskId &&
              onboarding.stages.findIndex((item) => item.id === stage.id) >
                onboarding.stages.findIndex((item) => item.taskId === t.id),
          ))
      )
        throw new DomainError(
          "HANDOFF_LOCKED",
          "A etapa já foi entregue ao próximo setor. O histórico da implantação deve ser preservado.",
          409,
        );
    }
    const manager =
      isManager(actor) ||
      (actor.permissions !== undefined &&
        ["assign", "dispense", "reopen", "cancel"].includes(command.type) &&
        hasPermission(actor, `tasks.${command.type}` as Permission));
    const owner = t.assigneeId === actor.userId;
    const queue =
      t.assigneeId === `department:${t.department}` &&
      actor.departments.includes(t.department);
    const reviewAction =
      command.type === "approve" || command.type === "return";
    if (
      !manager &&
      !owner &&
      !reviewAction &&
      !(queue && command.type === "start")
    )
      throw new DomainError(
        "FORBIDDEN",
        "Você não é responsável por esta tarefa.",
        403,
      );
    let action = "";
    let detail = t.title;
    switch (command.type) {
      case "retain_applicability":
        if (!t.applicabilityReview || ["done", "dispensed"].includes(t.status))
          throw new DomainError(
            "INVALID_STATE",
            "Esta tarefa não aguarda revisão de aplicabilidade.",
          );
        delete t.applicabilityReview;
        action = "Aplicabilidade confirmada pelo gestor";
        detail = command.reason;
        break;
      case "start":
        if (
          queue &&
          ["in_progress", "waiting", "in_review"].includes(t.status)
        ) {
          // Claiming a transferred task must preserve its progress and review history.
          t.assigneeId = actor.userId;
          action = "Tarefa assumida da fila";
          detail = t.department;
          break;
        }
        if (!["todo", "returned"].includes(t.status))
          throw new DomainError(
            "INVALID_STATE",
            "Esta tarefa não pode ser iniciada neste estado.",
          );
        t.status = "in_progress";
        if (queue) {
          t.assigneeId = actor.userId;
          this.record(state, actor, "Tarefa assumida da fila", t.department, {
            task: t,
            before,
          });
        }
        t.executorId = actor.userId;
        t.executionActorIds = [
          ...new Set([...t.executionActorIds, actor.userId]),
        ];
        t.startedAt ??= this.clock();
        action = "Execução iniciada";
        break;
      case "step":
        if (t.status !== "in_progress")
          throw new DomainError(
            "INVALID_STATE",
            "Inicie a tarefa antes de marcar etapas.",
          );
        {
          const step = t.steps.find((s) => s.id === command.stepId);
          if (!step)
            throw new DomainError("INVALID_STEP", "Etapa não encontrada.");
          step.completed = command.completed;
          t.executorId = actor.userId;
          t.executionActorIds = [
            ...new Set([...t.executionActorIds, actor.userId]),
          ];
          action = command.completed ? "Etapa concluída" : "Etapa desmarcada";
          detail = step.title;
        }
        break;
      case "submit":
        if (t.status !== "in_progress" || !t.requiresReview)
          throw new DomainError(
            "INVALID_STATE",
            "Esta tarefa não está pronta para encaminhamento.",
          );
        this.checkReady(t);
        t.status = "in_review";
        action = "Encaminhada para conferência";
        break;
      case "complete":
        if (t.status !== "in_progress" || t.requiresReview)
          throw new DomainError(
            "REVIEW_REQUIRED",
            "Esta tarefa precisa de conferência antes da conclusão.",
          );
        this.checkReady(t);
        t.status = "done";
        t.completedAt = this.clock();
        t.originalCompletedAt ??= t.completedAt;
        action = "Tarefa concluída";
        break;
      case "approve":
        if (t.status !== "in_review")
          throw new DomainError(
            "INVALID_STATE",
            "A tarefa não está em conferência.",
          );
        if (t.executionActorIds.includes(actor.userId))
          throw new DomainError(
            "SELF_REVIEW",
            "A conferência deve ser feita por outra pessoa.",
            403,
          );
        this.checkReady(t);
        t.status = "done";
        t.completedAt = this.clock();
        t.originalCompletedAt ??= t.completedAt;
        action = "Conferência aprovada";
        break;
      case "return":
        if (t.status !== "in_review")
          throw new DomainError(
            "INVALID_STATE",
            "A tarefa não está em conferência.",
          );
        if (t.executionActorIds.includes(actor.userId))
          throw new DomainError(
            "SELF_REVIEW",
            "A conferência deve ser feita por outra pessoa.",
            403,
          );
        t.status = "returned";
        t.executionActorIds = [];
        t.executorId = undefined;
        t.steps = t.steps.map((s) => ({ ...s, completed: false }));
        t.reopenedCount++;
        action = "Devolvida para correção";
        detail = command.reason;
        break;
      case "wait":
        if (t.status !== "in_progress")
          throw new DomainError(
            "INVALID_STATE",
            "A tarefa precisa estar em andamento.",
          );
        t.status = "waiting";
        action = "Aguardando cliente";
        detail = command.reason;
        break;
      case "resume":
        if (t.status !== "waiting")
          throw new DomainError(
            "INVALID_STATE",
            "Esta tarefa não está aguardando cliente.",
          );
        t.status = "in_progress";
        action = "Execução retomada";
        break;
      case "request_dispense":
        if (["done", "dispensed"].includes(t.status) || t.dispenseRequested)
          throw new DomainError(
            "INVALID_STATE",
            "Não é possível solicitar dispensa agora.",
          );
        t.dispenseRequested = true;
        action = "Dispensa solicitada";
        detail = command.reason;
        break;
      case "dispense":
        if (!manager)
          throw new DomainError(
            "FORBIDDEN",
            "A dispensa exige coordenador ou administrador.",
            403,
          );
        if (["done", "dispensed"].includes(t.status))
          throw new DomainError("INVALID_STATE", "A tarefa já está encerrada.");
        if (
          t.onboardingId &&
          t.requiresReview &&
          t.executionActorIds.includes(actor.userId)
        )
          throw new DomainError(
            "SELF_REVIEW",
            "A dispensa desta etapa deve ser aprovada por outra pessoa.",
            403,
          );
        t.status = "dispensed";
        t.dispenseRequested = false;
        action = "Dispensa aprovada";
        detail = command.reason;
        break;
      case "cancel":
        if (!manager)
          throw new DomainError(
            "FORBIDDEN",
            "Seu acesso não permite cancelar tarefas.",
            403,
          );
        if (["done", "dispensed"].includes(t.status) || t.onboardingId)
          throw new DomainError(
            "INVALID_STATE",
            "Não é possível cancelar esta tarefa. Preserve o fluxo e o histórico.",
          );
        t.status = "dispensed";
        t.cancelled = true;
        delete t.applicabilityReview;
        t.dispenseRequested = false;
        action = "Tarefa cancelada";
        detail = command.reason;
        break;
      case "reopen":
        if (!manager)
          throw new DomainError(
            "FORBIDDEN",
            "A reabertura exige coordenador ou administrador.",
            403,
          );
        if (!["done", "dispensed"].includes(t.status))
          throw new DomainError(
            "INVALID_STATE",
            "A tarefa precisa estar encerrada.",
          );
        t.status = "in_progress";
        t.executionActorIds = [];
        delete t.cancelled;
        t.executorId = undefined;
        t.completedAt = undefined;
        t.steps = t.steps.map((s) => ({ ...s, completed: false }));
        t.reopenedCount++;
        action = "Tarefa reaberta";
        detail = command.reason;
        break;
      case "assign":
        if (!manager)
          throw new DomainError(
            "FORBIDDEN",
            "A redistribuição exige coordenador ou administrador.",
            403,
          );
        {
          const user = state.users.find(
            (u) =>
              u.userId === command.assigneeId &&
              u.tenantId === actor.tenantId &&
              u.active !== false &&
              u.departments.includes(t.department) &&
              (!t.onboardingId || hasPermission(u, "tasks.view")) &&
              canExecute(u),
          );
          if (!user)
            throw new DomainError(
              "INVALID_ASSIGNEE",
              "Responsável indisponível neste departamento.",
            );
          t.assigneeId = user.userId;
          if (t.onboardingId) {
            const onboarding = state.companyOnboardings?.find(
              (item) =>
                item.tenantId === actor.tenantId && item.id === t.onboardingId,
            );
            const stage = onboarding?.stages.find(
              (item) => item.taskId === t.id,
            );
            if (onboarding && stage) {
              stage.assigneeId = user.userId;
              onboarding.revision++;
            }
          }
          action = "Responsável alterado";
          detail = user.name;
        }
        break;
    }
    if (queue && command.type === "start" && t.onboardingId) {
      const onboarding = state.companyOnboardings?.find(
        (item) =>
          item.tenantId === actor.tenantId && item.id === t.onboardingId,
      );
      const stage = onboarding?.stages.find((item) => item.taskId === t.id);
      if (onboarding && stage) {
        stage.assigneeId = actor.userId;
        onboarding.revision++;
      }
    }
    t.revision++;
    this.record(state, actor, action, detail, { task: t, before });
    if (t.onboardingId && ["done", "dispensed"].includes(t.status))
      this.advanceOnboarding(state, actor, t);
    this.repository.replace(state);
    return structuredClone(t);
  }
  attach(
    actor: Actor,
    id: string,
    revision: number,
    evidence: UploadEvidence,
  ): Task {
    this.requirePermission(actor, "tasks.attach");
    this.writable(actor);
    const state = this.repository.read();
    const t = this.getTask(state, actor, id, revision);
    const before = this.auditState(t);
    if (t.assigneeId !== actor.userId && !isManager(actor))
      throw new DomainError(
        "FORBIDDEN",
        "Você não é responsável por esta tarefa.",
        403,
      );
    if (t.status !== "in_progress")
      throw new DomainError(
        "INVALID_STATE",
        "Só é possível anexar durante a execução.",
      );
    const doc: DocumentVersion = {
      ...evidence,
      id: this.id("doc"),
      version: t.documents.length + 1,
      validation: "accepted",
      authorId: actor.userId,
      createdAt: this.clock(),
    };
    if (evidence.logicalId) {
      const previous = t.documents.find(
        (d) => (d.logicalId ?? d.id) === evidence.logicalId,
      );
      if (!previous)
        throw new DomainError(
          "INVALID_DOCUMENT",
          "Documento original não encontrado nesta tarefa.",
        );
      if (
        evidence.documentTypeId &&
        evidence.documentTypeId !== previous.documentTypeId
      )
        throw new DomainError(
          "INVALID_DOCUMENT",
          "A nova versão deve preservar o tipo do documento.",
        );
      doc.documentTypeId = previous.documentTypeId;
      doc.logicalId = evidence.logicalId;
      doc.logicalVersion =
        Math.max(
          ...t.documents
            .filter((d) => (d.logicalId ?? d.id) === evidence.logicalId)
            .map((d) => d.logicalVersion ?? 1),
        ) + 1;
    } else {
      doc.logicalId = doc.id;
      doc.logicalVersion = 1;
    }
    if (doc.documentTypeId) {
      const type = workspaceOf(state, actor.tenantId).documentTypes.find(
        (item) => item.id === doc.documentTypeId,
      );
      if (!type || !type.formats.includes(doc.kind))
        throw new DomainError(
          "INVALID_DOCUMENT_TYPE",
          "Tipo documental ou formato indisponível.",
        );
    }
    t.executionActorIds = [...new Set([...t.executionActorIds, actor.userId])];
    t.executorId = actor.userId;
    t.documents.push(doc);
    t.revision++;
    this.record(
      state,
      actor,
      "Evidência anexada",
      `${evidence.name} · versão ${doc.version}`,
      { task: t, before },
    );
    this.repository.replace(state);
    return structuredClone(t);
  }
  addTaskComment(actor: Actor, id: string, input: AddTaskComment): Task {
    this.requirePermission(actor, "tasks.comment", false);
    const body = taskCommentSchema.safeParse(input);
    if (!body.success)
      throw new DomainError(
        "INVALID_COMMENT",
        body.error.issues[0]?.message ?? "Informe um comentário válido.",
      );
    const state = this.repository.read();
    const task = this.getTask(state, actor, id, body.data.expectedRevision);
    const before = this.auditState(task);
    (task.comments ??= []).push({
      id: this.id("comment"),
      authorId: actor.userId,
      authorName: actor.name,
      text: body.data.text,
      at: this.clock(),
    });
    task.revision++;
    this.record(
      state,
      actor,
      "Comentário adicionado",
      "Comunicação interna registrada na tarefa.",
      { task, before },
    );
    this.repository.replace(state);
    return structuredClone(task);
  }
  updateWorkspaceSettings(
    actor: Actor,
    input: UpdateWorkspaceSettings,
  ): WorkspaceSettings {
    const parsed = updateWorkspaceSettingsSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_SETTINGS",
        parsed.error.issues[0]?.message ?? "Configuração inválida.",
      );
    const state = this.repository.read();
    const current = workspaceSettingsSchema.parse(
      workspaceOf(state, actor.tenantId),
    );
    const body = { ...current, ...parsed.data };
    if (current.revision !== body.expectedRevision)
      throw new DomainError(
        "CONFLICT",
        "As configurações mudaram. Atualize antes de salvar.",
        409,
      );
    const changed = (
      key:
        | "departments"
        | "accessProfiles"
        | "documentTypes"
        | "documentRules"
        | "companyStatuses",
    ) => JSON.stringify(current[key] ?? []) !== JSON.stringify(body[key] ?? []);
    if (changed("companyStatuses")) {
      this.requirePermission(actor, "companies.manage", false);
      const kept = new Set((body.companyStatuses ?? []).map((item) => item.id));
      const inUse = state.companies.filter(
        (company) =>
          company.tenantId === actor.tenantId &&
          (company.operationalHistory ?? [])
            .map((change) => change.status)
            .concat(company.status)
            .some((status) => !!status?.includes(":") && !kept.has(status)),
      );
      if (inUse.length)
        throw new DomainError(
          "STATUS_IN_USE",
          `Situação em uso por ${inUse.length} ${inUse.length === 1 ? "empresa" : "empresas"}. Altere as empresas antes de removê-la.`,
          409,
        );
      const pending = (state.changeProposals ?? []).filter(
        (proposal) =>
          proposal.tenantId === actor.tenantId &&
          proposal.status === "pending" &&
          !!proposal.patch.status?.includes(":") &&
          !kept.has(proposal.patch.status),
      );
      if (pending.length)
        throw new DomainError(
          "STATUS_IN_USE",
          `Situação usada em ${pending.length} ${pending.length === 1 ? "proposta pendente" : "propostas pendentes"} na Central do gestor. Decida as propostas antes de removê-la.`,
          409,
        );
    }
    if (changed("departments") || changed("accessProfiles"))
      this.requirePermission(actor, "users.manage", false);
    if (changed("documentTypes") || changed("documentRules"))
      this.requirePermission(actor, "documents.manage", false);
    if (
      ![
        "departments",
        "accessProfiles",
        "documentTypes",
        "documentRules",
        "companyStatuses",
      ].some((key) => changed(key as "departments"))
    ) {
      if (
        !hasPermission(actor, "users.manage") &&
        !hasPermission(actor, "documents.manage")
      )
        throw new DomainError(
          "FORBIDDEN",
          "Seu acesso não permite editar configurações.",
          403,
        );
      return workspaceForActor(current, actor);
    }
    const departments = new Set(body.departments.map((d) => d.id));
    for (const department of body.departments) {
      const positions = new Set(
        (department.positions ?? []).map((position) => position.id),
      );
      const members = new Map(
        (department.members ?? []).map((member) => [member.userId, member]),
      );
      for (const member of members.values()) {
        if (
          !positions.has(member.positionId) ||
          !state.users.some(
            (user) =>
              user.tenantId === actor.tenantId && user.userId === member.userId,
          )
        )
          throw new DomainError(
            "INVALID_DEPARTMENT_MEMBER",
            "Vincule pessoas deste grupo a cargos existentes no departamento.",
          );
        if (member.reportsTo && !members.has(member.reportsTo))
          throw new DomainError(
            "INVALID_DEPARTMENT_LEADER",
            "A liderança deve fazer parte do mesmo departamento.",
          );
        const visited = new Set<string>();
        let cursor: typeof member | undefined = member;
        while (cursor) {
          if (visited.has(cursor.userId))
            throw new DomainError(
              "DEPARTMENT_CYCLE",
              "A organização do departamento não pode formar um ciclo de liderança.",
            );
          visited.add(cursor.userId);
          cursor = cursor.reportsTo ? members.get(cursor.reportsTo) : undefined;
        }
      }
    }
    const usedDepartments = [
      ...state.users
        .filter((u) => u.tenantId === actor.tenantId)
        .flatMap((u) => u.departments),
      ...state.templates
        .filter((t) => t.tenantId === actor.tenantId)
        .map((t) => t.department),
      ...state.tasks
        .filter((t) => t.tenantId === actor.tenantId)
        .map((t) => t.department),
      ...(state.departmentFlows ?? [])
        .filter((f) => f.tenantId === actor.tenantId)
        .flatMap((f) => f.stages.map((s) => s.department)),
      ...state.companies
        .filter((c) => c.tenantId === actor.tenantId)
        .flatMap((c) => Object.keys(c.responsibilities ?? {})),
      ...current.departments
        .filter((department) => department.members?.length)
        .map((department) => department.id),
    ];
    if (usedDepartments.some((d) => !departments.has(d)))
      throw new DomainError(
        "DEPARTMENT_IN_USE",
        "Desative departamentos em uso em vez de removê-los, preservando o histórico.",
      );
    for (const profile of body.accessProfiles) {
      if (profile.departments.some((d) => !departments.has(d)))
        throw new DomainError(
          "INVALID_DEPARTMENT",
          "O modelo de acesso contém departamento indisponível.",
        );
      for (const permission of profile.permissions) {
        const dependency =
          permission.startsWith("tasks.") && permission !== "tasks.view"
            ? "tasks.view"
            : permission === "reports.performance.view"
              ? "reports.view"
              : permission === "documents.manage"
                ? "documents.view"
                : permission === "processes.manage"
                  ? "processes.view"
                  : permission === "companies.manage"
                    ? "companies.view"
                    : permission === "templates.manage"
                      ? "templates.view"
                      : permission.startsWith("tv.") && permission !== "tv.view"
                        ? "tv.view"
                        : undefined;
        if (dependency && !profile.permissions.includes(dependency))
          throw new DomainError(
            "INVALID_PERMISSIONS",
            "Habilite a aba antes de suas ações no modelo de acesso.",
          );
      }
    }
    if (
      body.accessProfiles.some(
        (profile) =>
          profile.permissions.includes("overview.view") &&
          !profile.permissions.includes("tasks.view"),
      )
    )
      throw new DomainError(
        "INVALID_PERMISSIONS",
        "A visão geral exige consulta das tarefas para abrir os indicadores.",
      );
    const typeIds = new Set(body.documentTypes.map((t) => t.id));
    if (
      state.tasks.some(
        (t) =>
          t.tenantId === actor.tenantId &&
          (t.requiredDocumentTypeIds ?? []).some((id) => !typeIds.has(id)),
      ) ||
      state.tasks
        .filter((t) => t.tenantId === actor.tenantId)
        .flatMap((t) => t.documents)
        .some((d) => d.documentTypeId && !typeIds.has(d.documentTypeId))
    )
      throw new DomainError(
        "DOCUMENT_TYPE_IN_USE",
        "Preserve os tipos documentais já vinculados a evidências.",
      );
    for (const rule of body.documentRules) {
      if (
        rule.documentTypeIds.some((id) => !typeIds.has(id)) ||
        rule.templateIds.some(
          (id) =>
            !state.templates.some(
              (t) => t.tenantId === actor.tenantId && t.id === id,
            ),
        )
      )
        throw new DomainError(
          "INVALID_DOCUMENT_RULE",
          "A regra referencia tipo ou obrigação fora deste grupo.",
        );
    }
    const result: WorkspaceSettings = {
      ...body,
      id: "settings",
      tenantId: actor.tenantId,
      revision: current.revision + 1,
    };
    delete (result as WorkspaceSettings & { expectedRevision?: number })
      .expectedRevision;
    state.workspaces = [
      ...(state.workspaces ?? []).filter((w) => w.tenantId !== actor.tenantId),
      result,
    ];
    this.record(
      state,
      actor,
      "Configuração do grupo atualizada",
      `Versão ${result.revision} · ${body.departments.length} departamentos · ${body.accessProfiles.length} modelos de acesso · ${body.documentRules.length} regras documentais`,
    );
    this.repository.replace(state);
    return workspaceForActor(result, actor);
  }
  private validateResponsibilities(
    state: PortalState,
    actor: Actor,
    responsibilities?: Record<Department, CompanyResponsibility>,
  ) {
    if (!responsibilities) return;
    const workspace = workspaceOf(state, actor.tenantId);
    for (const [department, responsibility] of Object.entries(
      responsibilities,
    )) {
      if (
        !actor.departments.includes(department) ||
        !workspace.departments.some((d) => d.id === department && d.active)
      )
        throw new DomainError(
          "FORBIDDEN",
          "Responsabilidade inclui departamento fora do seu acesso.",
          403,
        );
      if (
        responsibility.mode === "person" &&
        !state.users.some(
          (u) =>
            u.tenantId === actor.tenantId &&
            u.userId === responsibility.userId &&
            u.active !== false &&
            u.departments.includes(department) &&
            canExecute(u) &&
            hasPermission(u, "tasks.view"),
        )
      )
        throw new DomainError(
          "INVALID_ASSIGNEE",
          `Selecione uma pessoa ativa com execução em ${department}.`,
        );
    }
  }
  /**
   * A company as this actor may see it, projected to the current competence.
   * Steps customized for templates outside the actor's departments stay out.
   */
  private companyView(state: PortalState, actor: Actor, company: Company) {
    const result = companyAtCompetence(
      company,
      businessDate(this.clock()).slice(0, 7),
    );
    if (result.workflowOverrides) {
      const visible = new Set(
        state.templates
          .filter(
            (template) =>
              template.tenantId === actor.tenantId &&
              actor.departments.includes(template.department),
          )
          .map((template) => template.id),
      );
      const kept = Object.entries(result.workflowOverrides).filter(([id]) =>
        visible.has(id),
      );
      if (kept.length) result.workflowOverrides = Object.fromEntries(kept);
      else delete result.workflowOverrides;
    }
    return result;
  }
  private companyForWrite(
    state: PortalState,
    actor: Actor,
    id: string,
    revision: number,
  ) {
    const company = state.companies.find(
      (c) => c.id === id && c.tenantId === actor.tenantId,
    );
    if (!company)
      throw new DomainError(
        "NOT_FOUND",
        "Empresa não encontrada neste grupo.",
        404,
      );
    if ((company.revision ?? 1) !== revision)
      throw new DomainError(
        "CONFLICT",
        "A empresa mudou. Reabra o cadastro atualizado.",
        409,
      );
    return company;
  }
  updateCompany(actor: Actor, id: string, input: UpdateCompany): Company {
    this.requirePermission(actor, "companies.manage", false);
    const parsed = updateCompanySchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_COMPANY",
        parsed.error.issues[0]?.message ?? "Cadastro inválido.",
      );
    const state = this.repository.read();
    const company = this.companyForWrite(
      state,
      actor,
      id,
      parsed.data.expectedRevision,
    );
    const {
      expectedRevision: _expected,
      reason: _reason,
      ...patch
    } = parsed.data;
    void _expected;
    void _reason;
    if (
      patch.code &&
      state.companies.some(
        (c) =>
          c.tenantId === actor.tenantId && c.id !== id && c.code === patch.code,
      )
    )
      throw new DomainError(
        "DUPLICATE_CODE",
        "Este código já está em uso neste grupo.",
        409,
      );
    Object.assign(company, patch, { revision: (company.revision ?? 1) + 1 });
    this.record(
      state,
      actor,
      "Cadastro da empresa atualizado",
      `${company.code} · ${company.name}`,
      { companyId: id },
    );
    this.repository.replace(state);
    return this.companyView(state, actor, company);
  }
  transferCompanies(
    actor: Actor,
    input: TransferCompanies,
  ): { companies: number; tasks: number } {
    this.requirePermission(actor, "companies.manage", false);
    if (input.transferOpenTasks)
      this.requirePermission(actor, "tasks.assign", false);
    const parsed = transferCompaniesSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_TRANSFER",
        parsed.error.issues[0]?.message ?? "Transferência inválida.",
      );
    const body = parsed.data;
    const state = this.repository.read();
    this.validateResponsibilities(state, actor, {
      [body.department]: body.target,
    });
    if (
      Object.keys(body.expectedRevisions).length !== body.companyIds.length ||
      body.companyIds.some((id) => !body.expectedRevisions[id])
    )
      throw new DomainError(
        "INVALID_TRANSFER",
        "Informe a revisão de todas as empresas selecionadas.",
      );
    let tasks = 0;
    for (const id of body.companyIds) {
      const company = this.companyForWrite(
        state,
        actor,
        id,
        body.expectedRevisions[id]!,
      );
      const responsibilities = {
        ...(companyAtCompetence(company, businessDate(this.clock()).slice(0, 7))
          .responsibilities ?? {}),
        [body.department]: body.target,
      };
      (company.operationalHistory ??= []).push({
        responsibilities,
        effectiveCompetence: businessDate(this.clock()).slice(0, 7),
        proposalId: this.id("transfer"),
      });
      company.revision = (company.revision ?? 1) + 1;
      if (body.transferOpenTasks && body.target.mode !== "none")
        for (const task of state.tasks.filter(
          (t) =>
            t.tenantId === actor.tenantId &&
            t.companyId === id &&
            t.department === body.department &&
            !["done", "dispensed"].includes(t.status) &&
            !t.onboardingId,
        )) {
          const before = this.auditState(task);
          task.assigneeId =
            body.target.mode === "person"
              ? body.target.userId!
              : `department:${body.department}`;
          task.revision++;
          this.record(
            state,
            actor,
            "Responsável alterado em lote",
            `Carteira ${company.code}`,
            { task, before },
          );
          tasks++;
        }
      this.record(
        state,
        actor,
        "Carteira transferida em lote",
        `${body.department} · ${body.target.mode === "person" ? body.target.userId : body.target.mode}`,
        { companyId: id, department: body.department },
      );
    }
    this.repository.replace(state);
    return { companies: body.companyIds.length, tasks };
  }
  private proposalImpact(
    state: PortalState,
    actor: Actor,
    company: Company,
    proposal: Pick<
      CompanyChangeProposal,
      "patch" | "effectiveCompetence" | "transferOpenTasks"
    >,
  ) {
    const tasks = state.tasks.filter(
      (t) =>
        t.tenantId === actor.tenantId &&
        t.companyId === company.id &&
        t.competence >= proposal.effectiveCompetence &&
        !t.onboardingId,
    );
    if (tasks.some((t) => !actor.departments.includes(t.department)))
      throw new DomainError(
        "FORBIDDEN",
        "A revisão exige acesso aos departamentos afetados.",
        403,
      );
    const projected = companyAtCompetence(
      {
        ...company,
        operationalHistory: [
          ...(company.operationalHistory ?? []),
          {
            ...proposal.patch,
            effectiveCompetence: proposal.effectiveCompetence,
            proposalId: "preview",
          },
        ],
      },
      proposal.effectiveCompetence,
    );
    const applicable = (template: TaskTemplate) =>
      companyServes(projected, proposal.effectiveCompetence) &&
      template.active &&
      (template.regime === "Todos" || template.regime === projected.regime) &&
      projected.responsibilities?.[template.department]?.mode !== "none";
    const models = state.templates.filter(
      (t) =>
        t.tenantId === actor.tenantId &&
        actor.departments.includes(t.department) &&
        applicable(t),
    );
    const stale = tasks.filter(
      (t) =>
        !["done", "dispensed"].includes(t.status) &&
        t.templateId !== "avulsa" &&
        !models.some((m) => m.id === t.templateId),
    );
    const transfer = proposal.transferOpenTasks
      ? tasks.filter(
          (t) =>
            !["done", "dispensed"].includes(t.status) &&
            proposal.patch.responsibilities?.[t.department] &&
            proposal.patch.responsibilities[t.department]!.mode !== "none",
        ).length
      : 0;
    return {
      create: models.filter(
        (m) =>
          !tasks.some(
            (t) =>
              t.templateId === m.id &&
              t.competence === proposal.effectiveCompetence,
          ),
      ).length,
      retain: tasks.length - stale.length,
      review: stale.length,
      transfer,
      taskIds: tasks.map((t) => t.id),
    };
  }
  proposeCompanyChange(
    actor: Actor,
    input: ProposeCompanyChange,
  ): CompanyChangeProposal {
    this.requirePermission(actor, "companies.manage", false);
    const parsed = proposeCompanyChangeSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_CHANGE",
        parsed.error.issues[0]?.message ?? "Alteração inválida.",
      );
    const state = this.repository.read();
    const company = this.companyForWrite(
      state,
      actor,
      input.companyId,
      input.expectedRevision,
    );
    if (
      !isKnownCompanyStatus(
        parsed.data.patch.status,
        workspaceOf(state, actor.tenantId),
      )
    )
      throw new DomainError(
        "INVALID_STATUS",
        "Situação não cadastrada neste grupo.",
      );
    this.validateResponsibilities(
      state,
      actor,
      parsed.data.patch.responsibilities,
    );
    if (
      parsed.data.patch.serviceEndCompetence &&
      parsed.data.patch.serviceEndCompetence < parsed.data.effectiveCompetence
    )
      throw new DomainError(
        "INVALID_PERIOD",
        "A competência final não pode anteceder a vigência desta alteração.",
      );
    const proposal: CompanyChangeProposal = {
      id: this.id("change"),
      tenantId: actor.tenantId,
      companyId: company.id,
      expectedCompanyRevision: company.revision ?? 1,
      revision: 1,
      status: "pending",
      patch: parsed.data.patch,
      effectiveCompetence: parsed.data.effectiveCompetence,
      transferOpenTasks: parsed.data.transferOpenTasks,
      reason: parsed.data.reason,
      createdAt: this.clock(),
      createdBy: actor.userId,
      impact: this.proposalImpact(state, actor, company, parsed.data),
    };
    (state.changeProposals ??= []).push(proposal);
    this.record(
      state,
      actor,
      "Alteração da empresa proposta",
      `${proposal.reason} · vigência ${proposal.effectiveCompetence}`,
      { companyId: company.id },
    );
    this.repository.replace(state);
    return structuredClone(proposal);
  }
  proposeCompanyChanges(actor: Actor, inputs: ProposeCompanyChange[]) {
    this.requirePermission(actor, "companies.manage", false);
    if (
      !inputs.length ||
      inputs.length > 200 ||
      new Set(inputs.map((input) => input.companyId)).size !== inputs.length
    )
      throw new DomainError(
        "INVALID_IMPORT",
        "Selecione até 200 empresas distintas.",
      );
    const staging = new MemoryRepository(this.repository.read());
    const engine = new PortalEngine(staging, this.clock, () =>
      this.id("batch"),
    );
    const proposals = inputs.map((input) =>
      engine.proposeCompanyChange(actor, input),
    );
    this.repository.replace(staging.read());
    return proposals;
  }
  decideChangeProposal(
    actor: Actor,
    id: string,
    input: DecideChangeProposal,
  ): CompanyChangeProposal {
    this.requirePermission(actor, "changes.manage", false);
    const parsed = decideChangeProposalSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError("INVALID_CHANGE", "Decisão inválida.");
    const state = this.repository.read();
    const proposal = (state.changeProposals ?? []).find(
      (p) => p.id === id && p.tenantId === actor.tenantId,
    );
    if (!proposal)
      throw new DomainError(
        "NOT_FOUND",
        "Proposta não encontrada neste grupo.",
        404,
      );
    if (
      proposal.revision !== input.expectedRevision ||
      proposal.status !== "pending"
    )
      throw new DomainError(
        "CONFLICT",
        "A proposta já mudou. Atualize a central.",
        409,
      );
    const company =
      input.decision === "approve"
        ? this.companyForWrite(
            state,
            actor,
            proposal.companyId,
            proposal.expectedCompanyRevision,
          )
        : state.companies.find(
            (item) =>
              item.id === proposal.companyId &&
              item.tenantId === actor.tenantId,
          );
    if (!company)
      throw new DomainError(
        "NOT_FOUND",
        "Empresa não encontrada neste grupo.",
        404,
      );
    if (input.decision === "approve") {
      if (
        !isKnownCompanyStatus(
          proposal.patch.status,
          workspaceOf(state, actor.tenantId),
        )
      )
        throw new DomainError(
          "INVALID_STATUS",
          "A situação desta proposta não está mais cadastrada. Rejeite a proposta ou cadastre a situação de novo.",
          409,
        );
      this.validateResponsibilities(
        state,
        actor,
        proposal.patch.responsibilities,
      );
      if (proposal.transferOpenTasks)
        this.requirePermission(actor, "tasks.assign", false);
      proposal.impact = this.proposalImpact(state, actor, company, proposal);
      (company.operationalHistory ??= []).push({
        ...proposal.patch,
        effectiveCompetence: proposal.effectiveCompetence,
        proposalId: proposal.id,
      });
      company.revision = (company.revision ?? 1) + 1;
      for (const task of state.tasks.filter(
        (t) =>
          t.tenantId === actor.tenantId &&
          t.companyId === company.id &&
          t.competence >= proposal.effectiveCompetence &&
          !t.onboardingId &&
          !["done", "dispensed"].includes(t.status),
      )) {
        const projected = companyAtCompetence(company, task.competence);
        const before = this.auditState(task);
        const model = state.templates.find(
          (m) => m.id === task.templateId && m.tenantId === actor.tenantId,
        );
        const valid =
          companyServes(projected, task.competence) &&
          (!model ||
            model.regime === "Todos" ||
            model.regime === projected.regime) &&
          projected.responsibilities?.[task.department]?.mode !== "none";
        if (!valid) {
          task.applicabilityReview = {
            proposalId: proposal.id,
            reason: proposal.reason,
          };
          task.revision++;
        }
        const responsibility =
          proposal.patch.responsibilities?.[task.department];
        if (
          proposal.transferOpenTasks &&
          responsibility &&
          responsibility.mode !== "none"
        ) {
          task.assigneeId =
            responsibility.mode === "person"
              ? responsibility.userId!
              : `department:${task.department}`;
          task.revision++;
        }
        if (task.revision !== before.revision)
          this.record(
            state,
            actor,
            "Impacto da alteração aplicado",
            valid
              ? "Responsabilidade atualizada; execução e documentos preservados."
              : "Revisão de aplicabilidade necessária; histórico preservado.",
            { task, before },
          );
      }
      // Generate only the affected competence. Existing task keys remain untouched.
      for (const department of actor.departments)
        this.generateInState(
          state,
          actor,
          proposal.effectiveCompetence,
          department,
          company.id,
        );
      proposal.status = "approved";
    } else proposal.status = "rejected";
    proposal.revision++;
    proposal.decidedAt = this.clock();
    proposal.decidedBy = actor.userId;
    this.record(
      state,
      actor,
      input.decision === "approve"
        ? "Alteração da empresa aprovada"
        : "Alteração da empresa rejeitada",
      `${proposal.reason} · vigência ${proposal.effectiveCompetence}`,
      { companyId: company.id },
    );
    this.repository.replace(state);
    return structuredClone(proposal);
  }
  addCompany(actor: Actor, input: CreateCompany) {
    this.requirePermission(actor, "companies.manage", isManager(actor));
    const parsed = companySchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_COMPANY",
        parsed.error.issues[0]?.message ?? "Informe uma empresa válida.",
      );
    const { onboarding, ...body } = parsed.data;
    input = body;
    const state = this.repository.read();
    this.validateResponsibilities(state, actor, input.responsibilities);
    if (
      input.code &&
      state.companies.some(
        (c) => c.tenantId === actor.tenantId && c.code === input.code,
      )
    )
      throw new DomainError(
        "DUPLICATE_CODE",
        "Este código já está em uso neste grupo.",
        409,
      );
    if (
      state.companies.some(
        (c) => c.tenantId === actor.tenantId && c.cnpj === input.cnpj,
      )
    )
      throw new DomainError("DUPLICATE", "Este CNPJ já está cadastrado.", 409);
    if (!isKnownCompanyStatus(body.status, workspaceOf(state, actor.tenantId)))
      throw new DomainError(
        "INVALID_STATUS",
        "Situação não cadastrada neste grupo.",
      );
    if (
      !state.users.some(
        (u) =>
          u.userId === input.ownerId &&
          u.tenantId === actor.tenantId &&
          u.active !== false &&
          (!!input.responsibilities || canExecute(u)) &&
          u.departments.some((d) => actor.departments.includes(d)),
      )
    )
      throw new DomainError("INVALID_ASSIGNEE", "Responsável indisponível.");
    const company = {
      ...body,
      id: this.id("company"),
      tenantId: actor.tenantId,
      code: body.code ?? this.nextCompanyCode(state, actor.tenantId),
      status: body.status ?? "active",
      active: companyStatusGeneratesTasks(body.status),
      revision: 1,
      startDate: businessDate(this.clock()),
      createdAt: this.clock(),
    };
    state.companies.push(company);
    if (onboarding)
      this.startOnboardingInState(state, actor, {
        ...onboarding,
        companyId: company.id,
      });
    this.record(state, actor, "Empresa cadastrada", company.name, {
      companyId: company.id,
    });
    this.repository.replace(state);
    return company;
  }
  addTemplate(actor: Actor, input: CreateTemplate) {
    this.requirePermission(actor, "templates.manage", isManager(actor));
    const result = templateSchema.safeParse(input);
    if (!result.success)
      throw new DomainError(
        "INVALID_TEMPLATE",
        result.error.issues[0]?.message ?? "Informe um modelo válido.",
      );
    const body = result.data;
    if (!actor.departments.includes(body.department))
      throw new DomainError(
        "FORBIDDEN",
        "Seu perfil não pode criar modelos neste departamento.",
        403,
      );
    const state = this.repository.read();
    const template: TaskTemplate = {
      ...body,
      workflowSteps: getTemplateWorkflow(body),
      tenantId: actor.tenantId,
      id: this.id("template"),
      periodicity: "Mensal" as const,
      version: 1,
      active: true,
    };
    state.templates.push(template);
    this.record(state, actor, "Modelo cadastrado", template.title, {
      department: body.department,
      templateId: template.id,
      afterTemplate: structuredClone(template),
    });
    this.repository.replace(state);
    return structuredClone(template);
  }
  // Company-specific steps for one template. Only future generated tasks use them.
  setCompanyWorkflow(actor: Actor, input: CompanyWorkflowInput) {
    this.requirePermission(actor, "templates.manage", isManager(actor));
    const parsed = companyWorkflowSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_WORKFLOW",
        parsed.error.issues[0]?.message ?? "Etapas inválidas.",
      );
    const body = parsed.data;
    const state = this.repository.read();
    const template = state.templates.find(
      (model) =>
        model.id === body.templateId &&
        model.tenantId === actor.tenantId &&
        actor.departments.includes(model.department),
    );
    if (!template)
      throw new DomainError(
        "NOT_FOUND",
        "Modelo não encontrado neste escopo.",
        404,
      );
    const company = state.companies.find(
      (item) => item.id === body.companyId && item.tenantId === actor.tenantId,
    );
    if (!company)
      throw new DomainError("NOT_FOUND", "Empresa não encontrada.", 404);
    if ((company.revision ?? 1) !== body.expectedRevision)
      throw new DomainError(
        "CONFLICT",
        "Esta empresa mudou. Atualize a tela antes de continuar.",
        409,
      );
    if (
      body.action !== "reset" &&
      body.expectedTemplateVersion !== template.version
    )
      throw new DomainError(
        "TEMPLATE_CHANGED",
        `O modelo geral mudou para a v${template.version} enquanto você revisava. Confira as etapas e salve de novo.`,
        409,
      );
    const overrides = { ...(company.workflowOverrides ?? {}) };
    const existing = overrides[template.id];
    if (body.action !== "save" && !existing)
      throw new DomainError(
        "NOT_FOUND",
        "Esta empresa não tem etapas personalizadas neste modelo.",
        404,
      );
    let detail: string;
    if (body.action === "reset") {
      delete overrides[template.id];
      detail = `${company.name} · ${template.title} volta a seguir o modelo geral`;
    } else if (body.action === "acknowledge") {
      overrides[template.id] = {
        ...existing!,
        baseVersion: template.version,
        updatedAt: this.clock(),
        updatedBy: actor.userId,
      };
      detail = `${company.name} · ${template.title} mantém a versão própria após o modelo geral v${template.version}`;
    } else {
      overrides[template.id] = {
        steps: body.workflowSteps!.map((step) => ({ ...step })),
        baseVersion: template.version,
        updatedAt: this.clock(),
        updatedBy: actor.userId,
      };
      detail = `${company.name} · ${template.title} · ${body.workflowSteps!.length} etapas próprias`;
    }
    if (Object.keys(overrides).length) company.workflowOverrides = overrides;
    else delete company.workflowOverrides;
    company.revision = (company.revision ?? 1) + 1;
    this.record(state, actor, "Etapas da empresa atualizadas", detail, {
      department: template.department,
      companyId: company.id,
      templateId: template.id,
    });
    this.repository.replace(state);
    return this.companyView(state, actor, company);
  }
  updateTemplate(actor: Actor, id: string, input: UpdateTemplate) {
    this.requirePermission(actor, "templates.manage", isManager(actor));
    const result = updateTemplateSchema.safeParse(input);
    if (!result.success)
      throw new DomainError(
        "INVALID_TEMPLATE",
        result.error.issues[0]?.message ?? "Informe um modelo válido.",
      );
    const state = this.repository.read();
    const template = state.templates.find(
      (model) =>
        model.id === id &&
        model.tenantId === actor.tenantId &&
        actor.departments.includes(model.department),
    );
    if (!template)
      throw new DomainError(
        "NOT_FOUND",
        "Modelo não encontrado neste escopo.",
        404,
      );
    const { expectedVersion, ...body } = result.data;
    if (body.department !== template.department)
      throw new DomainError(
        "INVALID_DEPARTMENT",
        "O departamento de um modelo existente não pode ser alterado.",
      );
    if (template.version !== expectedVersion)
      throw new DomainError(
        "CONFLICT",
        "Este modelo mudou. Atualize a lista antes de continuar.",
        409,
      );
    const before = structuredClone(template);
    Object.assign(template, body, { version: template.version + 1 });
    this.record(
      state,
      actor,
      "Modelo atualizado",
      `${template.title} · versão ${before.version} → ${template.version}`,
      {
        department: template.department,
        templateId: template.id,
        beforeTemplate: before,
        afterTemplate: structuredClone(template),
      },
    );
    this.repository.replace(state);
    return structuredClone(template);
  }
  createDepartmentFlow(actor: Actor, input: CreateDepartmentFlow) {
    if (!hasPermission(actor, "templates.manage"))
      this.requirePermission(actor, "processes.manage", false);
    const parsed = createDepartmentFlowSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_FLOW",
        parsed.error.issues[0]?.message ?? "Informe um fluxo válido.",
      );
    this.requireFlowDepartments(actor, parsed.data.stages);
    const state = this.repository.read();
    const flow: DepartmentFlow = {
      ...parsed.data,
      id: this.id("department-flow"),
      tenantId: actor.tenantId,
      version: 1,
      active: true,
    };
    (state.departmentFlows ??= []).push(flow);
    this.record(
      state,
      actor,
      "Fluxo entre departamentos cadastrado",
      flow.title,
    );
    this.repository.replace(state);
    return structuredClone(flow);
  }
  updateDepartmentFlow(actor: Actor, id: string, input: UpdateDepartmentFlow) {
    if (!hasPermission(actor, "templates.manage"))
      this.requirePermission(actor, "processes.manage", false);
    const parsed = updateDepartmentFlowSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_FLOW",
        parsed.error.issues[0]?.message ?? "Informe um fluxo válido.",
      );
    const state = this.repository.read();
    const flow = (state.departmentFlows ?? []).find(
      (item) =>
        item.id === id &&
        item.tenantId === actor.tenantId &&
        item.stages.every((stage) =>
          actor.departments.includes(stage.department),
        ),
    );
    if (!flow)
      throw new DomainError(
        "NOT_FOUND",
        "Fluxo não encontrado neste escopo.",
        404,
      );
    this.requireFlowDepartments(actor, parsed.data.stages);
    const { expectedVersion, ...body } = parsed.data;
    if (flow.version !== expectedVersion)
      throw new DomainError(
        "CONFLICT",
        "Este fluxo mudou. Reabra a versão atual.",
        409,
      );
    Object.assign(flow, body, { version: flow.version + 1 });
    this.record(
      state,
      actor,
      "Fluxo entre departamentos atualizado",
      `${flow.title} · versão ${flow.version}`,
    );
    this.repository.replace(state);
    return structuredClone(flow);
  }
  private requireFlowDepartments(
    actor: Actor,
    stages: { department: Department }[],
  ) {
    if (stages.some((stage) => !actor.departments.includes(stage.department)))
      throw new DomainError(
        "FORBIDDEN",
        "O fluxo inclui departamentos fora do seu acesso.",
        403,
      );
  }
  private onboardingAssignee(
    state: PortalState,
    tenantId: string,
    department: Department,
    assigneeId: string,
  ) {
    const user = state.users.find(
      (item) =>
        item.tenantId === tenantId &&
        item.userId === assigneeId &&
        item.active !== false &&
        item.departments.includes(department) &&
        canExecute(item) &&
        hasPermission(item, "tasks.view"),
    );
    if (!user)
      throw new DomainError(
        "INVALID_ASSIGNEE",
        "Defina um responsável ativo com acesso à execução no departamento da etapa.",
      );
    return user;
  }
  private activateOnboardingStage(
    state: PortalState,
    onboarding: CompanyOnboarding,
    index: number,
  ) {
    const stage = onboarding.stages[index]!;
    this.onboardingAssignee(
      state,
      onboarding.tenantId,
      stage.department,
      stage.assigneeId,
    );
    const today = businessDate(this.clock());
    const due = (offset: number) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      const result = date.toISOString().slice(0, 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
        result < "0001-01-01" ||
        result > "9999-12-31"
      )
        throw new DomainError(
          "INVALID_DATE",
          "O prazo da implantação excede o intervalo de datas suportado.",
        );
      return result;
    };
    const task: Task = {
      id: this.id("task"),
      tenantId: onboarding.tenantId,
      companyId: onboarding.companyId,
      templateId: "avulsa",
      templateVersion: onboarding.flowVersion,
      onboardingId: onboarding.id,
      onboardingStageId: stage.id,
      title: stage.title,
      description: `Implantação · ${onboarding.flowTitle}`,
      department: stage.department,
      competence: onboarding.competence,
      internalDue: due(stage.internalDays),
      legalDue: due(stage.legalDays),
      assigneeId: stage.assigneeId,
      status: "todo",
      executionActorIds: [],
      requiresReview: stage.requiresReview,
      evidenceRequired: !!stage.requiredDocument.trim(),
      steps: stage.workflowSteps.map((step) => ({ ...step, completed: false })),
      documentLabel: stage.requiredDocument || "Evidência opcional",
      documents: [],
      revision: 1,
      dispenseRequested: false,
      reopenedCount: 0,
    };
    state.tasks.push(task);
    stage.taskId = task.id;
    stage.status = "active";
    return task;
  }
  private startOnboardingInState(
    state: PortalState,
    actor: Actor,
    input: StartCompanyOnboarding,
  ) {
    if (!hasPermission(actor, "companies.manage"))
      this.requirePermission(actor, "processes.manage", false);
    const parsed = startCompanyOnboardingSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_ONBOARDING",
        parsed.error.issues[0]?.message ?? "Informe uma implantação válida.",
      );
    const body = parsed.data;
    const company = state.companies.find(
      (item) =>
        item.id === body.companyId &&
        item.tenantId === actor.tenantId &&
        item.active,
    );
    if (!company)
      throw new DomainError(
        "NOT_FOUND",
        "Empresa ativa não encontrada neste escopo.",
        404,
      );
    const flow = (state.departmentFlows ?? []).find(
      (item) =>
        item.id === body.flowId &&
        item.tenantId === actor.tenantId &&
        item.active &&
        item.stages.every((stage) =>
          actor.departments.includes(stage.department),
        ),
    );
    if (!flow)
      throw new DomainError(
        "NOT_FOUND",
        "Fluxo ativo não encontrado neste escopo.",
        404,
      );
    if (flow.version !== body.expectedFlowVersion)
      throw new DomainError(
        "CONFLICT",
        "O fluxo mudou. Confira a versão atual antes de iniciar.",
        409,
      );
    if (
      flow.kind !== "process" &&
      (state.companyOnboardings ?? []).some(
        (item) =>
          item.tenantId === actor.tenantId &&
          item.companyId === company.id &&
          item.kind !== "process",
      )
    )
      throw new DomainError(
        "DUPLICATE_ONBOARDING",
        "Esta empresa já possui uma implantação registrada.",
        409,
      );
    if (
      Object.keys(body.assignments).length !== flow.stages.length ||
      Object.keys(body.assignments).some(
        (id) => !flow.stages.some((stage) => stage.id === id),
      )
    )
      throw new DomainError(
        "INVALID_ASSIGNEE",
        "Defina exatamente um responsável para cada etapa do fluxo.",
      );
    for (const stage of flow.stages)
      this.onboardingAssignee(
        state,
        actor.tenantId,
        stage.department,
        body.assignments[stage.id]!,
      );
    const onboarding: CompanyOnboarding = {
      kind: flow.kind ?? "onboarding",
      id: this.id("onboarding"),
      tenantId: actor.tenantId,
      companyId: company.id,
      flowId: flow.id,
      flowVersion: flow.version,
      flowTitle: flow.title,
      competence: body.competence,
      blockRecurring: flow.kind === "process" ? false : body.blockRecurring,
      status: "active",
      startedAt: this.clock(),
      revision: 1,
      stages: flow.stages.map((stage) => ({
        ...structuredClone(stage),
        assigneeId: body.assignments[stage.id]!,
        status: "blocked",
      })),
    };
    (state.companyOnboardings ??= []).push(onboarding);
    const task = this.activateOnboardingStage(state, onboarding, 0);
    this.record(
      state,
      actor,
      "Implantação iniciada",
      `${flow.title} · rotinas ${body.blockRecurring ? "aguardam implantação" : "em paralelo"}`,
      { companyId: company.id, task },
    );
    return onboarding;
  }
  startCompanyOnboarding(actor: Actor, input: StartCompanyOnboarding) {
    const state = this.repository.read();
    const onboarding = this.startOnboardingInState(state, actor, input);
    this.repository.replace(state);
    return structuredClone(onboarding);
  }
  updateCompanyOnboarding(
    actor: Actor,
    id: string,
    input: UpdateCompanyOnboarding,
  ) {
    if (!hasPermission(actor, "companies.manage"))
      this.requirePermission(actor, "processes.manage", false);
    const parsed = updateCompanyOnboardingSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "INVALID_ONBOARDING",
        parsed.error.issues[0]?.message ?? "Informe responsáveis válidos.",
      );
    const state = this.repository.read();
    const onboarding = (state.companyOnboardings ?? []).find(
      (item) =>
        item.id === id &&
        item.tenantId === actor.tenantId &&
        item.stages.every((stage) =>
          actor.departments.includes(stage.department),
        ),
    );
    if (!onboarding)
      throw new DomainError(
        "NOT_FOUND",
        "Implantação não encontrada neste escopo.",
        404,
      );
    if (onboarding.revision !== parsed.data.expectedRevision)
      throw new DomainError(
        "CONFLICT",
        "A implantação mudou. Atualize antes de continuar.",
        409,
      );
    if (onboarding.status !== "active")
      throw new DomainError(
        "INVALID_ONBOARDING",
        "A implantação já foi concluída.",
        409,
      );
    for (const [stageId, assigneeId] of Object.entries(
      parsed.data.assignments,
    )) {
      const stage = onboarding.stages.find(
        (item) => item.id === stageId && item.status === "blocked",
      );
      if (!stage)
        throw new DomainError(
          "INVALID_ONBOARDING",
          "Só é possível alterar responsáveis das próximas etapas.",
          409,
        );
      this.onboardingAssignee(
        state,
        actor.tenantId,
        stage.department,
        assigneeId,
      );
      stage.assigneeId = assigneeId;
    }
    onboarding.revision++;
    this.record(
      state,
      actor,
      "Responsáveis da implantação atualizados",
      onboarding.flowTitle,
      { companyId: onboarding.companyId },
    );
    this.repository.replace(state);
    return structuredClone(onboarding);
  }
  private advanceOnboarding(state: PortalState, actor: Actor, task: Task) {
    const onboarding = (state.companyOnboardings ?? []).find(
      (item) =>
        item.id === task.onboardingId && item.tenantId === task.tenantId,
    );
    if (!onboarding || onboarding.status !== "active")
      throw new DomainError(
        "INVALID_ONBOARDING",
        "A implantação desta etapa não está ativa.",
        409,
      );
    const index = onboarding.stages.findIndex(
      (stage) =>
        stage.id === task.onboardingStageId && stage.taskId === task.id,
    );
    const stage = onboarding.stages[index];
    if (!stage || stage.status !== "active")
      throw new DomainError(
        "INVALID_ONBOARDING",
        "A etapa não corresponde à etapa ativa da implantação.",
        409,
      );
    stage.status = "done";
    onboarding.revision++;
    if (index + 1 < onboarding.stages.length) {
      const next = this.activateOnboardingStage(state, onboarding, index + 1);
      this.record(
        state,
        actor,
        "Implantação encaminhada ao próximo setor",
        `${stage.department} → ${next.department}`,
        { task: next },
      );
    } else {
      onboarding.status = "completed";
      onboarding.completedAt = this.clock();
      this.record(
        state,
        actor,
        "Implantação concluída",
        `${onboarding.flowTitle} · geração de rotinas liberada`,
        { companyId: onboarding.companyId },
      );
    }
  }
  addTask(actor: Actor, input: CreateTask) {
    this.requirePermission(actor, "tasks.create");
    this.writable(actor);
    const state = this.repository.read();
    if (
      !actor.departments.includes(input.department) ||
      !state.companies.some(
        (c) =>
          c.id === input.companyId &&
          c.tenantId === actor.tenantId &&
          ((actor.permissions !== undefined
            ? hasPermission(actor, "tasks.create")
            : isManager(actor)) ||
            c.ownerId === actor.userId),
      )
    )
      throw new DomainError(
        "FORBIDDEN",
        "Empresa ou departamento fora do seu escopo.",
        403,
      );
    if (
      (!(actor.permissions !== undefined
        ? hasPermission(actor, "tasks.create")
        : isManager(actor)) &&
        input.assigneeId !== actor.userId) ||
      !state.users.some(
        (u) =>
          u.userId === input.assigneeId &&
          u.tenantId === actor.tenantId &&
          u.active !== false &&
          canExecute(u) &&
          u.departments.includes(input.department),
      )
    )
      throw new DomainError(
        "INVALID_ASSIGNEE",
        "Responsável indisponível neste escopo.",
        403,
      );
    const task: Task = {
      ...input,
      id: this.id("task"),
      tenantId: actor.tenantId,
      templateId: "avulsa",
      templateVersion: 1,
      competence: businessDate(this.clock()).slice(0, 7),
      status: "todo",
      executionActorIds: [],
      steps: [
        {
          id: "check",
          title: "Conferir as informações da solicitação",
          completed: false,
        },
        {
          id: "execute",
          title: "Executar o serviço solicitado",
          completed: false,
        },
      ],
      documentLabel: "Evidência do serviço",
      documents: [],
      revision: 1,
      dispenseRequested: false,
      reopenedCount: 0,
    };
    state.tasks.push(task);
    this.record(state, actor, "Tarefa avulsa criada", task.title, { task });
    this.repository.replace(state);
    return task;
  }
  importCompanies(actor: Actor, inputs: CreateCompany[]) {
    this.requirePermission(actor, "companies.manage", isManager(actor));
    if (!inputs.length || inputs.length > 200)
      throw new DomainError(
        "INVALID_IMPORT",
        "Importe entre 1 e 200 empresas.",
      );
    const staging = new MemoryRepository(this.repository.read());
    const engine = new PortalEngine(staging, this.clock, () =>
      this.id("batch"),
    );
    let created = 0;
    let existing = 0;
    for (const raw of inputs) {
      const parsed = companySchema.safeParse(raw);
      if (!parsed.success)
        throw new DomainError(
          "INVALID_COMPANY",
          parsed.error.issues[0]?.message ?? "Empresa inválida.",
        );
      const input = parsed.data;
      if (
        staging
          .read()
          .companies.some(
            (company) =>
              company.tenantId === actor.tenantId &&
              company.cnpj === input.cnpj,
          )
      ) {
        existing++;
        continue;
      }
      engine.addCompany(actor, input);
      created++;
    }
    const state = staging.read();
    this.record(
      state,
      actor,
      "Empresas importadas",
      `${created} novas · ${existing} já cadastradas`,
    );
    this.repository.replace(state);
    return { created, existing };
  }
  importTemplates(actor: Actor, inputs: CreateTemplate[]) {
    this.requirePermission(actor, "templates.manage", isManager(actor));
    if (!inputs.length || inputs.length > 200)
      throw new DomainError("INVALID_IMPORT", "Importe entre 1 e 200 modelos.");
    const staging = new MemoryRepository(this.repository.read());
    const engine = new PortalEngine(staging, this.clock, () =>
      this.id("batch"),
    );
    let created = 0,
      existing = 0;
    for (const input of inputs) {
      if (
        staging
          .read()
          .templates.some(
            (template) =>
              template.tenantId === actor.tenantId &&
              template.department === input.department &&
              template.title.toLocaleLowerCase("pt-BR") ===
                input.title.toLocaleLowerCase("pt-BR"),
          )
      ) {
        existing++;
        continue;
      }
      engine.addTemplate(actor, input);
      created++;
    }
    this.repository.replace(staging.read());
    return { created, existing };
  }
  importTasks(actor: Actor, inputs: CreateTask[]) {
    this.requirePermission(actor, "tasks.create");
    if (!inputs.length || inputs.length > 200)
      throw new DomainError(
        "INVALID_IMPORT",
        "Importe entre 1 e 200 atividades.",
      );
    const staging = new MemoryRepository(this.repository.read());
    const engine = new PortalEngine(staging, this.clock, () =>
      this.id("batch"),
    );
    let created = 0,
      existing = 0;
    for (const raw of inputs) {
      const parsed = taskSchema.safeParse(raw);
      if (!parsed.success)
        throw new DomainError(
          "INVALID_TASK",
          parsed.error.issues[0]?.message ?? "Atividade inválida.",
        );
      const input = parsed.data;
      if (
        staging
          .read()
          .tasks.some(
            (task) =>
              task.tenantId === actor.tenantId &&
              task.companyId === input.companyId &&
              task.title === input.title &&
              task.department === input.department &&
              task.legalDue === input.legalDue,
          )
      ) {
        existing++;
        continue;
      }
      engine.addTask(actor, input);
      created++;
    }
    this.repository.replace(staging.read());
    return { created, existing };
  }
  transferTasks(
    actor: Actor,
    input: {
      taskIds: string[];
      assigneeId: string;
      expectedRevisions: Record<string, number>;
      reason: string;
    },
  ) {
    this.requirePermission(actor, "tasks.assign", isManager(actor));
    if (
      !input.taskIds.length ||
      input.taskIds.length > 200 ||
      new Set(input.taskIds).size !== input.taskIds.length ||
      input.reason.trim().length < 8
    )
      throw new DomainError(
        "INVALID_TRANSFER",
        "Selecione até 200 atividades e informe uma justificativa.",
      );
    const staging = new MemoryRepository(this.repository.read());
    const engine = new PortalEngine(staging, this.clock, () =>
      this.id("batch"),
    );
    for (const id of input.taskIds) {
      const task = staging
        .read()
        .tasks.find((task) => task.id === id && canSeeTask(actor, task));
      if (!task || ["done", "dispensed"].includes(task.status))
        throw new DomainError(
          "INVALID_TRANSFER",
          "Selecione somente atividades abertas e autorizadas.",
        );
      engine.command(actor, id, {
        type: "assign",
        expectedRevision: input.expectedRevisions[id] ?? 0,
        assigneeId: input.assigneeId,
      });
    }
    const state = staging.read();
    this.record(
      state,
      actor,
      "Atividades transferidas em lote",
      `${input.taskIds.length} atividades · ${input.reason}`,
    );
    this.repository.replace(state);
    return { tasks: input.taskIds.length };
  }
  /**
   * Automatic monthly generation (17/10/2026): creates the closed competence
   * for every active department of the group. Idempotent; the manual
   * "Gerar competência" keeps working alongside it.
   */
  autoGenerate(tenantId: string, competence = closedCompetence(this.clock())) {
    const state = this.repository.read();
    const workspace = workspaceOf(state, tenantId);
    const departments = workspace.departments
      .filter((department) => department.active)
      .map((department) => department.id);
    const actor: Actor = {
      userId: SYSTEM_ACTOR_ID,
      tenantId,
      name: "Geração automática",
      initials: "GA",
      role: "admin",
      departments,
    };
    // A company without a valid responsible is skipped and reported; the
    // rest of the group still gets its tasks (one bad record never blocks all).
    const results = departments.map((department) => {
      const skipped: string[] = [];
      return {
        department,
        ...this.generateInState(
          state,
          actor,
          competence,
          department,
          undefined,
          skipped,
        ),
        skipped,
      };
    });
    const created = results.reduce((sum, item) => sum + item.created, 0);
    let changed = false;
    for (const item of results) {
      if (item.created) {
        this.record(
          state,
          actor,
          "Geração automática de tarefas",
          `${competence} · ${item.created} geradas · ${item.existing} existentes`,
          { department: item.department },
        );
        changed = true;
      }
      if (!item.skipped.length) continue;
      const detail = `${competence} · sem responsável válido: ${item.skipped.join(", ")}. Defina o responsável e gere de novo.`;
      // Hourly runs repeat the same notice only when something changed.
      if (
        !state.audit.some(
          (event) =>
            event.tenantId === tenantId &&
            event.action === "Geração automática com pendências" &&
            event.department === item.department &&
            event.detail === detail,
        )
      ) {
        this.record(state, actor, "Geração automática com pendências", detail, {
          department: item.department,
        });
        changed = true;
      }
    }
    if (changed) this.repository.replace(state);
    return { competence, created, results };
  }
  generate(actor: Actor, competence: string, department: Department) {
    if (!generationSchema.safeParse({ competence, department }).success)
      throw new DomainError(
        "INVALID_PERIOD",
        "Informe uma competência válida com vencimento no mês seguinte.",
      );
    this.requirePermission(actor, "templates.manage", isManager(actor));
    if (!actor.departments.includes(department))
      throw new DomainError(
        "FORBIDDEN",
        "Seu perfil não pode gerar tarefas neste departamento.",
        403,
      );
    const state = this.repository.read();
    const result = this.generateInState(state, actor, competence, department);
    this.record(
      state,
      actor,
      "Geração de tarefas",
      `${competence} · ${result.created} geradas · ${result.existing} existentes`,
      { department },
    );
    this.repository.replace(state);
    return result;
  }
  private generateInState(
    state: PortalState,
    actor: Actor,
    competence: string,
    department: Department,
    companyId?: string,
    /** When given, companies without a valid responsible are listed here instead of failing. */
    skipped?: string[],
  ) {
    const [year = 2026, month = 9] = competence.split("-").map(Number);
    const nextDate = new Date(0);
    nextDate.setUTCFullYear(year, month, 1);
    const next = nextDate.toISOString().slice(0, 7);
    let created = 0;
    let existing = 0;
    let blocked = 0;
    companies: for (const original of state.companies.filter(
      (c) =>
        c.tenantId === actor.tenantId &&
        (!companyId || c.id === companyId) &&
        c.startDate.slice(0, 7) <= competence,
    )) {
      const c = companyAtCompetence(original, competence);
      if (!companyServes(c, competence)) continue;
      const responsibility = c.responsibilities?.[department];
      if (
        c.responsibilities &&
        (!responsibility || responsibility.mode === "none")
      )
        continue;
      const models = state.templates.filter(
        (m) =>
          m.tenantId === actor.tenantId &&
          m.department === department &&
          m.active &&
          (m.regime === "Todos" || m.regime === c.regime),
      );
      if (
        models.length &&
        (state.companyOnboardings ?? []).some(
          (onboarding) =>
            onboarding.tenantId === actor.tenantId &&
            onboarding.companyId === c.id &&
            onboarding.status === "active" &&
            onboarding.blockRecurring,
        )
      ) {
        blocked++;
        continue;
      }
      for (const model of models) {
        if (
          state.tasks.some(
            (t) =>
              t.tenantId === actor.tenantId &&
              t.companyId === c.id &&
              t.templateId === model.id &&
              t.competence === competence,
          )
        ) {
          existing++;
          continue;
        }
        const owner = state.users.find(
          (u) =>
            u.userId ===
              (responsibility?.mode === "person"
                ? responsibility.userId
                : c.ownerId) &&
            u.tenantId === actor.tenantId &&
            u.active !== false &&
            u.departments.includes(department) &&
            canExecute(u),
        );
        const fallback = state.users.find(
          (u) =>
            u.tenantId === actor.tenantId &&
            u.departments.includes(department) &&
            u.active !== false &&
            canExecute(u) &&
            isManager(u),
        );
        const assigneeId =
          responsibility?.mode === "department"
            ? `department:${department}`
            : (owner?.userId ??
              (!c.responsibilities ? fallback?.userId : undefined));
        if (!assigneeId) {
          // The responsible is the same for every model of this company, so
          // nothing of it was created yet when this happens.
          if (skipped) {
            skipped.push(c.name);
            continue companies;
          }
          throw new DomainError(
            "NO_OWNER",
            `Defina um responsável para ${c.name}.`,
          );
        }
        state.tasks.push({
          id: this.id("task"),
          tenantId: actor.tenantId,
          companyId: c.id,
          templateId: model.id,
          templateVersion: model.version,
          title: model.title,
          description: model.description,
          department,
          competence,
          internalDue: `${next}-${String(model.internalDay).padStart(2, "0")}`,
          legalDue: `${next}-${String(model.legalDay).padStart(2, "0")}`,
          assigneeId,
          status: "todo",
          executionActorIds: [],
          requiresReview: model.requiresReview,
          steps: getCompanyWorkflow(model, original).map((step) => ({
            ...step,
            completed: false,
          })),
          documentLabel: model.requiredDocument,
          requiredDocumentTypeIds: requiredDocumentTypes(
            state,
            actor.tenantId,
            model.id,
          ),
          documents: [],
          revision: 1,
          dispenseRequested: false,
          reopenedCount: 0,
        });
        created++;
      }
    }
    return blocked ? { created, existing, blocked } : { created, existing };
  }
}
