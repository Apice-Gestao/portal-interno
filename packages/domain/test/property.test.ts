import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  cnpjFromBase,
  normalizeCnpj,
  validCnpj,
  createSeed,
  MemoryRepository,
  PortalEngine,
  DEMO_NOW,
  users,
  metric,
  matchesSelection,
  obligationGroups,
  obligationCell,
  commandSchema,
  csvCell,
  validateEvidence,
  PERMISSIONS,
  hasPermission,
} from "../src/index.js";
import type { Actor, Task, TaskCommand } from "../src/types.js";
const alpha = fc
  .array(fc.constantFrom(..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"), {
    minLength: 8,
    maxLength: 8,
  })
  .map((chars) => chars.join("") + "0001");
describe("generated business and security cases", () => {
  it("uses assigned permissions rather than job title for creation and team visibility", () => {
    const state = createSeed();
    const limited = {
      ...users[0]!,
      permissions: ["tasks.view", "tasks.execute"] as Actor["permissions"],
    };
    const full = { ...limited, permissions: [...PERMISSIONS] };
    const engine = new PortalEngine(
      new MemoryRepository(state),
      () => DEMO_NOW,
    );
    expect(
      engine
        .snapshot(limited)
        .tasks.every((t) => t.assigneeId === limited.userId),
    ).toBe(true);
    expect(
      engine.snapshot(full).tasks.some((t) => t.assigneeId !== full.userId),
    ).toBe(true);
    const input = {
      title: "Task concedida",
      description: "Permissão concedida a um operador.",
      companyId: state.companies[0]!.id,
      department: "Fiscal" as const,
      internalDue: "2026-10-20",
      legalDue: "2026-10-25",
      assigneeId: limited.userId,
      requiresReview: false,
    };
    expect(() => engine.addTask(limited, input)).toThrow();
    expect(engine.addTask(full, input).assigneeId).toBe(limited.userId);
    expect(
      hasPermission(
        { ...full, role: "admin", permissions: [] },
        "tasks.create",
      ),
    ).toBe(false);
  });
  it("rejects assignment to an active account whose execution permission was revoked", () => {
    const state = createSeed();
    state.users[0]!.permissions = ["tasks.view"];
    const task = state.tasks.find(
      (t) => t.status === "todo" && t.department === "Fiscal",
    )!;
    const engine = new PortalEngine(
      new MemoryRepository(state),
      () => DEMO_NOW,
    );
    expect(() =>
      engine.command(users[2]!, task.id, {
        type: "assign",
        assigneeId: state.users[0]!.userId,
        expectedRevision: task.revision,
      }),
    ).toThrow("Responsável indisponível");
  });
  it("classifies XML above the nesting limit as a controlled validation failure", async () => {
    await expect(
      validateEvidence(
        "valid.xml",
        new TextEncoder().encode("<a>".repeat(10) + "ok" + "</a>".repeat(10)),
      ),
    ).resolves.toBe("XML");
    await expect(
      validateEvidence(
        "deep.xml",
        new TextEncoder().encode("<a>".repeat(110) + "ok" + "</a>".repeat(110)),
      ),
    ).rejects.toMatchObject({ code: "INVALID_FILE", status: 422 });
  });
  it("checks 5,000 numeric/alphanumeric identifiers, normalization and altered check digits", () => {
    expect(validCnpj("00.000.000/E08G-12")).toBe(true);
    expect(validCnpj("11.222.333/0001-81")).toBe(true);
    expect(validCnpj("00.000.000/0000-00")).toBe(false);
    expect(validCnpj("ß00000000000/01")).toBe(false);
    fc.assert(
      fc.property(alpha, (base) => {
        const cnpj = cnpjFromBase(base);
        expect(validCnpj(cnpj)).toBe(true);
        expect(normalizeCnpj(cnpj.toLowerCase().replace(/[./-]/g, ""))).toBe(
          cnpj,
        );
        expect(
          validCnpj(cnpj.slice(0, -1) + String((Number(cnpj.at(-1)) + 1) % 10)),
        ).toBe(false);
      }),
      { numRuns: 5000, seed: 20261008 },
    );
  });
  it("rejects 2,000 attempts to inject a role/tenant into commands", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(
          commandSchema.safeParse({
            type: "start",
            expectedRevision: 1,
            role: value,
          }).success,
        ).toBe(false);
        expect(
          commandSchema.safeParse({
            type: "start",
            expectedRevision: 1,
            tenantId: value,
          }).success,
        ).toBe(false);
      }),
      { numRuns: 2000, seed: 8102026 },
    );
  });
  it("compares metric numerators and drill-down across 500 generated populations", () => {
    const arb = fc.array(
      fc.record({
        status: fc.constantFrom(
          "todo",
          "in_progress",
          "in_review",
          "returned",
          "waiting",
          "done",
          "dispensed",
        ),
        day: fc.integer({ min: 1, max: 28 }),
        completion: fc.integer({ min: 1, max: 28 }),
      }),
      { minLength: 0, maxLength: 100 },
    );
    fc.assert(
      fc.property(arb, (values) => {
        const tasks = values.map((v, i) => ({
          ...createSeed().tasks[0]!,
          id: String(i),
          status: v.status,
          internalDue: `2026-10-${String(v.day).padStart(2, "0")}`,
          legalDue: "2026-10-28",
          completedAt:
            v.status === "done"
              ? `2026-10-${String(v.completion).padStart(2, "0")}T12:00:00-03:00`
              : undefined,
        })) as Task[];
        const m = metric(tasks, "2026-10-15");
        expect(
          tasks.filter((t) =>
            matchesSelection(t, { status: "open" }, "2026-10-15"),
          ),
        ).toHaveLength(m.open);
        expect(
          tasks.filter((t) =>
            matchesSelection(t, { status: "closed" }, "2026-10-15"),
          ),
        ).toHaveLength(m.done + m.dispensed);
        const onTime = tasks.filter((t) =>
          matchesSelection(
            t,
            { status: "done", urgency: "on-time" },
            "2026-10-15",
          ),
        ).length;
        expect(m.onTimePercent).toBe(
          m.done ? Math.round((onTime / m.done) * 100) : 0,
        );
        expect(
          tasks.filter((t) =>
            matchesSelection(t, { urgency: "internal" }, "2026-10-15"),
          ),
        ).toHaveLength(m.internalLate);
      }),
      { numRuns: 500, seed: 20261008 },
    );
  });
  it("preserves every failed command across 300 randomized execution sequences", () => {
    const actions = fc.array(
      fc.record({
        type: fc.constantFrom(
          "start",
          "submit",
          "complete",
          "approve",
          "return",
          "wait",
          "resume",
          "dispense",
          "request_dispense",
          "reopen",
          "step",
          "assign",
        ),
        actor: fc.integer({ min: 0, max: 4 }),
        stale: fc.boolean(),
      }),
      { minLength: 20, maxLength: 40 },
    );
    fc.assert(
      fc.property(actions, (sequence) => {
        const repository = new MemoryRepository(createSeed());
        const engine = new PortalEngine(repository, () => DEMO_NOW);
        const id = repository
          .read()
          .tasks.find((t) => t.status === "todo" && t.requiresReview)!.id;
        for (const op of sequence) {
          const before = repository.read();
          const current = before.tasks.find((t) => t.id === id)!;
          const command = {
            type: op.type,
            expectedRevision: current.revision - (op.stale ? 1 : 0),
            reason: "Motivo gerado para teste.",
            stepId: current.steps[0]!.id,
            completed: true,
            assigneeId: "marina",
          } as TaskCommand;
          try {
            engine.command(users[op.actor] as Actor, id, command);
            const after = repository.read();
            const next = after.tasks.find((t) => t.id === id)!;
            expect(next.revision).toBe(current.revision + 1);
            expect(after.audit.length).toBe(before.audit.length + 1);
            if (next.status === "done") {
              expect(next.steps.every((s) => s.completed)).toBe(true);
              expect(next.documents.at(-1)?.validation).toBe("accepted");
            }
            expect(users[op.actor]!.role).not.toBe("viewer");
            if (
              op.type === "dispense" ||
              op.type === "reopen" ||
              op.type === "assign"
            )
              expect(["admin", "coordinator"]).toContain(users[op.actor]!.role);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(repository.read()).toEqual(before);
          }
        }
      }),
      { numRuns: 300, seed: 20261008 },
    );
  }, 30000);
  it("retains multiple avulsas and independent same-title models in the matrix", () => {
    const base = createSeed().tasks[0]!;
    const tasks = [
      { ...base, id: "a", templateId: "avulsa", title: "Mesmo título" },
      { ...base, id: "b", templateId: "avulsa", title: "Mesmo título" },
      {
        ...base,
        id: "c",
        templateId: "different-model",
        title: "Mesmo título",
      },
    ];
    const groups = obligationGroups(tasks);
    expect(groups).toHaveLength(2);
    expect(obligationCell(tasks, base.companyId, groups[0]!)).toHaveLength(2);
    expect(obligationCell(tasks, base.companyId, groups[1]!)).toHaveLength(1);
  });
  it("isolates 500 generated foreign tenants and produces no mutation", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((v) => v !== "apice-demo"),
        (tenantId) => {
          const repository = new MemoryRepository(createSeed());
          const engine = new PortalEngine(repository, () => DEMO_NOW);
          const actor = { ...users[2]!, tenantId };
          const before = repository.read();
          expect(engine.snapshot(actor).tasks).toHaveLength(0);
          expect(() =>
            engine.command(actor, before.tasks[0]!.id, {
              type: "start",
              expectedRevision: 1,
            }),
          ).toThrow();
          expect(repository.read()).toEqual(before);
        },
      ),
      { numRuns: 500, seed: 20261008 },
    );
  });
  it("neutralizes 1,000 CSV formulas, quotes and control characters", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("=", "+", "-", "@"),
        fc.string(),
        (prefix, value) => {
          const encoded = csvCell(` \t${prefix}${value}`);
          expect(encoded.startsWith("\"'")).toBe(true);
          expect(encoded.endsWith('"')).toBe(true);
          expect(encoded).not.toContain("\u0000");
        },
      ),
      { numRuns: 1000, seed: 20261008 },
    );
  });
  it("rejects 200 XML entity/DTD payload variants", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().map((v) => v.replace(/[<>]/g, "")),
        async (value) => {
          await expect(
            validateEvidence(
              "unsafe.xml",
              new TextEncoder().encode(
                `<!DOCTYPE root [<!ENTITY x "${value}">]><root>&x;</root>`,
              ),
            ),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 200, seed: 20261008 },
    );
  });
  it("assigns fallback to an eligible manager when owner becomes read-only", () => {
    const state = createSeed();
    state.companies[0]!.ownerId = "consulta";
    const engine = new PortalEngine(
      new MemoryRepository(state),
      () => DEMO_NOW,
    );
    engine.generate(users[2]!, "2026-10", "Fiscal");
    expect(
      engine
        .snapshot(users[2]!)
        .tasks.filter(
          (t) =>
            t.companyId === state.companies[0]!.id &&
            t.competence === "2026-10",
        )
        .every((t) => t.assigneeId !== "consulta"),
    ).toBe(true);
  });
  it("keeps company sequence independent from another tenant", () => {
    const state = createSeed();
    state.companies.push({
      ...state.companies[0]!,
      tenantId: "foreign",
      id: "foreign",
      code: "9999",
    });
    const engine = new PortalEngine(
      new MemoryRepository(state),
      () => DEMO_NOW,
    );
    expect(
      engine.addCompany(users[2]!, {
        name: "Empresa fictícia",
        cnpj: cnpjFromBase("999999990001"),
        regime: "Simples Nacional",
        city: "Cidade / SP",
        ownerId: "julia",
      }).code,
    ).toBe("0113");
  });
});
