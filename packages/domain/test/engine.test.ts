import { beforeEach, describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  demoPdf,
  MemoryRepository,
  PortalEngine,
  users,
  validateEvidence,
  deadline,
  commandSchema,
  csvCell,
} from "../src/index.js";
import type { Actor, Task } from "../src/types.js";
const julia = users.find((u) => u.userId === "julia")!;
const marina = users.find((u) => u.userId === "marina")!;
const rafael = users.find((u) => u.userId === "rafael")!;
const viewer = users.find((u) => u.userId === "consulta")!;
let engine: PortalEngine;
let repository: MemoryRepository;
let task: Task;
function prepare(actor: Actor, target: Task): Task {
  let current = target;
  for (const step of current.steps)
    current = engine.command(actor, current.id, {
      type: "step",
      stepId: step.id,
      completed: true,
      expectedRevision: current.revision,
    });
  return engine.attach(actor, current.id, current.revision, {
    name: "demo.pdf",
    bytes: 100,
    kind: "PDF",
  });
}
beforeEach(() => {
  repository = new MemoryRepository(createSeed());
  engine = new PortalEngine(repository, () => DEMO_NOW);
  task = engine
    .snapshot(julia)
    .tasks.find((t) => t.status === "todo" && t.requiresReview)!;
});
describe("operational invariants", () => {
  it("keeps model and generation audit scoped to their department", () => {
    const helena = users.find((u) => u.userId === "helena")!;
    engine.addTemplate(helena, {
      title: "Rotina contábil fictícia",
      description: "Teste de isolamento de auditoria.",
      department: "Contábil",
      regime: "Todos",
      internalDay: 15,
      legalDay: 20,
      requiresReview: true,
      requiredDocument: "Evidência fictícia",
    });
    engine.generate(helena, "2026-10", "Contábil");
    expect(
      engine
        .snapshot(rafael)
        .audit.some(
          (e) => e.detail.includes("contábil") || e.department === "Contábil",
        ),
    ).toBe(false);
    expect(
      engine.snapshot(helena).audit.filter((e) => e.department === "Contábil"),
    ).toHaveLength(2);
  });
  it("rejects competencies whose following month is outside ISO dates", () => {
    const before = repository.read();
    expect(() => engine.generate(rafael, "9999-12", "Fiscal")).toThrow(
      "competência válida",
    );
    expect(() => engine.generate(rafael, "0000-01", "Fiscal")).toThrow(
      "competência válida",
    );
    expect(repository.read()).toEqual(before);
  });
  it("records before and after without later mutations rewriting history", () => {
    const started = engine.command(julia, task.id, {
      type: "start",
      expectedRevision: task.revision,
    });
    const event = engine
      .snapshot(julia)
      .audit.find((e) => e.taskId === task.id)!;
    expect(event.before).toMatchObject({ status: "todo", revision: 1 });
    expect(event.after).toMatchObject({ status: "in_progress", revision: 2 });
    engine.command(julia, task.id, {
      type: "step",
      stepId: started.steps[0]!.id,
      completed: true,
      expectedRevision: started.revision,
    });
    expect(
      engine.snapshot(julia).audit.find((e) => e.id === event.id)?.after
        ?.completedStepIds,
    ).toEqual([]);
  });
  it("blocks missing steps and evidence without partially mutating state", () => {
    const started = engine.command(julia, task.id, {
      type: "start",
      expectedRevision: task.revision,
    });
    const before = repository.read();
    expect(() =>
      engine.command(julia, task.id, {
        type: "submit",
        expectedRevision: started.revision,
      }),
    ).toThrow("etapas");
    expect(repository.read()).toEqual(before);
  });
  it("blocks submission without evidence even when every step is complete", () => {
    let current = engine.command(julia, task.id, {
      type: "start",
      expectedRevision: 1,
    });
    for (const step of current.steps)
      current = engine.command(julia, task.id, {
        type: "step",
        stepId: step.id,
        completed: true,
        expectedRevision: current.revision,
      });
    expect(() =>
      engine.command(julia, task.id, {
        type: "submit",
        expectedRevision: current.revision,
      }),
    ).toThrow("evidência");
  });
  it("allows a second person to approve and preserves original completion on reopening", () => {
    let current = prepare(
      julia,
      engine.command(julia, task.id, { type: "start", expectedRevision: 1 }),
    );
    current = engine.command(julia, task.id, {
      type: "submit",
      expectedRevision: current.revision,
    });
    expect(() =>
      engine.command(julia, task.id, {
        type: "approve",
        expectedRevision: current.revision,
      }),
    ).toThrow("outra pessoa");
    current = engine.command(marina, task.id, {
      type: "approve",
      expectedRevision: current.revision,
    });
    expect(current.status).toBe("done");
    const original = current.originalCompletedAt;
    current = engine.command(rafael, task.id, {
      type: "reopen",
      expectedRevision: current.revision,
      reason: "Corrigir os valores da entrega.",
    });
    expect(current.originalCompletedAt).toBe(original);
    expect(current.completedAt).toBeUndefined();
    expect(current.reopenedCount).toBe(1);
  });
  it("blocks self-review after reassignment", () => {
    let current = engine.command(julia, task.id, {
      type: "start",
      expectedRevision: 1,
    });
    current = engine.command(rafael, task.id, {
      type: "assign",
      expectedRevision: current.revision,
      assigneeId: marina.userId,
    });
    current = prepare(marina, current);
    current = engine.command(marina, task.id, {
      type: "submit",
      expectedRevision: current.revision,
    });
    expect(() =>
      engine.command(marina, task.id, {
        type: "approve",
        expectedRevision: current.revision,
      }),
    ).toThrow("outra pessoa");
    expect(engine.snapshot(julia).tasks.some((t) => t.id === task.id)).toBe(
      false,
    );
    expect(() =>
      engine.command(julia, task.id, {
        type: "approve",
        expectedRevision: current.revision,
      }),
    ).toThrow("escopo");
  });
  it("blocks a manager approving work they executed after reopening", () => {
    let current = prepare(
      julia,
      engine.command(julia, task.id, { type: "start", expectedRevision: 1 }),
    );
    current = engine.command(julia, task.id, {
      type: "submit",
      expectedRevision: current.revision,
    });
    current = engine.command(marina, task.id, {
      type: "approve",
      expectedRevision: current.revision,
    });
    current = engine.command(rafael, task.id, {
      type: "reopen",
      expectedRevision: current.revision,
      reason: "Revisar a documentação enviada.",
    });
    current = prepare(rafael, current);
    current = engine.command(rafael, task.id, {
      type: "submit",
      expectedRevision: current.revision,
    });
    expect(() =>
      engine.command(rafael, task.id, {
        type: "approve",
        expectedRevision: current.revision,
      }),
    ).toThrow("outra pessoa");
  });
  it("rejects a stale revision and keeps the successful change", () => {
    engine.command(julia, task.id, { type: "start", expectedRevision: 1 });
    expect(() =>
      engine.command(julia, task.id, { type: "start", expectedRevision: 1 }),
    ).toThrow("mudou");
    expect(
      engine.snapshot(julia).tasks.find((t) => t.id === task.id)?.revision,
    ).toBe(2);
  });
  it("requires coordinator privileges for dispensation and preserves request history", () => {
    expect(() =>
      engine.command(julia, task.id, {
        type: "dispense",
        expectedRevision: 1,
        reason: "Não há movimento no período.",
      }),
    ).toThrow("coordenador");
    let current = engine.command(julia, task.id, {
      type: "request_dispense",
      expectedRevision: 1,
      reason: "Não há movimento no período.",
    });
    expect(current.status).toBe("todo");
    current = engine.command(rafael, task.id, {
      type: "dispense",
      expectedRevision: current.revision,
      reason: "Conferido e aprovado pelo setor.",
    });
    expect(current.status).toBe("dispensed");
    expect(
      engine.snapshot(rafael).audit.filter((e) => e.taskId === task.id),
    ).toHaveLength(2);
  });
  it("denies all changes for read-only users", () => {
    expect(() =>
      engine.command(viewer, task.id, { type: "start", expectedRevision: 1 }),
    ).toThrow("consulta");
  });
  it("isolates another tenant and another department", () => {
    const outside = { ...rafael, tenantId: "another-tenant" };
    expect(engine.snapshot(outside).tasks).toHaveLength(0);
    expect(engine.snapshot(outside).companies).toHaveLength(0);
    expect(() =>
      engine.command(outside, task.id, { type: "start", expectedRevision: 1 }),
    ).toThrow("escopo");
    expect(() =>
      engine.command(julia, "other-0", { type: "start", expectedRevision: 1 }),
    ).toThrow("escopo");
  });
  it("generates idempotently and preserves old workflow snapshots", () => {
    const initial = engine.snapshot(rafael).tasks.length;
    const first = engine.generate(rafael, "2026-10", "Fiscal");
    const second = engine.generate(rafael, "2026-10", "Fiscal");
    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(first.created);
    expect(engine.snapshot(rafael).tasks.length).toBe(initial + first.created);
    const old = engine.snapshot(julia).tasks.find((t) => t.id === task.id);
    expect(old?.templateVersion).toBe(task.templateVersion);
  });
  it("versions evidence instead of overwriting it", () => {
    let current = engine.command(julia, task.id, {
      type: "start",
      expectedRevision: 1,
    });
    current = engine.attach(julia, task.id, current.revision, {
      name: "v1.pdf",
      bytes: 100,
      kind: "PDF",
    });
    current = engine.attach(julia, task.id, current.revision, {
      name: "v2.pdf",
      bytes: 200,
      kind: "PDF",
    });
    expect(current.documents.map((d) => [d.name, d.version])).toEqual([
      ["v1.pdf", 1],
      ["v2.pdf", 2],
    ]);
  });
  it("separates internal target and legal deadline", () => {
    const sample = {
      ...task,
      internalDue: "2026-10-06",
      legalDue: "2026-10-20",
      status: "in_progress" as const,
    };
    expect(deadline(sample, "2026-10-07")).toMatchObject({
      internalLate: true,
      legalLate: false,
      label: "Meta vencida",
    });
    expect(
      deadline(
        { ...sample, status: "done", completedAt: "2026-10-07T12:00:00-03:00" },
        "2026-10-25",
      ).label,
    ).toBe("Após meta interna");
  });
  it("rejects unauthorized fields and missing justification", () => {
    expect(
      commandSchema.safeParse({
        type: "dispense",
        expectedRevision: 1,
        reason: "",
        role: "admin",
      }).success,
    ).toBe(false);
  });
  it("keeps batch import atomic and repeat imports idempotent", () => {
    const valid = {
      name: "Teste Fictício",
      cnpj: "00.000.099/0001-00",
      regime: "Simples Nacional",
      city: "São Paulo",
      ownerId: "julia",
    };
    const before = repository.read();
    expect(() =>
      engine.importCompanies(rafael, [
        valid,
        { ...valid, cnpj: "00.000.098/0001-00", ownerId: "outsider" },
      ]),
    ).toThrow("Responsável");
    expect(repository.read()).toEqual(before);
    expect(engine.importCompanies(rafael, [valid])).toEqual({
      created: 1,
      existing: 0,
    });
    expect(engine.importCompanies(rafael, [valid])).toEqual({
      created: 0,
      existing: 1,
    });
  });
});
describe("file and export safety", () => {
  it("accepts a structurally valid demo PDF and XML", async () => {
    expect(await validateEvidence("sample.pdf", demoPdf())).toBe("PDF");
    expect(
      await validateEvidence(
        "sample.xml",
        new TextEncoder().encode("<root><item>demo</item></root>"),
      ),
    ).toBe("XML");
  });
  it.each([
    "<root><broken></root>",
    '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///secret">]><root>&x;</root>',
    "<script>alert(1)</script><other/>",
  ])("rejects unsafe or malformed XML: %s", async (text) => {
    await expect(
      validateEvidence("file.xml", new TextEncoder().encode(text)),
    ).rejects.toThrow();
  });
  it("rejects fake PDF markers and unsupported extensions", async () => {
    await expect(
      validateEvidence(
        "file.pdf",
        new TextEncoder().encode("%PDF-1.4\n<html>bad</html>\n%%EOF"),
      ),
    ).rejects.toThrow();
    await expect(validateEvidence("file.html", demoPdf())).rejects.toThrow();
  });
  it("rejects empty, oversized and path-like filenames", async () => {
    await expect(
      validateEvidence("empty.pdf", new Uint8Array()),
    ).rejects.toThrow();
    await expect(
      validateEvidence("big.pdf", new Uint8Array(5 * 1024 * 1024 + 1)),
    ).rejects.toThrow();
    await expect(validateEvidence("../file.pdf", demoPdf())).rejects.toThrow();
  });
  it("escapes CSV cells and neutralizes formula prefixes", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell('hello"world')).toBe('"hello""world"');
    expect(csvCell("\n+cmd")).toBe('"\' +cmd"');
  });
});
