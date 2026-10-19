import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  availableReports,
  buildReport,
  businessDate,
  businessTime,
  createSeed,
  createTvFeed,
  DEMO_NOW,
  documentsReady,
  latestDocuments,
  matchesSelection,
  MemoryRepository,
  metric,
  PERMISSIONS,
  PortalEngine,
  REPORT_DEFINITIONS,
  reportCsv,
} from "../packages/domain/src/index.js";
import type {
  Actor,
  DocumentVersion,
  Permission,
  ReportFilters,
  ReportId,
  ReportResult,
  Snapshot,
  Task,
  TaskStatus,
  TvDevice,
} from "../packages/domain/src/index.js";

// Reproducible simulations, not 8,450 separately named unit tests. Each property
// specifies its own fixed seed and run count; fast-check prints a shrink path on failure.
const seed = createSeed();
const baseTask = seed.tasks[0]!;
const baseCompany = seed.companies[0]!;
const admin: Actor = {
  ...seed.users.find((user) => user.userId === "helena")!,
  departments: ["Fiscal", "Contábil", "Pessoal"],
  permissions: [...PERMISSIONS],
  active: true,
};
const baseSnapshot = new PortalEngine(
  new MemoryRepository(seed),
  () => DEMO_NOW,
).snapshot(admin);
const tvDevice: TvDevice = {
  id: "massive-tv",
  tenantId: admin.tenantId,
  name: "Simulação de teste",
  departments: [...admin.departments],
  competence: "2026-10",
  // Pinned: the populations are built for this competence (devices follow
  // the competence in progress by default since 19/10/2026).
  followCurrent: false,
  active: true,
  showNames: false,
  blocks: ["progress", "deadlines", "collaborators", "deliveries"],
  rotationSeconds: 12,
  version: 1,
  createdAt: DEMO_NOW,
  updatedAt: DEMO_NOW,
};
const day = (value: number) => `2026-10-${String(value).padStart(2, "0")}`;
const taskStatuses = [
  "todo",
  "in_progress",
  "in_review",
  "returned",
  "waiting",
  "done",
  "dispensed",
] as const;
const departments = ["Fiscal", "Contábil", "Pessoal"] as const;
const taskValues = fc.record({
  status: fc.constantFrom(...taskStatuses),
  cancelled: fc.boolean(),
  foreign: fc.boolean(),
  department: fc.constantFrom(...departments),
  owner: fc.constantFrom("helena", "julia", "department:Fiscal"),
  month: fc.constantFrom("2026-09", "2026-10"),
  internal: fc.integer({ min: 1, max: 28 }),
  legalOffset: fc.integer({ min: 0, max: 3 }),
  completed: fc.integer({ min: 1, max: 28 }),
  accepted: fc.boolean(),
  reopened: fc.integer({ min: 0, max: 3 }),
});
const populations = fc.array(taskValues, { maxLength: 32 });
type TaskValue =
  typeof taskValues extends fc.Arbitrary<infer Value> ? Value : never;

function tasksFrom(values: TaskValue[]): Task[] {
  return values.map((value, index) => {
    // Cancellation's reachable domain state is dispensed + cancelled, never todo.
    const status = value.cancelled ? "dispensed" : value.status;
    const marker = value.foreign ? "FOREIGN_RECORD" : "local";
    const assigneeId = value.owner.startsWith("department:")
      ? `department:${value.department}`
      : value.owner;
    return {
      ...baseTask,
      id: `${marker}-task-${index}`,
      title: `${marker} obrigação ${index}`,
      tenantId: value.foreign ? "other-tenant" : admin.tenantId,
      companyId: `${marker}-company`,
      templateId: index % 2 ? "avulsa" : `template-${index % 4}`,
      department: value.department,
      assigneeId,
      competence: value.month,
      status,
      cancelled: value.cancelled,
      internalDue: day(value.internal),
      legalDue: day(value.internal + value.legalOffset),
      completedAt:
        status === "done" ? `${day(value.completed)}T15:00:00.000Z` : undefined,
      reopenedCount: value.reopened,
      requiredDocumentTypeIds: [],
      evidenceRequired: true,
      documents: [
        {
          id: `document-${index}`,
          logicalId: `logical-${index}`,
          name: `${marker}-document.pdf`,
          kind: "PDF",
          bytes: 12,
          version: 1,
          authorId: assigneeId,
          createdAt: `${day(value.internal)}T15:00:00.000Z`,
          validation: value.accepted ? "accepted" : "rejected",
        },
      ],
      comments: [
        {
          id: `comment-${index}`,
          authorId: assigneeId,
          authorName: "Autor da simulação",
          text: `${marker} comentário ${index}`,
          at: `${day(value.internal)}T15:00:00.000Z`,
        },
      ],
    };
  });
}

function snapshotWith(tasks: Task[], actor: Actor = admin): Snapshot {
  return {
    ...baseSnapshot,
    actor,
    now: "2026-10-15T15:00:00.000Z",
    tasks,
    companies: [
      {
        ...baseCompany,
        id: "local-company",
        name: "Empresa de simulação",
        createdAt: "2026-10-05T15:00:00.000Z",
      },
      {
        ...baseCompany,
        id: "FOREIGN_RECORD-company",
        name: "FOREIGN_RECORD empresa",
        tenantId: "other-tenant",
        createdAt: "2026-10-05T15:00:00.000Z",
      },
    ],
    audit: tasks.map((task, index) => ({
      id: `event-${task.id}`,
      tenantId: task.tenantId,
      taskId: task.id,
      companyId: task.companyId,
      department: task.department,
      actorId: task.assigneeId,
      actorName: task.title,
      action: index % 2 ? "Tarefa reaberta" : "Tarefa dispensada",
      detail: task.title,
      at: "2026-10-15T15:00:00.000Z",
    })),
    changeProposals: [],
    companyOnboardings: [],
  };
}

function filters(
  id: ReportId,
  extra: Partial<ReportFilters> = {},
): ReportFilters {
  return {
    id,
    scope: "all",
    dateBasis: REPORT_DEFINITIONS.find((definition) => definition.id === id)!
      .dateBasis,
    ...extra,
  };
}
const sortedIds = (tasks: Task[]) => tasks.map((task) => task.id).sort();
const resultIds = (report: ReportResult) =>
  report.rows.map((row) => row.id).sort();

describe("massive reproducible module simulations", () => {
  it("keeps report cohorts inside tenant, department, owner and competence for 1,000 populations", () => {
    fc.assert(
      fc.property(populations, fc.boolean(), (values, team) => {
        const actor: Actor = {
          ...admin,
          departments: ["Fiscal"],
          permissions: [
            "reports.view",
            ...(team ? ["tasks.team.view" as const] : []),
          ],
        };
        const tasks = tasksFrom(values);
        const snapshot = snapshotWith(tasks, actor);
        const visible = tasks.filter(
          (task) =>
            task.tenantId === actor.tenantId &&
            task.department === "Fiscal" &&
            task.competence === "2026-10" &&
            (team ||
              task.assigneeId === actor.userId ||
              task.assigneeId === "department:Fiscal"),
        );
        const open = visible.filter(
          (task) =>
            !task.cancelled && !["done", "dispensed"].includes(task.status),
        );
        const expected: Partial<Record<ReportId, Task[]>> = {
          pending: open,
          deliveries: visible.filter(
            (task) => !task.cancelled && task.status === "done",
          ),
          overdue: open.filter((task) => task.legalDue < "2026-10-15"),
          "internal-late": open.filter(
            (task) => task.internalDue < "2026-10-15",
          ),
          "department-queue": open.filter(
            (task) => task.assigneeId === "department:Fiscal",
          ),
          cancelled: visible.filter((task) => task.cancelled),
        };
        for (const [id, items] of Object.entries(expected)) {
          const definition = REPORT_DEFINITIONS.find((item) => item.id === id)!;
          const input = filters(id as ReportId, {
            dateBasis: definition.supports.dateBases.includes("competence")
              ? "competence"
              : definition.dateBasis,
            competence: "2026-10",
          });
          const report = buildReport(snapshot, actor, input);
          expect(resultIds(report)).toEqual(sortedIds(items));
          expect(report.summary[0]!.value).toBe(items.length);
        }
      }),
      { numRuns: 1000, seed: 2026101701 },
    );
  });

  it("checks all 31 report builders and CSV outputs on 150 mixed-tenant populations without mutating input", () => {
    fc.assert(
      fc.property(
        populations,
        fc.constantFrom(...departments),
        (values, department) => {
          const actor = { ...admin, departments: [department] };
          const snapshot = snapshotWith(tasksFrom(values), actor);
          const before = JSON.stringify(snapshot);
          for (const definition of REPORT_DEFINITIONS) {
            const report = buildReport(snapshot, actor, filters(definition.id));
            expect(report.total).toBe(report.rows.length);
            expect(new Set(report.rows.map((row) => row.id)).size).toBe(
              report.total,
            );
            expect(JSON.stringify(report)).not.toContain("FOREIGN_RECORD");
            expect(
              report.rows.every(
                (row) => !row.department || row.department === department,
              ),
            ).toBe(true);
            expect(reportCsv(report)).not.toContain("FOREIGN_RECORD");
          }
          expect(JSON.stringify(snapshot)).toBe(before);
        },
      ),
      { numRuns: 150, seed: 2026101702 },
    );
  });

  it("keeps performance and management reports controlled by grants across 1,000 role/access combinations", () => {
    const extraGrants: Permission[] = [
      "reports.performance.view",
      "companies.view",
      "processes.view",
      "changes.manage",
      "settings.view",
      "users.manage",
    ];
    fc.assert(
      fc.property(
        fc.subarray(extraGrants),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom<Actor["role"]>(
          "operator",
          "admin",
          "director",
          "viewer",
          "supervisor",
        ),
        (permissions, reports, active, role) => {
          const actor: Actor = {
            ...admin,
            active,
            role,
            permissions: [
              ...permissions,
              ...(reports ? ["reports.view" as const] : []),
            ],
          };
          const available = availableReports(actor).map((entry) => entry.id);
          const expectedGroup: [Permission, ReportId[]][] = [
            ["reports.performance.view", ["productivity"]],
            [
              "companies.view",
              [
                "companies",
                "new-companies",
                "company-status",
                "portfolios",
                "regimes",
                "companies-without-tasks",
              ],
            ],
            [
              "processes.view",
              ["processes", "process-stages", "recurring-blocks"],
            ],
            ["changes.manage", ["company-changes"]],
            ["settings.view", ["activity"]],
            ["users.manage", ["user-access", "department-structure"]],
          ];
          if (!reports || !active) expect(available).toEqual([]);
          for (const [grant, ids] of expectedGroup)
            for (const id of ids) {
              const permitted =
                reports && active && permissions.includes(grant);
              expect(available.includes(id)).toBe(permitted);
              if (!permitted)
                expect(() =>
                  buildReport(baseSnapshot, actor, filters(id)),
                ).toThrow(
                  expect.objectContaining({ code: "FORBIDDEN", status: 403 }),
                );
            }
          // Role changes alone neither add nor subtract a capability.
          expect(
            availableReports({
              ...actor,
              role: role === "admin" ? "operator" : "admin",
            }).map((entry) => entry.id),
          ).toEqual(available);
        },
      ),
      { numRuns: 1000, seed: 2026101703 },
    );
  });

  it("reconciles dashboard numerators with task drill-down and delivery reports for 1,000 populations", () => {
    fc.assert(
      fc.property(populations, (values) => {
        const tasks = tasksFrom(values).filter((task) => !task.cancelled);
        const statistics = metric(tasks, "2026-10-15");
        const done = tasks.filter((task) => task.status === "done");
        const open = tasks.filter(
          (task) => !["done", "dispensed"].includes(task.status),
        );
        const onTime = done.filter(
          (task) => task.completedAt!.slice(0, 10) <= task.internalDue,
        );
        expect(statistics.open).toBe(open.length);
        expect(statistics.done).toBe(done.length);
        expect(statistics.progress).toBe(
          tasks.length
            ? Math.round(((tasks.length - open.length) / tasks.length) * 100)
            : 0,
        );
        expect(statistics.onTimePercent).toBe(
          done.length ? Math.round((onTime.length / done.length) * 100) : 0,
        );
        expect(
          tasks.filter((task) =>
            matchesSelection(task, { status: "open" }, "2026-10-15"),
          ),
        ).toHaveLength(open.length);
        expect(
          tasks.filter((task) =>
            matchesSelection(task, { urgency: "legal" }, "2026-10-15"),
          ),
        ).toHaveLength(
          open.filter((task) => task.legalDue < "2026-10-15").length,
        );
        // Report population must use the same authorized cohort before comparison.
        const visible = tasks.filter(
          (task) => task.tenantId === admin.tenantId,
        );
        const deliveries = buildReport(
          snapshotWith(visible),
          admin,
          filters("deliveries"),
        );
        expect(deliveries.total).toBe(
          visible.filter((task) => task.status === "done").length,
        );
      }),
      { numRuns: 1000, seed: 2026101704 },
    );
  });

  it("preserves legacy/current document histories and aligns readiness with reports across 1,000 version sets", () => {
    const documentValues = fc.array(
      fc.record({
        group: fc.constantFrom("legacy", "receipt", "support"),
        accepted: fc.boolean(),
        type: fc.constantFrom("receipt-type", "support-type"),
      }),
      { maxLength: 18 },
    );
    fc.assert(
      fc.property(
        documentValues,
        fc.boolean(),
        fc.subarray(["receipt-type", "support-type"]),
        (values, evidenceRequired, required) => {
          const documents: DocumentVersion[] = values.map((value, index) => ({
            id: `version-${index}`,
            logicalId: value.group === "legacy" ? undefined : value.group,
            version: index + 1,
            documentTypeId: value.type,
            validation: value.accepted ? "accepted" : "rejected",
            name: "simulacao.pdf",
            bytes: 24,
            kind: "PDF",
            createdAt: DEMO_NOW,
            authorId: admin.userId,
          }));
          const before = JSON.stringify(documents);
          // A later element is the latest version here; reversing history must not alter it.
          const current = values
            .map((value, index) => ({ value, index }))
            .filter(
              ({ value, index }) =>
                !values
                  .slice(index + 1)
                  .some((later) => later.group === value.group),
            );
          const accepted = current.filter(({ value }) => value.accepted);
          const expectedReady =
            (!evidenceRequired || accepted.length > 0) &&
            required.every((type) =>
              accepted.some(({ value }) => value.type === type),
            );
          const task: Task = {
            ...baseTask,
            tenantId: admin.tenantId,
            companyId: "local-company",
            assigneeId: admin.userId,
            department: "Fiscal",
            status: "in_progress",
            cancelled: false,
            documents,
            requiredDocumentTypeIds: required,
            evidenceRequired,
          };
          expect(
            latestDocuments(documents)
              .map((document) => document.id)
              .sort(),
          ).toEqual(current.map(({ index }) => `version-${index}`).sort());
          expect(
            latestDocuments([...documents].reverse())
              .map((document) => document.id)
              .sort(),
          ).toEqual(current.map(({ index }) => `version-${index}`).sort());
          expect(documentsReady(task)).toBe(expectedReady);
          const snapshot = snapshotWith([task]);
          expect(
            buildReport(snapshot, admin, filters("missing-documents")).total,
          ).toBe(expectedReady ? 0 : 1);
          expect(buildReport(snapshot, admin, filters("documents")).total).toBe(
            documents.length,
          );
          expect(JSON.stringify(documents)).toBe(before);
        },
      ),
      { numRuns: 1000, seed: 2026101705 },
    );
  });

  it("keeps inclusive report dates and deadlines in São Paulo across 1,000 UTC instants", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 11, 31) }),
        (timestamp) => {
          const iso = new Date(timestamp).toISOString();
          // São Paulo has UTC−3 throughout this 2020–2035 test interval.
          const shifted = new Date(
            timestamp - 3 * 60 * 60 * 1000,
          ).toISOString();
          const localDay = shifted.slice(0, 10);
          expect(businessDate(iso)).toBe(localDay);
          expect(businessTime(iso)).toBe(shifted.slice(11, 16));
          expect(businessDate(localDay)).toBe(localDay);
          const task: Task = {
            ...baseTask,
            id: "utc-delivery",
            companyId: "local-company",
            assigneeId: admin.userId,
            tenantId: admin.tenantId,
            department: "Fiscal",
            status: "done",
            cancelled: false,
            internalDue: localDay,
            legalDue: localDay,
            completedAt: iso,
          };
          const result = buildReport(
            snapshotWith([task]),
            admin,
            filters("deliveries", {
              dateBasis: "completedAt",
              from: localDay,
              to: localDay,
            }),
          );
          expect(resultIds(result)).toEqual([task.id]);
          expect(result.rows[0]!.cells.situation).toBe("Entregue na meta");
          expect(result.rows[0]!.cells.completedAt).toBe(
            `${localDay.slice(8)}/${localDay.slice(5, 7)}/${localDay.slice(0, 4)}`,
          );
        },
      ),
      { numRuns: 1000, seed: 2026101706 },
    );
  });

  it("distinguishes new registrations from service start and unknown legacy dates in 1,000 portfolios", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            created: fc.boolean(),
            audit: fc.boolean(),
            day: fc.integer({ min: 1, max: 28 }),
          }),
          { maxLength: 24 },
        ),
        (values) => {
          const snapshot = snapshotWith([]);
          snapshot.companies = values.map((value, index) => ({
            ...baseCompany,
            id: `registration-${index}`,
            name: `Empresa ${index}`,
            createdAt: value.created
              ? `${day(value.day)}T02:30:00-03:00`
              : undefined,
            // Deliberately unrelated to registration date; never an allowed fallback.
            startDate: "2026-10-15",
          }));
          snapshot.audit = values.flatMap((value, index) =>
            value.audit
              ? [
                  {
                    id: `registration-event-${index}`,
                    tenantId: admin.tenantId,
                    companyId: `registration-${index}`,
                    actorId: admin.userId,
                    actorName: admin.name,
                    action: "Empresa cadastrada",
                    detail: "Simulação de registro",
                    at: `${day(value.day)}T02:30:00-03:00`,
                  },
                ]
              : [],
          );
          const result = buildReport(
            snapshot,
            admin,
            filters("new-companies", { from: "2026-10-10", to: "2026-10-20" }),
          );
          const expected = values.flatMap((value, index) =>
            (value.created || value.audit) && value.day >= 10 && value.day <= 20
              ? [`registration-${index}`]
              : [],
          );
          expect(resultIds(result)).toEqual(expected.sort());
          expect(result.summary[1]!.value).toBe(expected.length);
          expect(
            result.rows.every((row) => row.cells.started === "15/10/2026"),
          ).toBe(true);
        },
      ),
      { numRuns: 1000, seed: 2026101707 },
    );
  });

  it("preserves CSV row boundaries, UTF-8 and formula neutralization in 1,000 exports", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            prefix: fc.constantFrom("=", "+", "-", "@"),
            text: fc.string({ maxLength: 80 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (values) => {
          const report: ReportResult = {
            id: "reconciliation",
            title: "Simulação",
            description: "",
            dateLabel: "",
            columns: [
              { key: "id", label: "Identificação" },
              { key: "formula", label: "Conteúdo" },
              { key: "text", label: "Texto" },
              { key: "end", label: "Fim" },
            ],
            rows: values.map((value, index) => ({
              id: String(index),
              cells: {
                id: `row-${index}`,
                formula: ` \t${value.prefix}${value.text}`,
                text: `São Paulo; "Ápice"\r\n${value.text}`,
                end: `end-${index}`,
              },
            })),
            summary: [],
            notes: [],
            generatedAt: DEMO_NOW,
            total: values.length,
          };
          const csv = reportCsv(report);
          expect(csv.charCodeAt(0)).toBe(0xfeff);
          const lines = csv.slice(1).split("\r\n");
          expect(lines).toHaveLength(values.length + 1);
          expect(
            [...csv].every((character) => {
              const point = character.codePointAt(0)!;
              return (
                character === "\r" ||
                character === "\n" ||
                character === "\t" ||
                (point >= 32 && !(point >= 127 && point <= 159))
              );
            }),
          ).toBe(true);
          values.forEach((value, index) => {
            const line = lines[index + 1]!;
            // Independent transport assertions: distinct first/last markers survive,
            // injected line breaks cannot create rows, formula sign follows apostrophe.
            expect(line.startsWith(`"row-${index}";"'  ${value.prefix}`)).toBe(
              true,
            );
            expect(line.endsWith(`;"end-${index}"`)).toBe(true);
            expect(line).toContain('"São Paulo; ""Ápice""  ');
            expect(line).not.toContain("\n");
            expect(line).not.toContain("\r");
          });
        },
      ),
      { numRuns: 1000, seed: 2026101708 },
    );
  });

  it("preserves progress and string identifiers with exactly one queue-claim winner in 300 simulations", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<TaskStatus>("in_progress", "waiting", "in_review"),
        fc.constantFrom(
          "Fiscal",
          "Jurídico e Legalização",
          "Atendimento: Equipe 01",
        ),
        fc.integer({ min: 0, max: 99999 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        (status, department, suffix, completed) => {
          const userId = `operador:00-${suffix}`;
          const first: Actor = {
            ...admin,
            userId,
            role: "operator",
            departments: [department],
            permissions: ["tasks.view", "tasks.execute", "tasks.team.view"],
          };
          const second: Actor = { ...first, userId: `outro:00-${suffix}` };
          const task: Task = {
            ...baseTask,
            id: `task:000-${suffix}`,
            tenantId: admin.tenantId,
            department,
            status,
            cancelled: false,
            assigneeId: `department:${department}`,
            revision: 5,
            startedAt: "2026-10-01T02:30:00Z",
            executionActorIds: ["executor:000-original"],
            executorId: "executor:000-original",
            steps: completed.map((value, index) => ({
              id: `step:00-${index}`,
              title: `Etapa ${index}`,
              completed: value,
            })),
          };
          const repository = new MemoryRepository({
            ...seed,
            tasks: [task],
            users: [first, second],
            audit: [],
          });
          const engine = new PortalEngine(repository, () => DEMO_NOW);
          const claimed = engine.command(first, task.id, {
            type: "start",
            expectedRevision: task.revision,
          });
          expect(claimed).toMatchObject({
            id: task.id,
            assigneeId: userId,
            status,
            revision: 6,
            startedAt: task.startedAt,
            steps: task.steps,
            executorId: task.executorId,
            executionActorIds: task.executionActorIds,
            documents: task.documents,
          });
          const afterClaim = repository.read();
          expect(() =>
            engine.command(second, task.id, {
              type: "start",
              expectedRevision: 5,
            }),
          ).toThrow(expect.objectContaining({ code: "CONFLICT", status: 409 }));
          expect(repository.read()).toEqual(afterClaim);
          expect(
            afterClaim.audit.filter(
              (event) => event.action === "Tarefa assumida da fila",
            ),
          ).toHaveLength(1);
        },
      ),
      { numRuns: 300, seed: 2026101709 },
    );
  });

  it("does not label cancelled historical tasks as approved dispensations in 1,000 valid populations", () => {
    fc.assert(
      fc.property(populations, (values) => {
        const tasks = tasksFrom(values);
        const statistics = metric(tasks, "2026-10-15");
        const operational = tasks.filter((task) => !task.cancelled);
        expect(statistics.total).toBe(operational.length);
        expect(statistics.cancelled).toBe(tasks.length - operational.length);
        expect(
          tasks.filter((task) =>
            matchesSelection(task, { status: "closed" }, "2026-10-15"),
          ),
        ).toHaveLength(statistics.done + statistics.dispensed);
        expect(
          tasks.filter((task) =>
            matchesSelection(task, { status: "cancelled" }, "2026-10-15"),
          ),
        ).toHaveLength(statistics.cancelled);
        const feed = createTvFeed(
          { ...seed, tasks },
          tvDevice,
          "2026-10-15T12:00:00-03:00",
        );
        expect(feed.total).toBe(
          operational.filter(
            (task) =>
              task.tenantId === admin.tenantId &&
              task.competence === tvDevice.competence,
          ).length,
        );
        expect(statistics.dispensed).toBe(
          tasks.filter((task) => task.status === "dispensed" && !task.cancelled)
            .length,
        );
        const snapshot = snapshotWith(tasks);
        const report = buildReport(snapshot, admin, filters("productivity"));
        const visibleDispensed = tasks.filter(
          (task) =>
            task.tenantId === admin.tenantId &&
            task.status === "dispensed" &&
            !task.cancelled,
        ).length;
        expect(
          report.rows.reduce(
            (sum, row) => sum + Number(row.cells.dispensed),
            0,
          ),
        ).toBe(visibleDispensed);
      }),
      { numRuns: 1000, seed: 2026101710 },
    );
  });
});
