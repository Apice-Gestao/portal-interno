import { describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PortalEngine,
  PERMISSIONS,
  cnpjFromBase,
  defaultWorkspace,
  companyAtCompetence,
} from "../packages/domain/src/index.js";
import type {
  Actor,
  Company,
  CreateCompany,
  WorkspaceSettings,
} from "../packages/domain/src/index.js";
function fixture() {
  const state = createSeed();
  state.users = state.users.map((user) => ({
    ...user,
    active: true,
    permissions:
      user.userId === "helena"
        ? [...PERMISSIONS]
        : ["tasks.view", "tasks.execute", "tasks.attach", "tasks.comment"],
  }));
  const repository = new MemoryRepository(state);
  return {
    repository,
    engine: new PortalEngine(repository, () => DEMO_NOW),
    admin: state.users.find((user) => user.userId === "helena")!,
    operator: state.users[0]!,
  };
}
const request = (workspace: WorkspaceSettings) => ({
  expectedRevision: workspace.revision,
  departments: workspace.departments,
  accessProfiles: workspace.accessProfiles,
  documentTypes: workspace.documentTypes,
  documentRules: workspace.documentRules,
});
const companyInput = (
  overrides: Partial<CreateCompany> = {},
): CreateCompany => ({
  code: "00099",
  name: "Empresa fictícia completa",
  cnpj: cnpjFromBase("000000990001"),
  city: "São Paulo / SP",
  regime: "Simples Nacional",
  ownerId: "helena",
  responsibilities: {
    Fiscal: { mode: "department" },
    Contábil: { mode: "none" },
    Pessoal: { mode: "none" },
  },
  tags: ["Comércio"],
  ...overrides,
});
describe("workspace and operational feedback", () => {
  it("keeps settings isolated by tenant and protects configuration mutation", () => {
    const { engine, admin, operator } = fixture();
    const original = engine.snapshot(admin).workspace;
    expect(() =>
      engine.updateWorkspaceSettings(operator, {
        ...request(original),
        departments: [
          ...original.departments,
          { id: "legal", name: "Jurídico", active: true },
        ],
      }),
    ).toThrow();
    const saved = engine.updateWorkspaceSettings(admin, {
      ...request(original),
      departments: [
        ...original.departments,
        { id: "legal", name: "Jurídico", active: true },
      ],
    });
    expect(saved.revision).toBe(2);
    expect(
      engine.snapshot({ ...admin, tenantId: "foreign" }).workspace.departments,
    ).toHaveLength(3);
    expect(() =>
      engine.updateWorkspaceSettings(admin, request(original)),
    ).toThrow("mudaram");
  });
  it("prevents deleting departments used by historic tasks", () => {
    const { engine, admin } = fixture();
    const settings = engine.snapshot(admin).workspace;
    expect(() =>
      engine.updateWorkspaceSettings(admin, {
        ...request(settings),
        departments: settings.departments.filter(
          (item) => item.id !== "Fiscal",
        ),
      }),
    ).toThrow("histórico");
  });
  it("does not treat PostgreSQL JSON key order as an access-profile change", () => {
    const { engine, admin, repository } = fixture();
    const settings = engine.snapshot(admin).workspace;
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    const state = repository.read();
    state.workspaces = [reorder(settings) as WorkspaceSettings];
    repository.replace(state);
    const actor = {
      ...admin,
      permissions: [
        "documents.view",
        "documents.manage",
      ] as Actor["permissions"],
    };
    const saved = engine.updateWorkspaceSettings(actor, {
      ...request(settings),
      documentTypes: [
        ...settings.documentTypes,
        { id: "extra", name: "Documento adicional", formats: ["PDF"] },
      ],
    });
    expect(saved.revision).toBe(2);
    expect(saved.accessProfiles).toEqual(settings.accessProfiles);
  });
  it("keeps account templates independent of user identity and validates grants", () => {
    const { engine, admin, repository } = fixture();
    const settings = engine.snapshot(admin).workspace;
    const users = repository.read().users;
    const saved = engine.updateWorkspaceSettings(admin, {
      ...request(settings),
      accessProfiles: [
        {
          id: "custom-operator",
          name: "Operador com gestão",
          role: "operator",
          departments: ["Fiscal"],
          permissions: [...PERMISSIONS],
          homeView: "management",
        },
      ],
    });
    expect(saved.accessProfiles[0]!.permissions).toContain("users.manage");
    expect(repository.read().users).toEqual(users);
    expect(() =>
      engine.updateWorkspaceSettings(admin, {
        ...request(saved),
        accessProfiles: [
          { ...saved.accessProfiles[0]!, permissions: ["tasks.assign"] },
        ],
      }),
    ).toThrow("aba");
  });
  it("honors explicit action grants independently of job title", () => {
    const { engine, admin, repository } = fixture();
    const actor: Actor = {
      ...admin,
      role: "operator",
      permissions: ["tasks.view", "tasks.team.view", "tasks.assign"],
    };
    const task = repository
      .read()
      .tasks.find((item) => item.status === "todo")!;
    const updated = engine.command(actor, task.id, {
      type: "assign",
      expectedRevision: task.revision,
      assigneeId: "marina",
    });
    expect(updated.assigneeId).toBe("marina");
    expect(() =>
      engine.command(actor, task.id, {
        type: "dispense",
        expectedRevision: updated.revision,
        reason: "Dispensa sem autorização",
      }),
    ).toThrow();
  });
  it("preserves manual codes and routes new obligations to a departmental queue", () => {
    const { engine, admin, operator } = fixture();
    const company = engine.addCompany(admin, companyInput());
    expect(company.code).toBe("00099");
    engine.generate(admin, "2026-10", "Fiscal");
    const tasks = engine
      .snapshot(admin)
      .tasks.filter((item) => item.companyId === company.id);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.assigneeId === "department:Fiscal")).toBe(
      true,
    );
    expect(
      engine.snapshot(operator).tasks.some((task) => task.id === tasks[0]!.id),
    ).toBe(true);
    const claimed = engine.command(operator, tasks[0]!.id, {
      type: "start",
      expectedRevision: tasks[0]!.revision,
    });
    expect(claimed.assigneeId).toBe(operator.userId);
    expect(() =>
      engine.command({ ...operator, userId: "marina" }, claimed.id, {
        type: "start",
        expectedRevision: 1,
      }),
    ).toThrow();
  });
  it("never generates obligations for a department explicitly marked none", () => {
    const { engine, admin } = fixture();
    const company = engine.addCompany(admin, companyInput());
    engine.generate(admin, "2026-10", "Contábil");
    expect(
      engine
        .snapshot(admin)
        .tasks.some((task) => task.companyId === company.id),
    ).toBe(false);
  });
  it("validates full imports atomically, codes, scopes and identifiers", () => {
    const { engine, admin, repository } = fixture();
    const before = repository.read();
    expect(() =>
      engine.importCompanies(admin, [
        companyInput(),
        companyInput({
          code: "00098",
          cnpj: cnpjFromBase("000000980001"),
          responsibilities: { Fiscal: { mode: "person", userId: "foreign" } },
        }),
      ]),
    ).toThrow();
    expect(repository.read()).toEqual(before);
    expect(engine.importCompanies(admin, [companyInput()]).created).toBe(1);
    expect(engine.importCompanies(admin, [companyInput()]).existing).toBe(1);
    expect(
      engine.snapshot(admin).companies.find((item) => item.code === "00099")!
        .tags,
    ).toEqual(["Comércio"]);
  });
  it("approves a proposal after a simple edit without overwriting current company data", () => {
    const { engine, admin } = fixture();
    const company = engine.addCompany(admin, companyInput());
    const proposal = engine.proposeCompanyChange(admin, {
      companyId: company.id,
      expectedRevision: 1,
      patch: { regime: "Lucro Presumido" },
      effectiveCompetence: "2026-11",
      reason: "Mudança de regime fictícia",
    });
    engine.updateCompany(admin, company.id, {
      expectedRevision: 1,
      name: "Cadastro mais recente",
    });
    // L07 (19/10/2026): the decision recomputes the impact on the current
    // company instead of locking the proposal forever.
    expect(
      engine.decideChangeProposal(admin, proposal.id, {
        expectedRevision: 1,
        decision: "approve",
      }).status,
    ).toBe("approved");
    const stored = engine
      .snapshot(admin)
      .companies.find((item) => item.id === company.id)!;
    expect(stored.name).toBe("Cadastro mais recente");
    expect(companyAtCompetence(stored, "2026-11").regime).toBe(
      "Lucro Presumido",
    );
    expect(() =>
      engine.decideChangeProposal(admin, proposal.id, {
        expectedRevision: 1,
        decision: "reject",
      }),
    ).toThrow("mudou");
  });
  it("applies changes by competence, retains history and avoids duplicated tasks", () => {
    const { engine, admin, repository } = fixture();
    const company = engine.addCompany(admin, companyInput());
    engine.generate(admin, "2026-10", "Fiscal");
    const old = repository
      .read()
      .tasks.filter((task) => task.companyId === company.id);
    const proposal = engine.proposeCompanyChange(admin, {
      companyId: company.id,
      expectedRevision: 1,
      patch: { regime: "Lucro Presumido" },
      effectiveCompetence: "2026-11",
      reason: "Regime ilustrativo validado",
    });
    engine.decideChangeProposal(admin, proposal.id, {
      expectedRevision: 1,
      decision: "approve",
    });
    const stored = repository
      .read()
      .companies.find((item) => item.id === company.id)!;
    expect(companyAtCompetence(stored, "2026-10").regime).toBe(
      "Simples Nacional",
    );
    expect(companyAtCompetence(stored, "2026-11").regime).toBe(
      "Lucro Presumido",
    );
    expect(
      repository
        .read()
        .tasks.filter((task) => old.some((item) => item.id === task.id)),
    ).toEqual(old);
    // L06: a future competence is not generated by the approval itself.
    expect(
      repository
        .read()
        .tasks.some(
          (task) =>
            task.companyId === company.id && task.competence === "2026-11",
        ),
    ).toBe(false);
    engine.generate(admin, "2026-11", "Fiscal");
    const count = repository
      .read()
      .tasks.filter((task) => task.companyId === company.id).length;
    engine.generate(admin, "2026-11", "Fiscal");
    expect(
      repository.read().tasks.filter((task) => task.companyId === company.id)
        .length,
    ).toBe(count);
  });
  it("keeps multiple independent documents and creates versions per document", () => {
    const { engine, admin } = fixture();
    let task = engine
      .snapshot(admin)
      .tasks.find((item) => item.status === "todo")!;
    task = engine.command(admin, task.id, {
      type: "start",
      expectedRevision: task.revision,
    });
    const evidence = {
      name: "documento.pdf",
      bytes: 100,
      kind: "PDF" as const,
      documentTypeId: "receipt",
    };
    task = engine.attach(admin, task.id, task.revision, evidence);
    const first = task.documents[0]!;
    task = engine.attach(admin, task.id, task.revision, {
      ...evidence,
      name: "guia.pdf",
      documentTypeId: "guide",
    });
    expect(task.documents[1]!.logicalId).not.toBe(first.logicalId);
    task = engine.attach(admin, task.id, task.revision, {
      ...evidence,
      logicalId: first.logicalId,
    });
    expect(task.documents[2]!.logicalVersion).toBe(2);
    expect(() =>
      engine.attach(admin, task.id, task.revision, {
        ...evidence,
        logicalId: first.logicalId,
        documentTypeId: "guide",
      }),
    ).toThrow("preservar");
  });
  it("requires every published mandatory document type before completion", () => {
    const { engine, admin } = fixture();
    const settings = engine.snapshot(admin).workspace;
    engine.updateWorkspaceSettings(admin, {
      ...request(settings),
      documentRules: [
        {
          id: "both",
          name: "Guia e recibo",
          templateIds: ["pgdas"],
          documentTypeIds: ["guide", "receipt"],
          required: true,
          keywords: ["DAS"],
          fields: ["cnpj", "competence"],
          active: true,
        },
      ],
    });
    engine.generate(admin, "2026-10", "Fiscal");
    let task = engine
      .snapshot(admin)
      .tasks.find(
        (item) => item.templateId === "pgdas" && item.competence === "2026-10",
      )!;
    task = engine.command(admin, task.id, {
      type: "start",
      expectedRevision: 1,
    });
    for (const step of task.steps)
      task = engine.command(admin, task.id, {
        type: "step",
        stepId: step.id,
        completed: true,
        expectedRevision: task.revision,
      });
    task = engine.attach(admin, task.id, task.revision, {
      name: "guia.pdf",
      bytes: 1,
      kind: "PDF",
      documentTypeId: "guide",
    });
    expect(() =>
      engine.command(admin, task.id, {
        type: "submit",
        expectedRevision: task.revision,
      }),
    ).toThrow("tipos");
    task = engine.attach(admin, task.id, task.revision, {
      name: "recibo.pdf",
      bytes: 1,
      kind: "PDF",
      documentTypeId: "receipt",
    });
    expect(
      engine.command(admin, task.id, {
        type: "submit",
        expectedRevision: task.revision,
      }).status,
    ).toBe("in_review");
  });
  it("authorizes comments, preserves author text, revision and tenant isolation", () => {
    const { engine, operator, admin } = fixture();
    const task = engine.snapshot(operator).tasks[0]!;
    const updated = engine.addTaskComment(operator, task.id, {
      expectedRevision: task.revision,
      text: "Cliente enviou documentos; aguarda conferência.",
    });
    expect(updated.comments![0]!.authorId).toBe(operator.userId);
    expect(updated.revision).toBe(task.revision + 1);
    expect(() =>
      engine.addTaskComment(operator, task.id, {
        expectedRevision: task.revision,
        text: "Outra mensagem",
      }),
    ).toThrow("mudou");
    expect(() =>
      engine.addTaskComment({ ...admin, tenantId: "foreign" }, task.id, {
        expectedRevision: updated.revision,
        text: "Não autorizado",
      }),
    ).toThrow("encontrada");
  });
  it("cancels with history, keeps evidence and forbids closing process dependencies by cancellation", () => {
    const { engine, admin } = fixture();
    const task = engine
      .snapshot(admin)
      .tasks.find((item) => item.status === "todo")!;
    const cancelled = engine.command(admin, task.id, {
      type: "cancel",
      expectedRevision: task.revision,
      reason: "Atividade duplicada cadastrada por engano",
    });
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.status).toBe("dispensed");
    expect(engine.snapshot(admin).audit[0]!.action).toBe("Tarefa cancelada");
  });
  it("bulk transfer preserves completed delivery authorship and rolls back stale selections", () => {
    const { engine, admin, repository } = fixture();
    const companies = engine.snapshot(admin).companies.slice(0, 2);
    const before = repository.read();
    expect(() =>
      engine.transferCompanies(admin, {
        companyIds: companies.map((c) => c.id),
        department: "Fiscal",
        target: { mode: "person", userId: "marina" },
        transferOpenTasks: true,
        expectedRevisions: { [companies[0]!.id]: 1, [companies[1]!.id]: 999 },
      }),
    ).toThrow();
    expect(repository.read()).toEqual(before);
    const result = engine.transferCompanies(admin, {
      companyIds: companies.map((c) => c.id),
      department: "Fiscal",
      target: { mode: "person", userId: "marina" },
      transferOpenTasks: true,
      expectedRevisions: Object.fromEntries(
        companies.map((c) => [c.id, c.revision ?? 1]),
      ),
    });
    expect(result.companies).toBe(2);
    expect(result.tasks).toBeGreaterThan(0);
    expect(
      repository.read().tasks.filter((task) => task.status === "done"),
    ).toEqual(before.tasks.filter((task) => task.status === "done"));
  });
  it("blocks execution until the manager resolves applicability and audits the decision", () => {
    const { engine, admin, repository, operator } = fixture();
    const state = repository.read();
    const task = state.tasks.find(
      (t) => t.status === "todo" && t.assigneeId === operator.userId,
    )!;
    task.applicabilityReview = {
      proposalId: "change-test",
      reason: "Mudança operacional aprovada",
    };
    repository.replace(state);
    expect(() =>
      engine.command(operator, task.id, {
        type: "start",
        expectedRevision: task.revision,
      }),
    ).toThrow("revisão");
    expect(() =>
      engine.command(operator, task.id, {
        type: "retain_applicability",
        expectedRevision: task.revision,
        reason: "Obrigação ainda exigida",
      }),
    ).toThrow();
    const retained = engine.command(admin, task.id, {
      type: "retain_applicability",
      expectedRevision: task.revision,
      reason: "Obrigação ainda exigida nesta competência",
    });
    expect(retained.applicabilityReview).toBeUndefined();
    expect(
      engine.command(operator, task.id, {
        type: "start",
        expectedRevision: retained.revision,
      }).status,
    ).toBe("in_progress");
    expect(
      repository
        .read()
        .audit.some(
          (event) => event.action === "Aplicabilidade confirmada pelo gestor",
        ),
    ).toBe(true);
  });
  it("creates portfolio proposals atomically and rejects duplicate or stale rows", () => {
    const { engine, admin, repository } = fixture();
    const companies = engine.snapshot(admin).companies.slice(0, 2);
    const inputs = companies.map((c) => ({
      companyId: c.id,
      expectedRevision: c.revision ?? 1,
      patch: {
        responsibilities: {
          Fiscal: { mode: "person" as const, userId: "marina" },
        },
      },
      effectiveCompetence: "2026-11",
      reason: "Transferência em lote conferida",
    }));
    const before = repository.read();
    expect(() =>
      engine.proposeCompanyChanges(admin, [
        inputs[0]!,
        { ...inputs[1]!, expectedRevision: 999 },
      ]),
    ).toThrow();
    expect(repository.read()).toEqual(before);
    expect(() =>
      engine.proposeCompanyChanges(admin, [inputs[0]!, inputs[0]!]),
    ).toThrow();
    expect(engine.proposeCompanyChanges(admin, inputs)).toHaveLength(2);
  });
  it("merges sector changes without rewriting prior responsibility history", () => {
    const { engine, admin, repository } = fixture();
    const company = engine.addCompany(admin, companyInput());
    engine.transferCompanies(admin, {
      companyIds: [company.id],
      department: "Fiscal",
      target: { mode: "person", userId: "marina" },
      expectedRevisions: { [company.id]: 1 },
      transferOpenTasks: false,
    });
    const stored = repository
      .read()
      .companies.find((c) => c.id === company.id)!;
    expect(
      companyAtCompetence(stored, "2026-08").responsibilities?.Fiscal?.mode,
    ).toBe("department");
    expect(
      companyAtCompetence(stored, DEMO_NOW.slice(0, 7)).responsibilities?.Fiscal
        ?.userId,
    ).toBe("marina");
    expect(
      companyAtCompetence(stored, DEMO_NOW.slice(0, 7)).responsibilities
        ?.Contábil?.mode,
    ).toBe("none");
  });
  it("rejects duplicate company codes atomically even inside one import", () => {
    const { engine, admin, repository } = fixture();
    const before = repository.read();
    expect(() =>
      engine.importCompanies(admin, [
        companyInput(),
        companyInput({ cnpj: cnpjFromBase("000000980001") }),
      ]),
    ).toThrow("código");
    expect(repository.read()).toEqual(before);
  });
  it("imports task batches atomically and keeps repeated imports idempotent", () => {
    const { engine, admin, repository } = fixture();
    const company = engine.snapshot(admin).companies[0]!;
    const input = {
      title: "Atividade importada",
      description: "Exemplo de atividade importada",
      companyId: company.id,
      department: "Fiscal",
      internalDue: "2026-10-18",
      legalDue: "2026-10-20",
      assigneeId: "julia",
      requiresReview: false,
    };
    const before = repository.read();
    expect(() =>
      engine.importTasks(admin, [
        input,
        { ...input, title: "Outra atividade", assigneeId: "foreign" },
      ]),
    ).toThrow();
    expect(repository.read()).toEqual(before);
    expect(engine.importTasks(admin, [input])).toEqual({
      created: 1,
      existing: 0,
    });
    expect(engine.importTasks(admin, [input])).toEqual({
      created: 0,
      existing: 1,
    });
  });
  it("can reactivate a company without retaining an obsolete end-competence cap", () => {
    const company: Company = {
      ...createSeed().companies[0]!,
      serviceEndCompetence: "2026-08",
      status: "inactive",
      active: false,
      operationalHistory: [
        {
          proposalId: "restart",
          effectiveCompetence: "2026-10",
          status: "active",
        },
      ],
    };
    expect(
      companyAtCompetence(company, "2026-10").serviceEndCompetence,
    ).toBeUndefined();
    expect(defaultWorkspace("a").tenantId).not.toBe(
      defaultWorkspace("b").tenantId,
    );
  });
});
