import { beforeEach, describe, expect, it } from "vitest";
import {
  availableReports,
  buildReport,
  cnpjFromBase,
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
  REPORT_DEFINITIONS,
  reportCsv,
  reportFiltersSchema,
  users,
} from "../src/index.js";
import type {
  Actor,
  Permission,
  PortalState,
  ReportFilters,
  ReportId,
} from "../src/index.js";

const helena = users.find((u) => u.userId === "helena")!;
const julia = users.find((u) => u.userId === "julia")!;
const all = [...PERMISSIONS] as Permission[];
const admin: Actor = { ...helena, permissions: all };
const reporter = (permissions: Permission[], base: Actor = helena): Actor => ({
  ...base,
  permissions: ["reports.view", ...permissions],
});
let state: PortalState;
let engine: PortalEngine;
const filters = (
  id: ReportId,
  extra: Partial<ReportFilters> = {},
): ReportFilters => ({
  id,
  scope: "all",
  dateBasis: REPORT_DEFINITIONS.find((item) => item.id === id)!.dateBasis,
  ...extra,
});
const run = (actor: Actor, id: ReportId, extra: Partial<ReportFilters> = {}) =>
  engine.report(actor, filters(id, extra));
const ids = (actor: Actor, id: ReportId, extra?: Partial<ReportFilters>) =>
  run(actor, id, extra).rows.map((row) => row.id);
beforeEach(() => {
  state = createSeed();
  engine = new PortalEngine(new MemoryRepository(state), () => DEMO_NOW);
});
const reload = () => {
  engine = new PortalEngine(new MemoryRepository(state), () => DEMO_NOW);
};

describe("report catalog and authorization", () => {
  it("keeps 31 unique reports with the six essentials first", () => {
    const list = REPORT_DEFINITIONS.map((item) => item.id);
    expect(new Set(list).size).toBe(31);
    expect(list.slice(0, 6)).toEqual([
      "reconciliation",
      "deliveries",
      "pending",
      "matrix",
      "productivity",
      "changes",
    ]);
    expect(
      REPORT_DEFINITIONS.every((item) =>
        item.requiredPermissions.includes("reports.view"),
      ),
    ).toBe(true);
  });
  it("offers each report only with its own grants, independent of role", () => {
    const operator = reporter([], { ...julia, role: "operator" });
    const base = availableReports(operator).map((item) => item.id);
    expect(base).not.toContain("productivity");
    expect(base).not.toContain("companies");
    expect(base).not.toContain("processes");
    expect(base).not.toContain("company-changes");
    expect(base).not.toContain("activity");
    expect(base).not.toContain("user-access");
    expect(base).toContain("pending");
    const granted = availableReports(
      reporter(
        [
          "reports.performance.view",
          "companies.view",
          "processes.view",
          "changes.manage",
          "settings.view",
          "users.manage",
        ],
        { ...julia, role: "operator" },
      ),
    );
    expect(granted).toHaveLength(31);
    expect(availableReports({ ...julia, permissions: ["tasks.view"] })).toEqual(
      [],
    );
    expect(availableReports({ ...admin, active: false })).toEqual([]);
  });
  it("refuses crafted requests for reports or departments outside the grant", () => {
    const operator = reporter(["tasks.view"], julia);
    expect(() => run(operator, "productivity")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => run(operator, "user-access")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(() =>
      run(operator, "pending", { scope: "department", department: "Contábil" }),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
  it("applies a revoked grant on the next query", () => {
    const actor = reporter(["reports.performance.view"]);
    expect(run(actor, "productivity").rows.length).toBeGreaterThan(0);
    expect(() =>
      run({ ...actor, permissions: ["reports.view"] }, "productivity"),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("filter validation", () => {
  const invalid = (input: Record<string, unknown>) =>
    reportFiltersSchema.safeParse({ ...filters("pending"), ...input }).success;
  it("rejects invalid, inverted or mixed date filters", () => {
    expect(invalid({ dateBasis: "legalDue", from: "2026-02-30" })).toBe(false);
    expect(
      invalid({ dateBasis: "legalDue", from: "2026-10-09", to: "2026-10-01" }),
    ).toBe(false);
    expect(invalid({ dateBasis: "competence", from: "2026-10-01" })).toBe(
      false,
    );
    expect(invalid({ dateBasis: "legalDue", competence: "2026-09" })).toBe(
      false,
    );
    expect(invalid({ dateBasis: "recordedAt" })).toBe(false);
    expect(invalid({ scope: "department" })).toBe(false);
    expect(invalid({ tenantId: "outro" })).toBe(false);
    expect(
      invalid({ dateBasis: "legalDue", from: "2026-10-01", to: "2026-10-01" }),
    ).toBe(true);
  });
  it("rejects filters the report does not support instead of ignoring them", () => {
    expect(
      reportFiltersSchema.safeParse({
        ...filters("companies"),
        status: "done",
      }).success,
    ).toBe(false);
    expect(
      reportFiltersSchema.safeParse({
        ...filters("user-access"),
        from: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(() =>
      engine.report(admin, { ...filters("pending"), status: "bogus" } as never),
    ).toThrow(expect.objectContaining({ code: "INVALID_REPORT_FILTERS" }));
  });
});

describe("task reports", () => {
  it("separates deliveries, dispensations and cancellations", () => {
    const task = state.tasks.find((item) => item.status === "done")!;
    const dispensed = state.tasks.find((item) => item.status === "todo")!;
    dispensed.status = "dispensed";
    task.cancelled = true;
    reload();
    expect(ids(admin, "deliveries")).not.toContain(task.id);
    expect(ids(admin, "cancelled")).toEqual([task.id]);
    expect(ids(admin, "pending")).not.toContain(dispensed.id);
    expect(ids(admin, "pending")).not.toContain(task.id);
    const productivity = run(admin, "productivity").rows.find(
      (row) => row.id === task.assigneeId,
    )!;
    expect(productivity.cells.cancelled).toBe(1);
  });
  it("uses inclusive date limits on the São Paulo calendar day", () => {
    const task = state.tasks.find((item) => item.status === "done")!;
    // 23:30 in São Paulo is already the next day in UTC.
    task.completedAt = "2026-10-06T02:30:00.000Z";
    reload();
    const range = { dateBasis: "completedAt" as const };
    expect(
      ids(admin, "deliveries", {
        ...range,
        from: "2026-10-05",
        to: "2026-10-05",
      }),
    ).toContain(task.id);
    expect(
      ids(admin, "deliveries", { ...range, from: "2026-10-06" }),
    ).not.toContain(task.id);
    const open = state.tasks.find((item) => item.status === "todo")!;
    expect(
      ids(admin, "reconciliation", { ...range, to: "2026-12-31" }),
    ).not.toContain(open.id);
  });
  it("keeps delivery dates, deadline labels and on-time totals on the same local day", () => {
    const task = state.tasks.find((item) => item.status === "done")!;
    task.internalDue = "2026-10-05";
    task.legalDue = "2026-10-05";
    task.completedAt = "2026-10-06T02:30:00.000Z";
    state.tasks = [task];
    reload();
    const report = run(admin, "deliveries", {
      dateBasis: "completedAt",
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(report.rows[0]!.cells.completedAt).toBe("05/10/2026");
    expect(report.rows[0]!.cells.situation).toBe("Entregue na meta");
    expect(report.rows[0]!.tones?.situation).toBe("success");
    const productivity = run(admin, "productivity").rows[0]!;
    expect(productivity.cells.onTime).toBe(1);
    expect(productivity.cells.onTimePercent).toBe("100%");
  });
  it("limits operators without team view to their own tasks", () => {
    const operator = reporter(["tasks.view"], julia);
    const result = run(operator, "pending");
    expect(result.rows.length).toBeGreaterThan(0);
    expect(
      result.rows.every(
        (row) =>
          state.tasks.find((task) => task.id === row.taskId)!.assigneeId ===
          "julia",
      ),
    ).toBe(true);
  });
  it("reports overdue tasks by legal due date and keeps the deadline tone", () => {
    const task = state.tasks.find((item) => item.status === "todo")!;
    task.legalDue = "2026-10-01";
    task.internalDue = "2026-09-28";
    reload();
    const row = run(admin, "overdue").rows.find((item) => item.id === task.id)!;
    expect(row.tones?.situation).toBe("danger");
    expect(ids(admin, "internal-late")).toContain(task.id);
  });
  it("counts only the latest version of each document", () => {
    const task = state.tasks.find(
      (item) => item.status === "in_review" && item.documents.length,
    )!;
    const first = task.documents[0]!;
    first.logicalId = "main";
    task.documents.push({
      ...first,
      id: `${first.id}-v2`,
      version: 2,
      validation: "rejected",
    });
    task.status = "in_progress";
    reload();
    const row = run(admin, "missing-documents").rows.find(
      (item) => item.id === task.id,
    );
    expect(row).toBeDefined();
    expect(row!.cells.documents).toBe(0);
  });
  it("dates document versions and comments by their own local registration day", () => {
    const task = state.tasks.find((item) => item.documents.length)!;
    const document = task.documents[0]!;
    task.assigneeId = "julia";
    task.competence = "2025-01";
    task.documents = [
      {
        ...document,
        id: "old",
        version: 1,
        logicalId: "main",
        createdAt: "2026-10-04T12:00:00.000Z",
      },
      {
        ...document,
        id: "new",
        version: 2,
        logicalId: "main",
        createdAt: "2026-10-06T02:30:00.000Z",
        authorId: "marina",
        validation: "rejected",
      },
    ];
    task.comments = [
      {
        id: "old",
        authorId: "marina",
        authorName: "Marina Costa",
        at: "2026-10-04T12:00:00.000Z",
        text: "Anterior",
      },
      {
        id: "new",
        authorId: "marina",
        authorName: "Marina Costa",
        at: "2026-10-06T02:30:00.000Z",
        text: "Revisar evidência",
      },
    ];
    state.tasks = [task];
    reload();
    const range = { ownerId: "julia", from: "2026-10-05", to: "2026-10-05" };
    const documents = run(admin, "documents", range);
    expect(documents.rows.map((row) => row.id)).toEqual([`${task.id}:new`]);
    expect(documents.rows[0]!.cells.validation).toBe("Rejeitado");
    expect(documents.rows[0]!.cells.author).toBe("Marina Costa");
    expect(
      run(admin, "documents", {
        dateBasis: "competence",
        competence: "2025-01",
      }).total,
    ).toBe(2);
    const comments = run(admin, "comments", range);
    expect(comments.rows.map((row) => row.id)).toEqual([`${task.id}:new`]);
    expect(comments.rows[0]!.cells.comment).toBe("Revisar evidência");
    expect(comments.rows[0]!.cells.owner).toBe("Júlia Martins");
  });
  it("builds the obligation matrix as company × obligation", () => {
    const result = run(admin, "matrix", { competence: "2026-09" });
    const titles = result.columns.map((column) => column.label);
    expect(titles.slice(0, 2)).toEqual(["Código", "Empresa"]);
    expect(titles).toContain("PGDAS-D");
    expect(new Set(result.rows.map((row) => row.companyId)).size).toBe(
      result.rows.length,
    );
  });
});

describe("company and management reports", () => {
  const addCompany = (name: string, base: string) =>
    engine.addCompany(admin, {
      name,
      cnpj: cnpjFromBase(base),
      regime: "Lucro Real",
      city: "São Paulo / SP",
      ownerId: "marina",
    });
  it("lists companies without tasks and keeps new registrations dated", () => {
    const company = addCompany("Empresa Sem Rotina", "990000010001");
    const companies = reporter(["companies.view"]);
    expect(ids(companies, "companies-without-tasks")).toContain(company.id);
    expect(
      ids(companies, "companies-without-tasks", { ownerId: "marina" }),
    ).toContain(company.id);
    expect(ids(companies, "new-companies")).toEqual([company.id]);
    expect(ids(companies, "new-companies", { from: "2026-10-08" })).toEqual([]);
    expect(
      ids(companies, "companies", { from: "2026-10-07", to: "2026-10-07" }),
    ).toEqual([company.id]);
    expect(ids(companies, "companies")).toHaveLength(13);
  });
  it("checks the whole visible task portfolio before declaring a company without tasks", () => {
    const company = state.companies[0]!;
    const task = state.tasks.find((item) => item.companyId === company.id)!;
    company.ownerId = "marina";
    company.responsibilities = { Fiscal: { mode: "person", userId: "marina" } };
    task.assigneeId = "julia";
    task.competence = "2026-09";
    state.tasks = [task];
    reload();
    const scope = { ownerId: "marina", competence: "2026-09" };
    expect(ids(admin, "companies-without-tasks", scope)).not.toContain(
      company.id,
    );
    task.cancelled = true;
    reload();
    expect(ids(admin, "companies-without-tasks", scope)).toContain(company.id);
  });
  it("uses registration timestamps instead of service start dates and keeps summaries filtered", () => {
    const company = state.companies[0]!;
    company.startDate = "2020-01-01";
    company.createdAt = "2026-10-06T02:30:00.000Z";
    reload();
    const result = run(admin, "new-companies", {
      from: "2026-10-05",
      to: "2026-10-05",
      search: company.name,
    });
    expect(result.rows.map((row) => row.id)).toEqual([company.id]);
    expect(result.rows[0]!.cells.started).toBe("01/01/2020");
    expect(result.rows[0]!.cells.created).toBe("05/10/2026");
    expect(result.total).toBe(1);
    expect(result.summary[0]!.value).toBe(1);
    expect(result.summary[1]!.value).toBe(1);
  });
  it("never mixes another tenant into reports", () => {
    state.companies.push({
      ...structuredClone(state.companies[0]!),
      id: "foreign-company",
      tenantId: "outro-grupo",
    });
    state.tasks.push({
      ...structuredClone(state.tasks[0]!),
      id: "foreign-task",
      tenantId: "outro-grupo",
      companyId: "foreign-company",
    });
    reload();
    for (const definition of REPORT_DEFINITIONS) {
      const result = run(admin, definition.id);
      expect(JSON.stringify(result)).not.toContain("foreign-");
    }
  });
  it("filters activity by author and hides security events", () => {
    const event = state.audit[0]!;
    state.audit.push({
      ...structuredClone(event),
      id: "security-event",
      category: "security",
      action: "Login",
    });
    reload();
    const settings = reporter(["settings.view", "tasks.team.view"]);
    const rows = run(settings, "activity", { ownerId: event.actorId }).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.id)).not.toContain("security-event");
    expect(
      rows.every((row) =>
        state.audit.some(
          (item) => item.id === row.id && item.actorId === event.actorId,
        ),
      ),
    ).toBe(true);
  });
  it("finds events by an author who does not own the task", () => {
    const task = state.tasks.find((item) => item.assigneeId === "julia")!;
    state.audit = [
      {
        id: "reviewed-by-marina",
        tenantId: admin.tenantId,
        taskId: task.id,
        companyId: task.companyId,
        department: task.department,
        actorId: "marina",
        actorName: "Nome registrado no evento",
        action: "Tarefa conferida",
        detail: "Conferência independente",
        at: "2026-10-06T02:30:00.000Z",
      },
    ];
    reload();
    const result = run(admin, "activity", {
      ownerId: "marina",
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(result.rows.map((row) => row.id)).toEqual(["reviewed-by-marina"]);
    expect(result.rows[0]!.cells.owner).toBe("Nome registrado no evento");
  });
  it("keeps company-change proposals in authorized departments even for all scope", () => {
    const task = state.tasks.find((item) => item.assigneeId === "julia")!;
    state.changeProposals = [
      {
        id: "proposal-contabil",
        tenantId: admin.tenantId,
        companyId: task.companyId,
        expectedCompanyRevision: 1,
        revision: 1,
        status: "pending",
        patch: {
          responsibilities: { Contábil: { mode: "person", userId: "helena" } },
        },
        effectiveCompetence: "2026-10",
        reason: "Transferir carteira contábil",
        createdAt: DEMO_NOW,
        createdBy: "helena",
        impact: { create: 0, retain: 0, review: 0, transfer: 1, taskIds: [] },
      },
    ];
    reload();
    const limited = reporter(["changes.manage"], {
      ...julia,
      departments: ["Fiscal"],
    });
    expect(ids(limited, "company-changes")).toEqual([]);
    expect(ids(admin, "company-changes")).toEqual(["proposal-contabil"]);
  });
  it("omits credentials and login data from the access report", () => {
    Object.assign(state.users[0]!, {
      username: "login.secreto",
      email: "pessoa@example.invalid",
      passwordHash: "hash-secreto",
      permissions: ["tasks.view"],
    });
    reload();
    const result = run(reporter(["users.manage"]), "user-access");
    const rows = JSON.stringify(result.rows);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(rows).not.toMatch(/login\.secreto|example\.invalid|hash-secreto/);
    expect(rows).toContain("Acessar tarefas");
  });
});

describe("process reports", () => {
  it("respects process dates, stage scope and active blocks without exposing other departments", () => {
    const task = state.tasks.find((item) => item.department === "Fiscal")!;
    const process = {
      id: "process-fiscal",
      tenantId: admin.tenantId,
      companyId: task.companyId,
      flowId: "flow-fiscal",
      flowVersion: 1,
      flowTitle: "Entrada e parametrização",
      competence: "2026-09",
      blockRecurring: true,
      status: "active" as const,
      startedAt: "2026-10-06T02:30:00.000Z",
      revision: 1,
      stages: [
        {
          id: "fiscal",
          title: "Parametrizar Fiscal",
          department: "Fiscal",
          workflowSteps: [],
          internalDays: 1,
          legalDays: 2,
          requiresReview: false,
          requiredDocument: "Ficha cadastral",
          assigneeId: "julia",
          taskId: task.id,
          status: "active" as const,
        },
      ],
    };
    const mixed = {
      ...structuredClone(process),
      id: "process-mixed",
      stages: [
        ...structuredClone(process.stages),
        {
          ...structuredClone(process.stages[0]!),
          id: "contabil",
          department: "Contábil",
          assigneeId: "helena",
        },
      ],
    };
    state.companyOnboardings = [
      process,
      mixed,
      {
        ...structuredClone(process),
        id: "process-completed",
        status: "completed",
        completedAt: "2026-10-06T20:00:00.000Z",
      },
      {
        ...structuredClone(process),
        id: "process-parallel",
        blockRecurring: false,
      },
    ];
    reload();
    const range = { from: "2026-10-05", to: "2026-10-05" };
    expect(ids(admin, "recurring-blocks", range)).toEqual(
      expect.arrayContaining([process.id, mixed.id]),
    );
    expect(run(admin, "recurring-blocks", range).total).toBe(2);
    const stages = run(admin, "process-stages", {
      ...range,
      scope: "department",
      department: "Fiscal",
      ownerId: "julia",
    });
    expect(stages.rows.every((row) => row.department === "Fiscal")).toBe(true);
    expect(stages.total).toBe(4);
    const limited = reporter(["processes.view"], {
      ...julia,
      departments: ["Fiscal"],
    });
    expect(ids(limited, "processes", range)).not.toContain(mixed.id);
    expect(ids(limited, "recurring-blocks", range)).toEqual([process.id]);
  });
});

describe("csv export", () => {
  it("neutralizes spreadsheet formulas and keeps the BOM once", () => {
    state.companies[0]!.name = '=HYPERLINK("http://x")';
    reload();
    const csv = reportCsv(run(admin, "pending"));
    const bom = String.fromCharCode(0xfeff);
    expect(csv.startsWith(bom)).toBe(true);
    expect(csv.slice(1)).not.toContain(bom);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toMatch(/;"=HYPERLINK/);
  });
  it("revalidates authorization even when called with a tampered snapshot", () => {
    const snapshot = engine.snapshot(admin);
    expect(() =>
      buildReport(snapshot, reporter([]), filters("user-access")),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("grouping task reports (17/10/2026)", () => {
  it("summarizes the same open tasks per collaborator and per company", () => {
    const tasks = run(admin, "pending");
    const byOwner = run(admin, "pending", { groupBy: "owner" });
    const byCompany = run(admin, "pending", { groupBy: "company" });
    expect(byOwner.columns[0]).toEqual({ key: "group", label: "Colaborador" });
    expect(byCompany.columns[0]).toEqual({ key: "group", label: "Empresa" });
    const sum = (rows: typeof tasks.rows) =>
      rows.reduce((total, row) => total + Number(row.cells.total), 0);
    expect(sum(byOwner.rows)).toBe(tasks.rows.length);
    expect(sum(byCompany.rows)).toBe(tasks.rows.length);
    expect(byOwner.rows.every((row) => row.ownerId && !row.taskId)).toBe(true);
    const julia = byOwner.rows.find((row) => row.ownerId === "julia")!;
    expect(julia.cells.total).toBe(
      ids(admin, "pending", { ownerId: "julia" }).length,
    );
  });

  it("refuses grouping on reports that are not task lists", () => {
    expect(() => run(admin, "productivity", { groupBy: "company" })).toThrow(
      expect.objectContaining({ code: "INVALID_REPORT_FILTERS" }),
    );
    expect(
      run(admin, "pending", { groupBy: "task" }).rows[0]?.taskId,
    ).toBeTruthy();
  });
});
