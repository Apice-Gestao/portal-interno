import { beforeEach, describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  OPERATOR_PERMISSIONS,
  PERMISSIONS,
  PortalEngine,
  isWorkflowOverrideOutdated,
  users,
  workspaceOf,
} from "../src/index.js";
import type { Actor, Permission, ReportFilters } from "../src/index.js";

// Regressions for the findings of the 17–18/10/2026 reviews (R03–R08, A01).
const helena = users.find((user) => user.userId === "helena")!;
const admin: Actor = { ...helena, permissions: [...PERMISSIONS] as Permission[] };
const julia: Actor = {
  ...users.find((user) => user.userId === "julia")!,
  permissions: [...OPERATOR_PERMISSIONS] as Permission[],
};
let repository: MemoryRepository;
let engine: PortalEngine;
const company = (id = "company-1") =>
  repository.read().companies.find((item) => item.id === id)!;
const tasksOf = (competence: string, id = "company-1") =>
  repository
    .read()
    .tasks.filter(
      (task) => task.companyId === id && task.competence === competence,
    );

beforeEach(() => {
  repository = new MemoryRepository(createSeed());
  engine = new PortalEngine(repository, () => DEMO_NOW);
});

function approve(
  patch: Record<string, unknown>,
  effectiveCompetence: string,
  id = "company-1",
) {
  const proposal = engine.proposeCompanyChange(admin, {
    companyId: id,
    expectedRevision: company(id).revision ?? 1,
    patch,
    effectiveCompetence,
    reason: "Regressão da revisão geral",
  });
  return engine.decideChangeProposal(admin, proposal.id, {
    expectedRevision: proposal.revision,
    decision: "approve",
  });
}
function addStatus(id: string, label: string) {
  engine.updateWorkspaceSettings(admin, {
    expectedRevision: workspaceOf(repository.read(), admin.tenantId).revision,
    companyStatuses: [{ id, label }],
  });
}

describe("company situations across competences (R05, R06, R07)", () => {
  it("a suspension after a closing stops generation even with the old end", () => {
    approve({ status: "closing", serviceEndCompetence: "2026-12" }, "2026-10");
    approve({ status: "suspended" }, "2026-11");
    engine.generate(admin, "2026-11", "Fiscal");
    expect(tasksOf("2026-11")).toHaveLength(0);
  });

  it("reactivating with a created active situation clears the old end", () => {
    addStatus("active:retomada", "Retomada");
    approve({ status: "closing", serviceEndCompetence: "2026-10" }, "2026-10");
    approve({ status: "active:retomada" }, "2026-11");
    engine.generate(admin, "2026-11", "Fiscal");
    expect(tasksOf("2026-11").length).toBeGreaterThan(0);
  });

  it("does not approve a proposal whose created situation was removed, nor remove it while pending", () => {
    addStatus("suspended:aguardando", "Aguardando cliente");
    const proposal = engine.proposeCompanyChange(admin, {
      companyId: "company-1",
      expectedRevision: company().revision ?? 1,
      patch: { status: "suspended:aguardando" },
      effectiveCompetence: "2026-11",
      reason: "Regressão da revisão geral",
    });
    expect(() =>
      engine.updateWorkspaceSettings(admin, {
        expectedRevision: workspaceOf(repository.read(), admin.tenantId)
          .revision,
        companyStatuses: [],
      }),
    ).toThrow(expect.objectContaining({ code: "STATUS_IN_USE" }));
    // Even if the catalogue loses it some other way, approval revalidates.
    const state = repository.read();
    state.workspaces!.find(
      (item) => item.tenantId === admin.tenantId,
    )!.companyStatuses = [];
    repository.replace(state);
    expect(() =>
      engine.decideChangeProposal(admin, proposal.id, {
        expectedRevision: proposal.revision,
        decision: "approve",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATUS" }));
  });
});

describe("company steps by department (R03, R08)", () => {
  const fiscalTemplate = () =>
    repository.read().templates.find((template) => template.id === "dctf")!;
  const pessoalTemplate = () =>
    repository.read().templates.find((template) => template.id === "folha")!;

  it("an operator only sees customized steps of templates in their departments", () => {
    const state = repository.read();
    const target = state.companies.find((item) => item.id === "company-1")!;
    target.workflowOverrides = {
      [pessoalTemplate().id]: {
        steps: [{ id: "s1", title: "Etapa do Pessoal" }],
        baseVersion: 1,
        updatedAt: DEMO_NOW,
        updatedBy: "helena",
      },
      [fiscalTemplate().id]: {
        steps: [{ id: "s2", title: "Etapa do Fiscal" }],
        baseVersion: 1,
        updatedAt: DEMO_NOW,
        updatedBy: "helena",
      },
    };
    repository.replace(state);
    expect(julia.departments).not.toContain("Pessoal");
    const seen = engine
      .snapshot(julia)
      .companies.find((item) => item.id === "company-1");
    expect(seen?.workflowOverrides?.[pessoalTemplate().id]).toBeUndefined();
    expect(seen?.workflowOverrides?.[fiscalTemplate().id]).toBeDefined();
    const fiscalManager: Actor = { ...admin, departments: ["Fiscal"] };
    const saved = engine.setCompanyWorkflow(fiscalManager, {
      companyId: "company-1",
      templateId: fiscalTemplate().id,
      action: "acknowledge",
      expectedRevision: company().revision ?? 1,
      expectedTemplateVersion: fiscalTemplate().version,
    });
    expect(saved.workflowOverrides?.[pessoalTemplate().id]).toBeUndefined();
  });

  it("refuses steps reviewed on an older template version", () => {
    const opened = fiscalTemplate().version;
    // The general template moves on while the editor is open.
    const state = repository.read();
    state.templates.find((item) => item.id === "dctf")!.version += 1;
    repository.replace(state);
    const current = fiscalTemplate();
    expect(current.version).toBe(opened + 1);
    const save = (version: number) =>
      engine.setCompanyWorkflow(admin, {
        companyId: "company-1",
        templateId: current.id,
        action: "save",
        workflowSteps: [{ id: "a", title: "Conferir apuração" }],
        expectedRevision: company().revision ?? 1,
        expectedTemplateVersion: version,
      });
    expect(() => save(opened)).toThrow(
      expect.objectContaining({ code: "TEMPLATE_CHANGED" }),
    );
    save(current.version);
    expect(isWorkflowOverrideOutdated(current, company())).toBe(false);
  });
});

describe("reports and automatic generation (R04, A01)", () => {
  it("grouping by collaborator shows % on time only with the performance grant", () => {
    const filters: ReportFilters = {
      id: "pending",
      scope: "all",
      dateBasis: "competence",
      groupBy: "owner",
    } as ReportFilters;
    const viewer: Actor = {
      ...admin,
      permissions: ["reports.view", "tasks.view", "tasks.team.view"],
    };
    const columns = (actor: Actor) =>
      engine.report(actor, filters).columns.map((column) => column.key);
    expect(columns(viewer)).not.toContain("onTimePercent");
    expect(
      columns({
        ...viewer,
        permissions: [...viewer.permissions!, "reports.performance.view"],
      }),
    ).toContain("onTimePercent");
    expect(
      engine
        .report(viewer, { ...filters, groupBy: "company" })
        .columns.map((column) => column.key),
    ).toContain("onTimePercent");
  });

  it("one company without a valid responsible does not block the rest of the group", () => {
    const state = repository.read();
    const broken = state.companies.find((item) => item.id === "company-1")!;
    broken.responsibilities = {
      ...broken.responsibilities,
      Fiscal: { mode: "person", userId: "julia" },
    };
    state.users.find((user) => user.userId === "julia")!.active = false;
    repository.replace(state);
    const result = engine.autoGenerate(admin.tenantId, "2026-11");
    const fiscal = result.results.find((item) => item.department === "Fiscal")!;
    expect(fiscal.skipped).toContain(broken.name);
    expect(tasksOf("2026-11")).toHaveLength(0);
    expect(
      repository
        .read()
        .tasks.some(
          (task) =>
            task.competence === "2026-11" &&
            task.companyId !== "company-1" &&
            task.department === "Fiscal",
        ),
    ).toBe(true);
    const notices = () =>
      repository
        .read()
        .audit.filter(
          (event) => event.action === "Geração automática com pendências",
        ).length;
    expect(notices()).toBe(1);
    engine.autoGenerate(admin.tenantId, "2026-11");
    expect(notices()).toBe(1);
    // Manual generation also skips and names it since 19/10/2026.
    expect(engine.generate(admin, "2026-12", "Fiscal").skipped).toContain(
      broken.name,
    );
  });
});

describe("Brasília clock for competence and suggested dates (19/10/2026)", () => {
  it("uses the closed competence of Brasília, also around midnight UTC and year end", async () => {
    const { closedCompetence, suggestedDeadlines } = await import(
      "../src/index.js"
    );
    // 31/12 23:00 in Brasília is already 01/01 in UTC.
    expect(closedCompetence("2027-01-01T02:00:00.000Z")).toBe("2026-11");
    expect(closedCompetence("2027-01-01T03:30:00.000Z")).toBe("2026-12");
    expect(closedCompetence("2026-11-01T02:59:00.000Z")).toBe("2026-09");
    expect(suggestedDeadlines("2026-10-19T12:00:00.000Z")).toEqual({
      internalDue: "2026-11-15",
      legalDue: "2026-11-20",
    });
    expect(suggestedDeadlines("2026-10-05T12:00:00.000Z")).toEqual({
      internalDue: "2026-10-15",
      legalDue: "2026-10-20",
    });
    expect(suggestedDeadlines("2026-12-20T12:00:00.000Z")).toEqual({
      internalDue: "2027-01-15",
      legalDue: "2027-01-20",
    });
    // 15/12 22:00 in Brasília is 16/12 in UTC: still December's dates.
    expect(suggestedDeadlines("2026-12-16T01:00:00.000Z").internalDue).toBe(
      "2026-12-15",
    );
  });
});
