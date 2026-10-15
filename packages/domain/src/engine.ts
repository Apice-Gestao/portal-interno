import { canSeeTask, isManager } from "./selectors.js";
import {
  generationSchema,
  templateSchema,
  updateTemplateSchema,
} from "./schemas.js";
import { getTemplateWorkflow } from "./workflow.js";
import { hasPermission, canExecute } from "./access.js";
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
} from "./types.js";
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
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
    return {
      now: this.clock(),
      persistence: "memory",
      actor: structuredClone(actor),
      tasks,
      companies: state.companies.filter(
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
      ),
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
            hasPermission(actor, "companies.manage") ||
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
    if (task.documents.at(-1)?.validation !== "accepted")
      throw new DomainError(
        "MISSING_DOCUMENT",
        "Anexe uma evidência válida antes de continuar.",
      );
  }
  command(actor: Actor, id: string, command: TaskCommand): Task {
    this.requirePermission(
      actor,
      ["approve", "return"].includes(command.type)
        ? "tasks.review"
        : ["assign", "dispense", "reopen"].includes(command.type)
          ? "tasks.manage"
          : "tasks.execute",
    );
    this.writable(actor);
    const state = this.repository.read();
    const t = this.getTask(state, actor, id, command.expectedRevision);
    const before = this.auditState(t);
    const manager = isManager(actor);
    const owner = t.assigneeId === actor.userId;
    const reviewAction =
      command.type === "approve" || command.type === "return";
    if (!manager && !owner && !reviewAction)
      throw new DomainError(
        "FORBIDDEN",
        "Você não é responsável por esta tarefa.",
        403,
      );
    let action = "";
    let detail = t.title;
    switch (command.type) {
      case "start":
        if (!["todo", "returned"].includes(t.status))
          throw new DomainError(
            "INVALID_STATE",
            "Esta tarefa não pode ser iniciada neste estado.",
          );
        t.status = "in_progress";
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
        t.status = "dispensed";
        t.dispenseRequested = false;
        action = "Dispensa aprovada";
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
              canExecute(u),
          );
          if (!user)
            throw new DomainError(
              "INVALID_ASSIGNEE",
              "Responsável indisponível neste departamento.",
            );
          t.assigneeId = user.userId;
          action = "Responsável alterado";
          detail = user.name;
        }
        break;
    }
    t.revision++;
    this.record(state, actor, action, detail, { task: t, before });
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
  addCompany(actor: Actor, input: CreateCompany) {
    this.requirePermission(actor, "companies.manage", isManager(actor));
    const state = this.repository.read();
    if (
      state.companies.some(
        (c) => c.tenantId === actor.tenantId && c.cnpj === input.cnpj,
      )
    )
      throw new DomainError("DUPLICATE", "Este CNPJ já está cadastrado.", 409);
    if (
      !state.users.some(
        (u) =>
          u.userId === input.ownerId &&
          u.tenantId === actor.tenantId &&
          u.active !== false &&
          canExecute(u) &&
          u.departments.some((d) => actor.departments.includes(d)),
      )
    )
      throw new DomainError("INVALID_ASSIGNEE", "Responsável indisponível.");
    const company = {
      ...input,
      id: this.id("company"),
      tenantId: actor.tenantId,
      code: this.nextCompanyCode(state, actor.tenantId),
      active: true,
      startDate: this.clock().slice(0, 10),
    };
    state.companies.push(company);
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
      competence: this.clock().slice(0, 7),
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
    const state = this.repository.read();
    let created = 0;
    let existing = 0;
    for (const input of inputs) {
      if (
        state.companies.some(
          (c) => c.tenantId === actor.tenantId && c.cnpj === input.cnpj,
        )
      ) {
        existing++;
        continue;
      }
      if (
        !state.users.some(
          (u) =>
            u.userId === input.ownerId &&
            u.tenantId === actor.tenantId &&
            u.active !== false &&
            canExecute(u) &&
            u.departments.some((d) => actor.departments.includes(d)),
        )
      )
        throw new DomainError(
          "INVALID_ASSIGNEE",
          `Responsável inválido para ${input.name}.`,
        );
      state.companies.push({
        ...input,
        id: this.id("company"),
        tenantId: actor.tenantId,
        code: this.nextCompanyCode(state, actor.tenantId),
        active: true,
        startDate: this.clock().slice(0, 10),
      });
      created++;
    }
    this.record(
      state,
      actor,
      "Empresas importadas",
      `${created} novas · ${existing} já cadastradas`,
    );
    this.repository.replace(state);
    return { created, existing };
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
    const [year = 2026, month = 9] = competence.split("-").map(Number);
    const nextDate = new Date(0);
    nextDate.setUTCFullYear(year, month, 1);
    const next = nextDate.toISOString().slice(0, 7);
    let created = 0;
    let existing = 0;
    for (const c of state.companies.filter(
      (c) =>
        c.tenantId === actor.tenantId &&
        c.active &&
        c.startDate.slice(0, 7) <= competence,
    ))
      for (const model of state.templates.filter(
        (m) =>
          m.tenantId === actor.tenantId &&
          m.department === department &&
          m.active &&
          (m.regime === "Todos" || m.regime === c.regime),
      )) {
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
            u.userId === c.ownerId &&
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
        if (!owner && !fallback)
          throw new DomainError(
            "NO_OWNER",
            `Defina um responsável para ${c.name}.`,
          );
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
          assigneeId: (owner ?? fallback)!.userId,
          status: "todo",
          executionActorIds: [],
          requiresReview: model.requiresReview,
          steps: getTemplateWorkflow(model).map((step) => ({
            ...step,
            completed: false,
          })),
          documentLabel: model.requiredDocument,
          documents: [],
          revision: 1,
          dispenseRequested: false,
          reopenedCount: 0,
        });
        created++;
      }
    this.record(
      state,
      actor,
      "Geração de tarefas",
      `${competence} · ${created} geradas · ${existing} existentes`,
      { department },
    );
    this.repository.replace(state);
    return { created, existing };
  }
}
