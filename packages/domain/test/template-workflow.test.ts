import { beforeEach, describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  DomainError,
  getTemplateWorkflow,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
  templateSchema,
  templateWorkflowSchema,
  updateTemplateSchema,
} from "../src/index.js";
import type {
  Actor,
  CreateTemplate,
  TaskTemplate,
  UpdateTemplate,
  WorkflowStep,
} from "../src/index.js";

const flow: WorkflowStep[] = [
  { id: "receive", title: "Receber documentos" },
  { id: "reconcile", title: "Conciliar os lançamentos" },
  { id: "deliver", title: "Entregar relatório" },
];
const input: CreateTemplate = {
  title: "Conciliação personalizada",
  description: "Rotina fictícia com etapas configuráveis.",
  department: "Fiscal",
  regime: "Todos",
  internalDay: 10,
  legalDay: 20,
  requiresReview: true,
  requiredDocument: "Relatório de conciliação",
  workflowSteps: flow,
};
let engine: PortalEngine;
let repository: MemoryRepository;
let administrator: Actor;
let operator: Actor;
let reader: Actor;

function update(
  model: TaskTemplate,
  patch: Partial<UpdateTemplate> = {},
): UpdateTemplate {
  return {
    title: model.title,
    description: model.description,
    department: model.department,
    regime: model.regime,
    internalDay: model.internalDay,
    legalDay: model.legalDay,
    requiresReview: model.requiresReview,
    requiredDocument: model.requiredDocument,
    workflowSteps: getTemplateWorkflow(model),
    expectedVersion: model.version,
    ...patch,
  };
}

function expectDomainError(
  action: () => unknown,
  code: string,
  status: number,
) {
  try {
    action();
    throw new Error("A operação deveria ser recusada.");
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code, status });
  }
}

beforeEach(() => {
  const state = createSeed();
  administrator = {
    ...state.users.find((user) => user.userId === "helena")!,
    permissions: [...PERMISSIONS],
  };
  operator = {
    ...state.users.find((user) => user.userId === "julia")!,
    permissions: [
      "templates.view",
      "templates.manage",
      "tasks.view",
      "tasks.execute",
      "tasks.attach",
      "tasks.review",
    ],
  };
  reader = {
    ...state.users.find((user) => user.userId === "marina")!,
    permissions: ["templates.view", "tasks.view"],
  };
  state.users = state.users.map((user) =>
    structuredClone(
      [administrator, operator, reader].find(
        (actor) => actor.userId === user.userId,
      ) ?? user,
    ),
  );
  repository = new MemoryRepository(state);
  engine = new PortalEngine(repository, () => DEMO_NOW);
});

describe("template workflow validation", () => {
  it("accepts one to thirty steps and trims their titles", () => {
    expect(
      templateWorkflowSchema.parse([{ id: "a", title: "  Ab  " }]),
    ).toEqual([{ id: "a", title: "Ab" }]);
    expect(
      templateWorkflowSchema.safeParse(
        Array.from({ length: 30 }, (_, index) => ({
          id: `step_${index}-a`,
          title: "Etapa".padEnd(120, "a"),
        })),
      ).success,
    ).toBe(true);
    expect(
      templateWorkflowSchema.safeParse([{ id: "a".repeat(80), title: "Etapa" }])
        .success,
    ).toBe(true);
  });

  it.each([
    ["empty", []],
    [
      "too many",
      Array.from({ length: 31 }, (_, index) => ({
        id: `s${index}`,
        title: "Etapa",
      })),
    ],
    [
      "duplicate identifiers",
      [
        { id: "same", title: "Primeira" },
        { id: "same", title: "Segunda" },
      ],
    ],
    ["empty identifier", [{ id: "", title: "Etapa" }]],
    ["long identifier", [{ id: "a".repeat(81), title: "Etapa" }]],
    ["path identifier", [{ id: "../admin", title: "Etapa" }]],
    ["html identifier", [{ id: "<script>", title: "Etapa" }]],
    ["space identifier", [{ id: "bad id", title: "Etapa" }]],
    ["blank title", [{ id: "valid", title: "  " }]],
    ["short title", [{ id: "valid", title: " a " }]],
    ["long title", [{ id: "valid", title: "a".repeat(121) }]],
    [
      "injected completed state",
      [{ id: "valid", title: "Etapa", completed: true }],
    ],
    [
      "injected authority",
      [{ id: "valid", title: "Etapa", tenantId: "foreign", role: "admin" }],
    ],
  ])("rejects %s", (_label, steps) => {
    expect(templateWorkflowSchema.safeParse(steps).success).toBe(false);
  });

  it("keeps legacy create compatible but requires an explicit workflow and version for update", () => {
    const legacyInput = { ...input };
    delete legacyInput.workflowSteps;
    expect(templateSchema.safeParse(legacyInput).success).toBe(true);
    expect(
      updateTemplateSchema.safeParse({ ...legacyInput, expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      updateTemplateSchema.safeParse({ ...input, expectedVersion: 1 }).success,
    ).toBe(true);
    expect(
      updateTemplateSchema.safeParse({ ...input, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      updateTemplateSchema.safeParse({ ...input, expectedVersion: 1.5 })
        .success,
    ).toBe(false);
    expect(updateTemplateSchema.safeParse(input).success).toBe(false);
  });

  it.each(["tenantId", "version", "active", "id", "role"])(
    "rejects client-injected %s on create and update",
    (field) => {
      expect(
        templateSchema.safeParse({ ...input, [field]: "injected" }).success,
      ).toBe(false);
      expect(
        updateTemplateSchema.safeParse({
          ...input,
          expectedVersion: 1,
          [field]: "injected",
        }).success,
      ).toBe(false);
    },
  );

  it("retains the internal deadline rule alongside custom workflow validation", () => {
    expect(
      updateTemplateSchema.safeParse({
        ...input,
        internalDay: 21,
        legalDay: 20,
        expectedVersion: 1,
      }).success,
    ).toBe(false);
  });
});

describe("configurable workflow authorization and snapshots", () => {
  it("allows an operator with an explicit grant to create and edit without a role ceiling", () => {
    const model = engine.addTemplate(operator, input);
    const changed = engine.updateTemplate(
      operator,
      model.id,
      update(model, {
        workflowSteps: [flow[2]!, flow[0]!],
        title: "Conciliação revisada",
      }),
    );
    expect(changed).toMatchObject({
      title: "Conciliação revisada",
      version: 2,
    });
    expect(changed.workflowSteps).toEqual([flow[2], flow[0]]);
  });

  it("denies create and edit without the grant even to an administrator", () => {
    const model = engine.addTemplate(administrator, input);
    for (const actor of [
      reader,
      {
        ...administrator,
        permissions: ["templates.view"] as Actor["permissions"],
      },
    ]) {
      const before = repository.read();
      expectDomainError(
        () => engine.addTemplate(actor, input),
        "FORBIDDEN",
        403,
      );
      expectDomainError(
        () => engine.updateTemplate(actor, model.id, update(model)),
        "FORBIDDEN",
        403,
      );
      expect(repository.read()).toEqual(before);
    }
  });

  it("isolates tenants and departments and does not disclose their models", () => {
    const model = engine.addTemplate(administrator, input);
    const accounting = engine.addTemplate(administrator, {
      ...input,
      department: "Contábil",
    });
    const before = repository.read();
    expectDomainError(
      () =>
        engine.updateTemplate(
          { ...operator, tenantId: "foreign" },
          model.id,
          update(model),
        ),
      "NOT_FOUND",
      404,
    );
    expectDomainError(
      () => engine.updateTemplate(operator, accounting.id, update(accounting)),
      "NOT_FOUND",
      404,
    );
    expectDomainError(
      () => engine.addTemplate(operator, { ...input, department: "Contábil" }),
      "FORBIDDEN",
      403,
    );
    expect(
      engine
        .snapshot(operator)
        .templates.some((template) => template.id === accounting.id),
    ).toBe(false);
    expect(repository.read()).toEqual(before);
  });

  it("does not move a model to another department even for an administrator", () => {
    const model = engine.addTemplate(administrator, input);
    const before = repository.read();
    expectDomainError(
      () =>
        engine.updateTemplate(
          administrator,
          model.id,
          update(model, { department: "Contábil" }),
        ),
      "INVALID_DEPARTMENT",
      422,
    );
    expect(repository.read()).toEqual(before);
  });

  it("validates direct domain calls and rolls back malformed workflows", () => {
    const model = engine.addTemplate(administrator, input);
    const before = repository.read();
    expectDomainError(
      () => engine.addTemplate(administrator, { ...input, workflowSteps: [] }),
      "INVALID_TEMPLATE",
      422,
    );
    expectDomainError(
      () =>
        engine.updateTemplate(
          administrator,
          model.id,
          update(model, { workflowSteps: [flow[0]!, flow[0]!] }),
        ),
      "INVALID_TEMPLATE",
      422,
    );
    expect(repository.read()).toEqual(before);
  });

  it("rejects a stale version without overwriting the winner or adding an audit event", () => {
    const model = engine.addTemplate(administrator, input);
    const winner = engine.updateTemplate(
      administrator,
      model.id,
      update(model, { title: "Alteração vencedora" }),
    );
    const beforeConflict = repository.read();
    expectDomainError(
      () =>
        engine.updateTemplate(
          administrator,
          model.id,
          update(model, { title: "Alteração atrasada" }),
        ),
      "CONFLICT",
      409,
    );
    expect(repository.read()).toEqual(beforeConflict);
    expect(
      repository.read().templates.find((template) => template.id === model.id),
    ).toEqual(winner);
  });

  it("records scoped immutable before and after versions of the workflow", () => {
    const model = engine.addTemplate(administrator, input);
    const changed = engine.updateTemplate(
      administrator,
      model.id,
      update(model, { workflowSteps: [flow[1]!] }),
    );
    const event = repository
      .read()
      .audit.find(
        (entry) => entry.templateId === model.id && entry.beforeTemplate,
      )!;
    expect(event).toMatchObject({
      tenantId: administrator.tenantId,
      department: "Fiscal",
      actorId: administrator.userId,
    });
    expect(event.beforeTemplate?.workflowSteps).toEqual(flow);
    expect(event.afterTemplate?.workflowSteps).toEqual([flow[1]]);
    expect(event.beforeTemplate?.version).toBe(1);
    expect(event.afterTemplate?.version).toBe(2);
    engine.updateTemplate(
      administrator,
      model.id,
      update(changed, { workflowSteps: [flow[2]!] }),
    );
    expect(
      repository.read().audit.find((entry) => entry.id === event.id),
    ).toEqual(event);
  });

  it("copies configured and legacy workflows without sharing mutable arrays", () => {
    const configured = { workflowSteps: structuredClone(flow) };
    const copy = getTemplateWorkflow(configured);
    copy[0]!.title = "Alterado fora do modelo";
    copy.reverse();
    expect(configured.workflowSteps).toEqual(flow);
    const legacy = getTemplateWorkflow({});
    expect(legacy).toHaveLength(3);
    legacy[0]!.title = "Alterado fora do padrão";
    legacy.pop();
    expect(getTemplateWorkflow({})).toHaveLength(3);
    expect(getTemplateWorkflow({})[0]!.title).not.toBe(
      "Alterado fora do padrão",
    );
  });

  it("generates the custom order and version without mutating existing task snapshots", () => {
    const model = engine.addTemplate(administrator, input);
    engine.generate(administrator, "2026-10", "Fiscal");
    const original = repository
      .read()
      .tasks.filter((task) => task.templateId === model.id);
    expect(original.length).toBeGreaterThan(1);
    expect(
      original.every(
        (task) =>
          task.templateVersion === 1 &&
          task.steps.every((step) => !step.completed),
      ),
    ).toBe(true);
    expect(original[0]!.steps.map(({ id, title }) => ({ id, title }))).toEqual(
      flow,
    );
    const newFlow = [flow[2]!, { id: "archive", title: "Arquivar relatório" }];
    const changed = engine.updateTemplate(
      administrator,
      model.id,
      update(model, { workflowSteps: newFlow }),
    );
    const repeat = engine.generate(administrator, "2026-10", "Fiscal");
    expect(repeat.created).toBe(0);
    expect(
      repository.read().tasks.filter((task) => task.templateId === model.id),
    ).toEqual(original);
    engine.generate(administrator, "2026-11", "Fiscal");
    const next = repository
      .read()
      .tasks.filter(
        (task) => task.templateId === model.id && task.competence === "2026-11",
      );
    expect(next).toHaveLength(original.length);
    expect(next.every((task) => task.templateVersion === changed.version)).toBe(
      true,
    );
    expect(next[0]!.steps.map(({ id, title }) => ({ id, title }))).toEqual(
      newFlow,
    );
    const executing = engine.command(operator, next[0]!.id, {
      type: "start",
      expectedRevision: next[0]!.revision,
    });
    engine.command(operator, executing.id, {
      type: "step",
      stepId: executing.steps[0]!.id,
      completed: true,
      expectedRevision: executing.revision,
    });
    expect(
      repository.read().tasks.find((task) => task.id === next[1]!.id)?.steps[0]!
        .completed,
    ).toBe(false);
  });

  it("retains mandatory evidence and review by another person with custom steps", () => {
    const model = engine.addTemplate(administrator, {
      ...input,
      workflowSteps: [flow[1]!],
    });
    engine.generate(administrator, "2026-10", "Fiscal");
    let task = repository
      .read()
      .tasks.find(
        (candidate) =>
          candidate.templateId === model.id &&
          candidate.assigneeId === operator.userId,
      )!;
    task = engine.command(operator, task.id, {
      type: "start",
      expectedRevision: task.revision,
    });
    expectDomainError(
      () =>
        engine.command(operator, task.id, {
          type: "submit",
          expectedRevision: task.revision,
        }),
      "MISSING_STEPS",
      422,
    );
    task = engine.command(operator, task.id, {
      type: "step",
      stepId: task.steps[0]!.id,
      completed: true,
      expectedRevision: task.revision,
    });
    expectDomainError(
      () =>
        engine.command(operator, task.id, {
          type: "submit",
          expectedRevision: task.revision,
        }),
      "MISSING_DOCUMENT",
      422,
    );
    task = engine.attach(operator, task.id, task.revision, {
      name: "evidencia.pdf",
      bytes: 100,
      kind: "PDF",
    });
    task = engine.command(operator, task.id, {
      type: "submit",
      expectedRevision: task.revision,
    });
    expect(task.status).toBe("in_review");
    expectDomainError(
      () =>
        engine.command(operator, task.id, {
          type: "approve",
          expectedRevision: task.revision,
        }),
      "SELF_REVIEW",
      403,
    );
    task = engine.command(administrator, task.id, {
      type: "approve",
      expectedRevision: task.revision,
    });
    expect(task.status).toBe("done");
    expect(task.steps).toEqual([{ ...flow[1], completed: true }]);
  });
});
