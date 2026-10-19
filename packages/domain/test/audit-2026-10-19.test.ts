import { beforeEach, describe, expect, it } from "vitest";
import {
  companyAtCompetence,
  cnpjFromBase,
  createSeed,
  createTvFeed,
  MemoryRepository,
  OPERATOR_PERMISSIONS,
  PERMISSIONS,
  PortalEngine,
  workspaceOf,
  xmlRuleMismatch,
} from "../src/index.js";
import type {
  Actor,
  Permission,
  PortalState,
  TaskCommand,
  TvDevice,
} from "../src/index.js";

// Regressions for the logic audit of 19/10/2026 (L01–L14).
const NOW = "2026-10-19T12:00:00-03:00";
const REVIEWER: Permission[] = [
  ...OPERATOR_PERMISSIONS,
  "tasks.review",
  "tasks.team.view",
];
let repository: MemoryRepository;
let engine: PortalEngine;
let clock = NOW;

function seed(): PortalState {
  const state = createSeed();
  const grants: Record<string, Permission[]> = {
    julia: REVIEWER,
    marina: REVIEWER,
    rafael: [...REVIEWER, "tasks.assign", "reports.view"],
    helena: [...PERMISSIONS],
  };
  for (const user of state.users) user.permissions = grants[user.userId] ?? [];
  state.users.push({
    userId: "carla",
    tenantId: "apice-demo",
    name: "Carla Souza",
    initials: "CS",
    role: "coordinator",
    departments: ["Contábil"],
    permissions: ["tasks.view", "companies.view", "companies.manage"],
  });
  return state;
}
beforeEach(() => {
  clock = NOW;
  repository = new MemoryRepository(seed());
  engine = new PortalEngine(repository, () => clock);
});
const actor = (id: string): Actor =>
  structuredClone(repository.read().users.find((u) => u.userId === id)!);
const task = (id: string) => repository.read().tasks.find((t) => t.id === id)!;
const run = (who: string, id: string, command: Record<string, unknown>) =>
  engine.command(actor(who), id, {
    expectedRevision: task(id).revision,
    ...command,
  } as TaskCommand);
const evidence = { name: "recibo.pdf", bytes: 10, kind: "PDF" as const };
function execute(who: string, id: string, attach = true) {
  if (task(id).status !== "in_progress") run(who, id, { type: "start" });
  for (const step of task(id).steps)
    run(who, id, { type: "step", stepId: step.id, completed: true });
  if (attach) engine.attach(actor(who), id, task(id).revision, evidence);
}
function fresh(owner = "julia", templateId?: string) {
  engine.generate(actor("helena"), "2026-10", "Fiscal");
  return repository
    .read()
    .tasks.find(
      (t) =>
        t.competence === "2026-10" &&
        t.assigneeId === owner &&
        t.requiresReview &&
        (!templateId || t.templateId === templateId) &&
        t.status === "todo",
    )!.id;
}

describe("L01 review segregation survives return and reopening", () => {
  it.each(["return", "reopen"] as const)(
    "the original executor cannot approve a redo after %s",
    (path) => {
      const id = fresh();
      execute("julia", id);
      run("julia", id, { type: "submit" });
      if (path === "return")
        run("rafael", id, { type: "return", reason: "Corrigir os valores" });
      else {
        run("rafael", id, { type: "approve" });
        run("helena", id, { type: "reopen", reason: "Cliente retificou" });
      }
      run("helena", id, { type: "assign", assigneeId: "marina" });
      execute("marina", id, false);
      run("marina", id, { type: "submit" });
      expect(() => run("julia", id, { type: "approve" })).toThrow(
        "outra pessoa",
      );
      expect(run("rafael", id, { type: "approve" }).status).toBe("done");
    },
  );
});

describe("L02 dispense requests can be denied and never linger", () => {
  it("denies with a reason and clears the request", () => {
    const id = fresh();
    run("julia", id, { type: "request_dispense", reason: "Sem movimento" });
    expect(() =>
      run("rafael", id, { type: "deny_dispense", reason: "Houve movimento" }),
    ).toThrow();
    const denied = run("helena", id, {
      type: "deny_dispense",
      reason: "Houve movimento no mês",
    });
    expect(denied.dispenseRequested).toBe(false);
    expect(engine.snapshot(actor("helena")).audit[0]!.action).toBe(
      "Dispensa negada",
    );
    expect(() =>
      run("helena", id, { type: "deny_dispense", reason: "Repetido agora" }),
    ).toThrow("pendente");
  });
  it("clears a pending request when the task is delivered", () => {
    const id = fresh();
    run("julia", id, { type: "request_dispense", reason: "Sem movimento" });
    execute("julia", id);
    run("julia", id, { type: "submit" });
    expect(run("rafael", id, { type: "approve" }).dispenseRequested).toBe(
      false,
    );
  });
});

describe("L03 work left with deactivated people", () => {
  it("lists tasks, portfolios and stages, and audits the generation substitute", () => {
    const state = repository.read();
    state.users.find((u) => u.userId === "julia")!.active = false;
    state.companies.find((c) => c.id === "company-2")!.responsibilities = {
      Fiscal: { mode: "person", userId: "julia" },
    };
    repository.replace(state);
    const report = engine.report(actor("helena"), {
      id: "inactive-owners",
      scope: "all",
      dateBasis: "recordedAt",
    });
    const kinds = new Set(report.rows.map((row) => row.cells.kind));
    expect(kinds).toEqual(new Set(["Tarefa aberta", "Carteira"]));
    expect(
      report.rows.every((row) => row.cells.person === "Júlia Martins"),
    ).toBe(true);
    expect(() =>
      engine.report(actor("julia"), {
        id: "inactive-owners",
        scope: "all",
        dateBasis: "recordedAt",
      }),
    ).toThrow();
    // company-1 has no explicit responsibilities: the substitute is recorded.
    engine.autoGenerate("apice-demo", "2026-11");
    expect(
      repository
        .read()
        .audit.some(
          (event) =>
            event.action === "Responsável substituto na geração" &&
            event.companyId === "company-1",
        ),
    ).toBe(true);
  });
  it("names the next onboarding stage whose responsible lost access", () => {
    const h = actor("helena");
    const stage = (id: string) => ({
      id,
      title: `Etapa ${id}`,
      department: "Fiscal",
      workflowSteps: [{ id: "s", title: "Passo" }],
      internalDays: 1,
      legalDays: 2,
      requiresReview: false,
      requiredDocument: "",
    });
    const flow = engine.createDepartmentFlow(h, {
      title: "Implantação curta",
      stages: [stage("a"), stage("b")],
    });
    const onboarding = engine.startCompanyOnboarding(h, {
      companyId: "company-1",
      flowId: flow.id,
      expectedFlowVersion: 1,
      competence: "2026-10",
      blockRecurring: false,
      assignments: { a: "julia", b: "marina" },
    });
    const state = repository.read();
    state.users.find((u) => u.userId === "marina")!.active = false;
    repository.replace(state);
    const id = onboarding.stages[0]!.taskId!;
    execute("julia", id, false);
    expect(() => run("julia", id, { type: "complete" })).toThrow("Etapa b");
  });
});

describe("L04 portfolio transfer follows the competence being worked", () => {
  it("defaults to the closed competence and refuses an earlier one", () => {
    const h = actor("helena");
    engine.transferCompanies(h, {
      companyIds: ["company-1"],
      department: "Fiscal",
      target: { mode: "person", userId: "marina" },
      transferOpenTasks: false,
      expectedRevisions: { "company-1": 1 },
    });
    const company = repository
      .read()
      .companies.find((c) => c.id === "company-1")!;
    expect(
      companyAtCompetence(company, "2026-09").responsibilities?.Fiscal?.userId,
    ).toBe("marina");
    expect(
      companyAtCompetence(company, "2026-08").responsibilities?.Fiscal,
    ).toBeUndefined();
    expect(() =>
      engine.transferCompanies(h, {
        companyIds: ["company-2"],
        department: "Fiscal",
        target: { mode: "person", userId: "marina" },
        transferOpenTasks: false,
        expectedRevisions: { "company-2": 1 },
        effectiveCompetence: "2026-08",
      }),
    ).toThrow("competência");
  });
});

describe("L05 closed tasks keep their responsible", () => {
  it("refuses to reassign a delivered task", () => {
    const id = fresh();
    execute("julia", id);
    run("julia", id, { type: "submit" });
    run("rafael", id, { type: "approve" });
    expect(() =>
      run("rafael", id, { type: "assign", assigneeId: "marina" }),
    ).toThrow("encerradas");
  });
});

describe("L06/L07 proposal decisions", () => {
  const propose = (companyId: string, patch: object, competence: string) =>
    engine.proposeCompanyChange(actor("helena"), {
      companyId,
      expectedRevision:
        repository.read().companies.find((c) => c.id === companyId)!.revision ??
        1,
      patch,
      effectiveCompetence: competence,
      reason: "Alteração de teste",
    });
  const decide = (id: string) =>
    engine.decideChangeProposal(actor("helena"), id, {
      expectedRevision: 1,
      decision: "approve",
    });
  it("does not create tasks of a future competence at approval", () => {
    decide(propose("company-6", { regime: "Lucro Real" }, "2027-03").id);
    expect(
      repository.read().tasks.some((t) => t.competence === "2027-03"),
    ).toBe(false);
  });
  it("keeps a second pending proposal of the same company decidable", () => {
    const a = propose("company-2", { regime: "Lucro Real" }, "2026-12");
    const b = propose(
      "company-2",
      { responsibilities: { Fiscal: { mode: "person", userId: "marina" } } },
      "2026-12",
    );
    decide(a.id);
    expect(decide(b.id).status).toBe("approved");
    const company = repository
      .read()
      .companies.find((c) => c.id === "company-2")!;
    const projected = companyAtCompetence(company, "2026-12");
    expect([
      projected.regime,
      projected.responsibilities?.Fiscal?.userId,
    ]).toEqual(["Lucro Real", "marina"]);
  });
  it("reports a missing responsible instead of blocking the decision", () => {
    const state = repository.read();
    state.users.find((u) => u.userId === "julia")!.active = false;
    state.companies.find((c) => c.id === "company-8")!.responsibilities = {
      Fiscal: { mode: "person", userId: "julia" },
    };
    repository.replace(state);
    // A new obligation leaves a task to create in the closed competence.
    engine.addTemplate(actor("helena"), {
      title: "Obrigação nova",
      description: "Obrigação criada no teste",
      department: "Fiscal",
      regime: "Todos",
      internalDay: 10,
      legalDay: 20,
      requiresReview: false,
      requiredDocument: "Recibo",
    });
    const proposal = propose(
      "company-8",
      { regime: "Lucro Presumido" },
      "2026-09",
    );
    expect(decide(proposal.id).status).toBe("approved");
    expect(
      repository
        .read()
        .audit.some((e) => e.action === "Geração da alteração com pendências"),
    ).toBe(true);
  });
});

describe("L08 closing requires the last competence", () => {
  it("refuses closing without an end on registration and proposals", () => {
    const h = actor("helena");
    const input = {
      name: "Empresa em encerramento",
      cnpj: cnpjFromBase("000009900001"),
      regime: "Simples Nacional" as const,
      city: "São Paulo / SP",
      ownerId: "julia",
      status: "closing",
    };
    expect(() => engine.addCompany(h, input)).toThrow("última competência");
    expect(
      engine.addCompany(h, { ...input, serviceEndCompetence: "2026-12" })
        .status,
    ).toBe("closing");
    expect(() =>
      engine.proposeCompanyChange(h, {
        companyId: "company-7",
        expectedRevision: 1,
        patch: { status: "closing" },
        effectiveCompetence: "2026-11",
        reason: "Encerramento previsto",
      }),
    ).toThrow("última competência");
  });
});

describe("L09–L13 reports, TV, scope and commands", () => {
  it("productivity activities exclude cancelled tasks", () => {
    const id = repository
      .read()
      .tasks.find((t) => t.status === "todo" && t.department === "Fiscal")!.id;
    run("helena", id, { type: "cancel", reason: "Duplicidade de teste" });
    const report = engine.report(actor("helena"), {
      id: "productivity",
      scope: "department",
      department: "Fiscal",
      dateBasis: "competence",
      competence: "2026-09",
    });
    const sum = (key: string) =>
      report.rows.reduce((total, row) => total + Number(row.cells[key]), 0);
    expect(sum("total")).toBe(sum("done") + sum("dispensed") + sum("open"));
    expect(sum("cancelled")).toBe(1);
  });
  it("TV labels the department queue as a queue", () => {
    const state = repository.read();
    state.tasks[0]!.assigneeId = `department:${state.tasks[0]!.department}`;
    const device: TvDevice = {
      id: "tv",
      tenantId: "apice-demo",
      name: "TV",
      departments: ["Fiscal"],
      competence: "2026-09",
      active: true,
      showNames: false,
      blocks: ["upcoming", "collaborators"],
      rotationSeconds: 10,
      version: 1,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    };
    const labels = createTvFeed(state, device, NOW).upcoming.map(
      (item) => item.responsibleLabel,
    );
    expect(labels).toContain("Fila · Fiscal");
    expect(labels).not.toContain("Responsável indisponível");
  });
  it("snapshot shows proposals only to the affected sectors", () => {
    engine.proposeCompanyChange(actor("helena"), {
      companyId: "company-9",
      expectedRevision: 1,
      patch: {
        responsibilities: { Fiscal: { mode: "person", userId: "marina" } },
      },
      effectiveCompetence: "2026-11",
      reason: "Troca de carteira Fiscal",
    });
    expect(engine.snapshot(actor("carla")).changeProposals).toHaveLength(0);
    expect(engine.snapshot(actor("helena")).changeProposals).toHaveLength(1);
  });
  it("rejects unknown commands without touching the task", () => {
    const id = fresh();
    expect(() => run("julia", id, { type: "qualquer" })).toThrow(
      "desconhecida",
    );
    expect(task(id).revision).toBe(1);
  });
  it("undoing a cancellation restores the previous status", () => {
    const id = fresh();
    run("helena", id, { type: "cancel", reason: "Cancelamento indevido" });
    const reopened = run("helena", id, {
      type: "reopen",
      reason: "Cancelamento indevido",
    });
    expect([
      reopened.status,
      reopened.cancelled,
      reopened.reopenedCount,
    ]).toEqual(["todo", undefined, 0]);
  });
});

describe("L14 XML evidence must match the rule fields on the server", () => {
  const rules = [
    {
      id: "r1",
      name: "Recibo DCTF",
      templateIds: ["dctf"],
      documentTypeIds: ["receipt"],
      required: true,
      keywords: [],
      fields: ["cnpj", "competence"] as ("cnpj" | "competence")[],
      active: true,
    },
  ];
  const xml = (cnpj: string, competence: string) =>
    `<recibo><CNPJ>${cnpj}</CNPJ><competencia>${competence}</competencia></recibo>`;
  it("accepts the right company/competence and refuses another company", () => {
    const company = repository.read().companies[0]!;
    const base = {
      task: { templateId: "dctf", competence: "2026-10" },
      companyCnpj: company.cnpj,
      documentTypeId: "receipt",
      fileName: "recibo.xml",
      rules,
    };
    expect(xmlRuleMismatch(xml(company.cnpj, "2026-10"), base)).toBeUndefined();
    expect(
      xmlRuleMismatch(xml(cnpjFromBase("999999990001"), "2026-10"), base),
    ).toContain("CNPJ");
    expect(xmlRuleMismatch(xml(company.cnpj, "2026-09"), base)).toContain(
      "2026-10",
    );
    expect(
      xmlRuleMismatch(xml(company.cnpj, "2026-09"), {
        ...base,
        documentTypeId: "guide",
      }),
    ).toBeUndefined();
  });
  it("engine refuses a mismatched XML attachment", () => {
    const ws = workspaceOf(repository.read(), "apice-demo");
    engine.updateWorkspaceSettings(actor("helena"), {
      expectedRevision: ws.revision,
      documentRules: rules,
    });
    const id = fresh("julia", "dctf");
    run("julia", id, { type: "start" });
    const t = task(id);
    const other = cnpjFromBase("999999990001");
    const bytes = new TextEncoder().encode(xml(other, t.competence));
    const attach = () =>
      engine.attach(
        actor("julia"),
        id,
        task(id).revision,
        {
          name: "recibo.xml",
          bytes: bytes.length,
          kind: "XML",
          documentTypeId: "receipt",
        },
        bytes,
      );
    expect(attach).toThrow("CNPJ");
  });
});
