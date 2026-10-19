import { beforeEach, describe, expect, it } from "vitest";
import {
  cnpjFromBase,
  createSeed,
  DEMO_NOW,
  DomainError,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
} from "../packages/domain/src/index.js";
import type {
  Actor,
  CompanyOnboarding,
  CreateCompany,
  CreateDepartmentFlow,
  DepartmentFlow,
  StartCompanyOnboarding,
  Task,
  UpdateDepartmentFlow,
} from "../packages/domain/src/index.js";

let engine: PortalEngine;
let repository: MemoryRepository;
let administrator: Actor;
let fiscal: Actor;
let accounting: Actor;
let payroll: Actor;
let now: string;

function modelInput(): CreateDepartmentFlow {
  return {
    title: "Implantação da empresa",
    description: "Entrada e parametrização por setores na ordem do gestor.",
    stages: [
      {
        id: "fiscal",
        title: "Parametrização fiscal",
        department: "Fiscal",
        workflowSteps: [
          { id: "cadastro", title: "Conferir o cadastro fiscal" },
        ],
        internalDays: 1,
        legalDays: 3,
        requiresReview: false,
        requiredDocument: "",
      },
      {
        id: "pessoal",
        title: "Parametrização de pessoal",
        department: "Pessoal",
        workflowSteps: [
          { id: "folha", title: "Conferir os parâmetros da folha" },
        ],
        internalDays: 2,
        legalDays: 5,
        requiresReview: false,
        requiredDocument: "",
      },
      {
        id: "contabil",
        title: "Parametrização contábil",
        department: "Contábil",
        workflowSteps: [{ id: "plano", title: "Conferir o plano de contas" }],
        internalDays: 1,
        legalDays: 2,
        requiresReview: false,
        requiredDocument: "",
      },
    ],
  };
}

function updateInput(
  model: DepartmentFlow,
  patch: Partial<UpdateDepartmentFlow> = {},
): UpdateDepartmentFlow {
  return {
    title: model.title,
    description: model.description,
    stages: structuredClone(model.stages),
    expectedVersion: model.version,
    active: model.active,
    ...patch,
  };
}

function startInput(
  model: DepartmentFlow,
  patch: Partial<StartCompanyOnboarding> = {},
): StartCompanyOnboarding {
  return {
    companyId: "company-1",
    flowId: model.id,
    expectedFlowVersion: model.version,
    competence: "2026-10",
    blockRecurring: true,
    assignments: {
      fiscal: fiscal.userId,
      pessoal: payroll.userId,
      contabil: accounting.userId,
    },
    ...patch,
  };
}

function onboarding(id: string): CompanyOnboarding {
  const result = repository
    .read()
    .companyOnboardings?.find((run) => run.id === id);
  expect(result).toBeDefined();
  return result!;
}

function task(id: string): Task {
  const result = repository
    .read()
    .tasks.find((candidate) => candidate.id === id);
  expect(result).toBeDefined();
  return result!;
}

function currentTask(run: CompanyOnboarding): Task {
  const stage = onboarding(run.id).stages.find(
    (candidate) => candidate.status === "active",
  );
  expect(stage?.taskId).toBeTruthy();
  return task(stage!.taskId!);
}

function prepare(actor: Actor, target: Task): Task {
  let current = target;
  if (current.status === "todo" || current.status === "returned") {
    current = engine.command(actor, current.id, {
      type: "start",
      expectedRevision: current.revision,
    });
  }
  for (const step of current.steps.filter(
    (candidate) => !candidate.completed,
  )) {
    current = engine.command(actor, current.id, {
      type: "step",
      stepId: step.id,
      completed: true,
      expectedRevision: current.revision,
    });
  }
  if (current.evidenceRequired !== false && current.documents.length === 0) {
    current = engine.attach(actor, current.id, current.revision, {
      name: "parametrizacao-ficticia.pdf",
      kind: "PDF",
      bytes: 100,
    });
  }
  return current;
}

function finish(actor: Actor, target: Task): Task {
  let current = prepare(actor, target);
  current = engine.command(actor, current.id, {
    type: current.requiresReview ? "submit" : "complete",
    expectedRevision: current.revision,
  });
  if (current.requiresReview) {
    current = engine.command(administrator, current.id, {
      type: "approve",
      expectedRevision: current.revision,
    });
  }
  return current;
}

function refuse(action: () => unknown, code?: string, status?: number) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  if (code) expect(caught).toMatchObject({ code });
  if (status) expect(caught).toMatchObject({ status });
}

beforeEach(() => {
  const state = createSeed();
  administrator = {
    ...state.users.find((candidate) => candidate.userId === "helena")!,
    permissions: [...PERMISSIONS],
    active: true,
  };
  const executor = {
    tenantId: administrator.tenantId,
    role: "operator" as const,
    permissions: [
      "tasks.view",
      "tasks.execute",
      "tasks.attach",
    ] as Actor["permissions"],
    active: true,
  };
  fiscal = {
    ...executor,
    userId: "julia",
    name: "Júlia Martins",
    initials: "JM",
    departments: ["Fiscal"],
  };
  payroll = {
    ...executor,
    userId: "pessoal-test",
    name: "Pessoa de teste do departamento pessoal",
    initials: "PP",
    departments: ["Pessoal"],
  };
  accounting = {
    ...executor,
    userId: "contabil-test",
    name: "Pessoa de teste do departamento contábil",
    initials: "PC",
    departments: ["Contábil"],
  };
  state.users = [administrator, fiscal, payroll, accounting];
  state.companies = state.companies.filter(
    (company) => company.id === "company-1",
  );
  state.tasks = state.tasks.filter(
    (candidate) => candidate.companyId === "company-1",
  );
  state.departmentFlows = [];
  state.companyOnboardings = [];
  repository = new MemoryRepository(state);
  now = DEMO_NOW;
  engine = new PortalEngine(repository, () => now);
});

describe("department flow models and permissions", () => {
  it("honors the chosen department order and explicit grants even for an operator", () => {
    const allowedOperator: Actor = { ...administrator, role: "operator" };
    const model = engine.createDepartmentFlow(allowedOperator, modelInput());
    expect(model.version).toBe(1);
    expect(model.active).toBe(true);
    expect(model.stages.map((stage) => stage.department)).toEqual([
      "Fiscal",
      "Pessoal",
      "Contábil",
    ]);
    const changed = engine.updateDepartmentFlow(
      allowedOperator,
      model.id,
      updateInput(model, { stages: [...model.stages].reverse() }),
    );
    expect(changed.version).toBe(2);
    expect(changed.stages.map((stage) => stage.department)).toEqual([
      "Contábil",
      "Pessoal",
      "Fiscal",
    ]);
  });

  it("does not let an administrator without the grant manage models", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const denied = {
      ...administrator,
      permissions: ["templates.view"] as Actor["permissions"],
    };
    const before = repository.read();
    refuse(
      () => engine.createDepartmentFlow(denied, modelInput()),
      "FORBIDDEN",
      403,
    );
    refuse(
      () => engine.updateDepartmentFlow(denied, model.id, updateInput(model)),
      "FORBIDDEN",
      403,
    );
    expect(repository.read()).toEqual(before);
  });

  it("refuses models containing a department outside the actor scope", () => {
    const scoped = {
      ...administrator,
      departments: ["Fiscal"] as Actor["departments"],
    };
    const before = repository.read();
    refuse(
      () => engine.createDepartmentFlow(scoped, modelInput()),
      "FORBIDDEN",
      403,
    );
    expect(repository.read()).toEqual(before);
  });

  it("isolates tenant identifiers in updates and onboarding starts", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const foreign = { ...administrator, tenantId: "foreign-tenant" };
    const before = repository.read();
    refuse(
      () => engine.updateDepartmentFlow(foreign, model.id, updateInput(model)),
      "NOT_FOUND",
      404,
    );
    refuse(
      () => engine.startCompanyOnboarding(foreign, startInput(model)),
      "NOT_FOUND",
      404,
    );
    expect(repository.read()).toEqual(before);
  });

  it.each([
    [
      "no stages",
      (input: CreateDepartmentFlow) => {
        input.stages = [];
      },
    ],
    [
      "duplicate stage ids",
      (input: CreateDepartmentFlow) => {
        input.stages[1]!.id = input.stages[0]!.id;
      },
    ],
    [
      "missing workflow",
      (input: CreateDepartmentFlow) => {
        input.stages[0]!.workflowSteps = [];
      },
    ],
    [
      "deadline inversion",
      (input: CreateDepartmentFlow) => {
        input.stages[0]!.internalDays = 4;
      },
    ],
    [
      "negative duration",
      (input: CreateDepartmentFlow) => {
        input.stages[0]!.internalDays = -1;
      },
    ],
    [
      "excessive duration",
      (input: CreateDepartmentFlow) => {
        input.stages[0]!.legalDays = 3651;
      },
    ],
    [
      "invalid id",
      (input: CreateDepartmentFlow) => {
        input.stages[0]!.id = "../fiscal";
      },
    ],
  ] as const)(
    "rejects %s without persisting a partial model",
    (_label, mutate) => {
      const input = modelInput();
      mutate(input);
      const before = repository.read();
      refuse(
        () => engine.createDepartmentFlow(administrator, input),
        "INVALID_FLOW",
        422,
      );
      expect(repository.read()).toEqual(before);
    },
  );

  it("rejects client injected ownership fields instead of accepting them", () => {
    const before = repository.read();
    refuse(
      () =>
        engine.createDepartmentFlow(administrator, {
          ...modelInput(),
          tenantId: "foreign",
          id: "chosen-id",
          version: 99,
        } as CreateDepartmentFlow),
      "INVALID_FLOW",
      422,
    );
    expect(repository.read()).toEqual(before);
  });

  it("uses a compare and swap version and keeps the winning update untouched", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const winner = engine.updateDepartmentFlow(
      administrator,
      model.id,
      updateInput(model, { title: "Fluxo atualizado pelo gestor" }),
    );
    const beforeConflict = repository.read();
    refuse(
      () =>
        engine.updateDepartmentFlow(
          administrator,
          model.id,
          updateInput(model, { title: "Edição atrasada" }),
        ),
      "CONFLICT",
      409,
    );
    expect(repository.read()).toEqual(beforeConflict);
    expect(
      repository
        .read()
        .departmentFlows?.find((candidate) => candidate.id === model.id),
    ).toEqual(winner);
  });
});

describe("company onboarding creation and immutable snapshots", () => {
  it("starts only the first sector and copies the model version and assignments", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    expect(run).toMatchObject({
      flowId: model.id,
      flowVersion: 1,
      companyId: "company-1",
      status: "active",
      blockRecurring: true,
    });
    expect(run.stages.map((stage) => stage.status)).toEqual([
      "active",
      "blocked",
      "blocked",
    ]);
    expect(run.stages.map((stage) => stage.assigneeId)).toEqual([
      fiscal.userId,
      payroll.userId,
      accounting.userId,
    ]);
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run.id),
    ).toHaveLength(1);
    expect(currentTask(run)).toMatchObject({
      onboardingId: run.id,
      onboardingStageId: "fiscal",
      department: "Fiscal",
      evidenceRequired: false,
      status: "todo",
      assigneeId: fiscal.userId,
    });
    expect(currentTask(run).steps.every((step) => !step.completed)).toBe(true);
  });

  it("requires the companies management grant even from an administrator", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const denied = {
      ...administrator,
      permissions: ["companies.view"] as Actor["permissions"],
    };
    const before = repository.read();
    refuse(
      () => engine.startCompanyOnboarding(denied, startInput(model)),
      "FORBIDDEN",
      403,
    );
    expect(repository.read()).toEqual(before);
  });

  it("requires scope over every sector when configuring an onboarding", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const scoped = {
      ...administrator,
      departments: ["Fiscal"] as Actor["departments"],
    };
    const before = repository.read();
    refuse(() => engine.startCompanyOnboarding(scoped, startInput(model)));
    expect(repository.read()).toEqual(before);
  });

  it("does not silently start a different model version", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    engine.updateDepartmentFlow(administrator, model.id, updateInput(model));
    const before = repository.read();
    refuse(
      () => engine.startCompanyOnboarding(administrator, startInput(model)),
      "CONFLICT",
      409,
    );
    expect(repository.read()).toEqual(before);
  });

  it("rejects disabled models and inactive companies without creating tasks", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const disabled = engine.updateDepartmentFlow(
      administrator,
      model.id,
      updateInput(model, { active: false }),
    );
    const before = repository.read();
    refuse(() =>
      engine.startCompanyOnboarding(administrator, startInput(disabled)),
    );
    expect(repository.read()).toEqual(before);
    const restored = engine.updateDepartmentFlow(
      administrator,
      model.id,
      updateInput(disabled, { active: true }),
    );
    const state = repository.read();
    state.companies[0]!.active = false;
    repository.replace(state);
    const beforeInactive = repository.read();
    refuse(() =>
      engine.startCompanyOnboarding(administrator, startInput(restored)),
    );
    expect(repository.read()).toEqual(beforeInactive);
  });

  it.each([
    "inactive",
    "foreign tenant",
    "wrong department",
    "missing execution grant",
  ] as const)("rejects an assignee with %s atomically", (reason) => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const state = repository.read();
    const candidate = state.users.find(
      (user) => user.userId === payroll.userId,
    )!;
    if (reason === "inactive") candidate.active = false;
    if (reason === "foreign tenant") candidate.tenantId = "foreign-tenant";
    if (reason === "wrong department") candidate.departments = ["Fiscal"];
    if (reason === "missing execution grant")
      candidate.permissions = ["tasks.view"];
    repository.replace(state);
    const before = repository.read();
    refuse(
      () => engine.startCompanyOnboarding(administrator, startInput(model)),
      "INVALID_ASSIGNEE",
    );
    expect(repository.read()).toEqual(before);
  });

  it.each([
    ["missing assignment", { fiscal: "julia", pessoal: "pessoal-test" }],
    [
      "unknown stage assignment",
      {
        fiscal: "julia",
        pessoal: "pessoal-test",
        contabil: "contabil-test",
        other: "julia",
      },
    ],
  ])("rejects %s", (_label, assignments) => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const before = repository.read();
    refuse(
      () =>
        engine.startCompanyOnboarding(
          administrator,
          startInput(model, { assignments }),
        ),
      "INVALID_ASSIGNEE",
    );
    expect(repository.read()).toEqual(before);
  });

  it("prevents duplicate active onboardings without duplicating the first task", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    engine.startCompanyOnboarding(administrator, startInput(model));
    const before = repository.read();
    refuse(
      () => engine.startCompanyOnboarding(administrator, startInput(model)),
      "DUPLICATE_ONBOARDING",
      409,
    );
    expect(repository.read()).toEqual(before);
  });

  it("preserves running stage snapshots when the manager changes the model", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const originalRun = onboarding(run.id);
    const originalTask = currentTask(run);
    engine.updateDepartmentFlow(
      administrator,
      model.id,
      updateInput(model, {
        title: "Modelo posterior",
        stages: [...model.stages].reverse().map((stage) => ({
          ...stage,
          title: `Etapa revisada ${stage.title}`,
          legalDays: 10,
        })),
      }),
    );
    expect(onboarding(run.id)).toEqual(originalRun);
    expect(currentTask(run)).toEqual(originalTask);
    finish(fiscal, originalTask);
    expect(currentTask(run).department).toBe("Pessoal");
    expect(currentTask(run).title).toContain(originalRun.stages[1]!.title);
    expect(currentTask(run).steps.map((step) => step.title)).toEqual(
      originalRun.stages[1]!.workflowSteps.map((step) => step.title),
    );
  });

  it("creates the company and onboarding as a single operation", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const { companyId: _ignored, ...configuration } = startInput(model, {
      blockRecurring: false,
    });
    const input: CreateCompany = {
      name: "Empresa fictícia em implantação",
      cnpj: cnpjFromBase("000000990001"),
      regime: "Simples Nacional",
      city: "Campinas / SP",
      ownerId: fiscal.userId,
      onboarding: configuration,
    };
    const before = repository.read();
    refuse(
      () =>
        engine.addCompany(administrator, {
          ...input,
          onboarding: {
            ...configuration,
            assignments: {
              ...configuration.assignments,
              pessoal: "unavailable",
            },
          },
        }),
      "INVALID_ASSIGNEE",
    );
    expect(repository.read()).toEqual(before);
    const company = engine.addCompany(administrator, input);
    const run = repository
      .read()
      .companyOnboardings?.find(
        (candidate) => candidate.companyId === company.id,
      );
    expect(run).toMatchObject({ blockRecurring: false, status: "active" });
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run!.id),
    ).toHaveLength(1);
  });
});

describe("department handoff and recurring task rules", () => {
  it("keeps the onboarding responsible person in sync when its active task is reassigned", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const current = currentTask(run);
    engine.command(administrator, current.id, {
      type: "assign",
      expectedRevision: current.revision,
      assigneeId: administrator.userId,
    });
    expect(task(current.id).assigneeId).toBe(administrator.userId);
    expect(onboarding(run.id).stages[0]!.assigneeId).toBe(administrator.userId);
  });

  it("rolls back completion and audit when the next responsible person loses execution access", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const ready = prepare(fiscal, currentTask(run));
    const changedState = repository.read();
    changedState.users.find(
      (user) => user.userId === payroll.userId,
    )!.permissions = ["tasks.view"];
    repository.replace(changedState);
    const beforeFailedHandoff = repository.read();
    refuse(
      () =>
        engine.command(fiscal, ready.id, {
          type: "complete",
          expectedRevision: ready.revision,
        }),
      "INVALID_ASSIGNEE",
    );
    expect(repository.read()).toEqual(beforeFailedHandoff);
    expect(onboarding(run.id).stages[0]!.status).toBe("active");
    expect(task(ready.id).status).toBe("in_progress");

    const repairedState = repository.read();
    repairedState.users.find(
      (user) => user.userId === payroll.userId,
    )!.permissions = [...payroll.permissions!];
    repository.replace(repairedState);
    engine.command(fiscal, ready.id, {
      type: "complete",
      expectedRevision: ready.revision,
    });
    expect(onboarding(run.id).stages[1]!.status).toBe("active");
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run.id),
    ).toHaveLength(2);
  });

  it("keeps unauthorized people from executing another department's active task", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    finish(fiscal, currentTask(run));
    const target = currentTask(run);
    const before = repository.read();
    refuse(
      () =>
        engine.command(fiscal, target.id, {
          type: "start",
          expectedRevision: target.revision,
        }),
      "NOT_FOUND",
      404,
    );
    const withoutExecution = {
      ...payroll,
      permissions: ["tasks.view"] as Actor["permissions"],
    };
    refuse(
      () =>
        engine.command(withoutExecution, target.id, {
          type: "start",
          expectedRevision: target.revision,
        }),
      "FORBIDDEN",
      403,
    );
    expect(repository.read()).toEqual(before);
  });

  it("does not reveal a multi department flow or its other sector assignments in a single sector snapshot", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const limited: Actor = {
      ...fiscal,
      permissions: [...fiscal.permissions!, "templates.view", "companies.view"],
    };
    const snapshot = engine.snapshot(limited);
    expect(
      snapshot.tasks.some((candidate) => candidate.onboardingId === run.id),
    ).toBe(true);
    expect(snapshot.departmentFlows).toEqual([]);
    expect(snapshot.companyOnboardings).toEqual([]);
    const foreign = engine.snapshot({
      ...administrator,
      tenantId: "foreign-tenant",
    });
    expect(foreign.departmentFlows).toEqual([]);
    expect(foreign.companyOnboardings).toEqual([]);
    expect(foreign.tasks).toEqual([]);
  });

  it("runs sectors sequentially and ends only after the final task is completed", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const originalHistory = repository
      .read()
      .tasks.filter((candidate) => !candidate.onboardingId);
    finish(fiscal, currentTask(run));
    expect(onboarding(run.id).stages.map((stage) => stage.status)).toEqual([
      "done",
      "active",
      "blocked",
    ]);
    expect(currentTask(run).department).toBe("Pessoal");
    finish(payroll, currentTask(run));
    expect(onboarding(run.id).stages.map((stage) => stage.status)).toEqual([
      "done",
      "done",
      "active",
    ]);
    finish(accounting, currentTask(run));
    expect(onboarding(run.id)).toMatchObject({
      status: "completed",
      completedAt: DEMO_NOW,
    });
    expect(
      onboarding(run.id).stages.every((stage) => stage.status === "done"),
    ).toBe(true);
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run.id),
    ).toHaveLength(3);
    expect(
      repository.read().tasks.filter((candidate) => !candidate.onboardingId),
    ).toEqual(originalHistory);
  });

  it("keeps downstream stages blocked while waiting for the client or requesting a dispense", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    let current = currentTask(run);
    current = engine.command(fiscal, current.id, {
      type: "start",
      expectedRevision: current.revision,
    });
    current = engine.command(fiscal, current.id, {
      type: "wait",
      expectedRevision: current.revision,
      reason: "Aguardando informações do cliente.",
    });
    current = engine.command(fiscal, current.id, {
      type: "request_dispense",
      expectedRevision: current.revision,
      reason: "Solicitação pendente de validação.",
    });
    expect(current.status).toBe("waiting");
    expect(onboarding(run.id).stages.map((stage) => stage.status)).toEqual([
      "active",
      "blocked",
      "blocked",
    ]);
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run.id),
    ).toHaveLength(1);
  });

  it("activates the next sector only after independent review is approved", () => {
    const input = modelInput();
    input.stages[0]!.requiresReview = true;
    input.stages[0]!.requiredDocument = "Evidência da parametrização";
    const model = engine.createDepartmentFlow(administrator, input);
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    let current = prepare(fiscal, currentTask(run));
    current = engine.command(fiscal, current.id, {
      type: "submit",
      expectedRevision: current.revision,
    });
    expect(current.status).toBe("in_review");
    expect(onboarding(run.id).stages[1]!.taskId).toBeUndefined();
    const reviewer: Actor = {
      ...fiscal,
      permissions: [...fiscal.permissions!, "tasks.review"],
    };
    const beforeSelfReview = repository.read();
    refuse(
      () =>
        engine.command(reviewer, current.id, {
          type: "approve",
          expectedRevision: current.revision,
        }),
      "SELF_REVIEW",
      403,
    );
    expect(repository.read()).toEqual(beforeSelfReview);
    current = engine.command(administrator, current.id, {
      type: "return",
      expectedRevision: current.revision,
      reason: "Ajustar os parâmetros antes da conclusão.",
    });
    expect(onboarding(run.id).stages[1]!.taskId).toBeUndefined();
    finish(fiscal, current);
    expect(onboarding(run.id).stages[1]!.status).toBe("active");
  });

  it("passes to the next sector when a permitted manager dispenses the current task", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const current = currentTask(run);
    const result = engine.command(
      { ...administrator, role: "operator" },
      current.id,
      {
        type: "dispense",
        expectedRevision: current.revision,
        reason: "Etapa não aplicável a esta empresa fictícia.",
      },
    );
    expect(result.status).toBe("dispensed");
    expect(onboarding(run.id).stages[1]!.status).toBe("active");
  });

  it("does not recreate a downstream task when a command is retried with a stale revision", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const ready = prepare(fiscal, currentTask(run));
    engine.command(fiscal, ready.id, {
      type: "complete",
      expectedRevision: ready.revision,
    });
    const beforeRetry = repository.read();
    refuse(
      () =>
        engine.command(fiscal, ready.id, {
          type: "complete",
          expectedRevision: ready.revision,
        }),
      "CONFLICT",
      409,
    );
    expect(repository.read()).toEqual(beforeRetry);
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run.id),
    ).toHaveLength(2);
  });

  it("prevents reopening a task whose handoff has already activated the next sector", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    const completed = finish(fiscal, currentTask(run));
    const before = repository.read();
    refuse(
      () =>
        engine.command(administrator, completed.id, {
          type: "reopen",
          expectedRevision: completed.revision,
          reason: "Tentativa de invalidar uma passagem já efetuada.",
        }),
      "HANDOFF_LOCKED",
      409,
    );
    expect(repository.read()).toEqual(before);
  });

  it("derives each sector deadline from its actual activation date", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(administrator, startInput(model));
    expect(currentTask(run)).toMatchObject({
      internalDue: "2026-10-08",
      legalDue: "2026-10-10",
    });
    now = "2026-10-20T10:00:00-03:00";
    finish(fiscal, currentTask(run));
    expect(currentTask(run)).toMatchObject({
      internalDue: "2026-10-22",
      legalDue: "2026-10-25",
    });
  });

  it.each(["0000-01", "10000-01", "2026-13", "2026-1"])(
    "rejects unsupported competence %s atomically",
    (competence) => {
      const model = engine.createDepartmentFlow(administrator, modelInput());
      const before = repository.read();
      refuse(
        () =>
          engine.startCompanyOnboarding(
            administrator,
            startInput(model, { competence }),
          ),
        "INVALID_ONBOARDING",
      );
      expect(repository.read()).toEqual(before);
    },
  );

  it("rejects deadlines beyond the ISO calendar without persisting an onboarding", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    now = "9999-12-31T10:00:00-03:00";
    const before = repository.read();
    refuse(() =>
      engine.startCompanyOnboarding(
        administrator,
        startInput(model, { competence: "9999-12" }),
      ),
    );
    expect(repository.read()).toEqual(before);
  });

  it("blocks new recurring tasks until onboarding finishes while preserving existing history", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(
      administrator,
      startInput(model, { blockRecurring: true }),
    );
    const history = repository
      .read()
      .tasks.filter((candidate) => !candidate.onboardingId);
    const blocked = engine.generate(administrator, "2026-10", "Fiscal");
    expect(blocked.created).toBe(0);
    expect(
      repository.read().tasks.filter((candidate) => !candidate.onboardingId),
    ).toEqual(history);
    finish(fiscal, currentTask(run));
    finish(payroll, currentTask(run));
    finish(accounting, currentTask(run));
    const allowed = engine.generate(administrator, "2026-10", "Fiscal");
    expect(allowed.created).toBeGreaterThan(0);
    const beforeRepeat = repository.read().tasks;
    expect(engine.generate(administrator, "2026-10", "Fiscal").created).toBe(0);
    expect(repository.read().tasks).toEqual(beforeRepeat);
    expect(
      history.every((previous) =>
        repository
          .read()
          .tasks.some(
            (candidate) =>
              candidate.id === previous.id &&
              JSON.stringify(candidate) === JSON.stringify(previous),
          ),
      ),
    ).toBe(true);
  });

  it("allows the manager to choose recurring work in parallel for the same flow", () => {
    const model = engine.createDepartmentFlow(administrator, modelInput());
    const run = engine.startCompanyOnboarding(
      administrator,
      startInput(model, { blockRecurring: false }),
    );
    const result = engine.generate(administrator, "2026-10", "Fiscal");
    expect(result.created).toBeGreaterThan(0);
    expect(onboarding(run.id).status).toBe("active");
    expect(onboarding(run.id).stages[1]!.status).toBe("blocked");
    expect(
      repository
        .read()
        .tasks.filter((candidate) => candidate.onboardingId === run.id),
    ).toHaveLength(1);
  });
});
