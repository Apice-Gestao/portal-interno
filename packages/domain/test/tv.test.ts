import { describe, expect, it } from "vitest";
import {
  createSeed,
  createTvDeviceSchema,
  createTvFeed,
  pairTvSchema,
  TV_BLOCKS,
  TV_DEFAULT_BLOCKS,
  tvDeviceSchema,
  updateTvDeviceSchema,
} from "../src/index.js";
import type { PortalState, Task, TvDevice } from "../src/index.js";

const now = "2026-10-14T12:00:00-03:00";
function device(patch: Partial<TvDevice> = {}): TvDevice {
  return {
    id: "tv-device-private-id",
    tenantId: "apice-demo",
    name: "TV Operação",
    departments: ["Fiscal"],
    competence: "2026-09",
    active: true,
    showNames: false,
    blocks: [...TV_BLOCKS],
    rotationSeconds: 12,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
function task(patch: Partial<Task> = {}): Task {
  return {
    ...createSeed().tasks[0]!,
    id: "task-private-id",
    tenantId: "apice-demo",
    companyId: "company-1",
    title: "PGDAS-D",
    department: "Fiscal",
    competence: "2026-09",
    status: "todo",
    internalDue: "2026-10-18",
    legalDue: "2026-10-20",
    completedAt: undefined,
    originalCompletedAt: undefined,
    ...patch,
  };
}
function state(tasks: Task[]): PortalState {
  return { ...createSeed(), tasks };
}

describe("TV device schemas", () => {
  const input = {
    name: "  Recepção  ",
    departments: ["Fiscal"],
    competence: "2026-09",
  };
  it("accepts supported configuration and normalizes pairing code", () => {
    expect(createTvDeviceSchema.parse(input).name).toBe("Recepção");
    expect(tvDeviceSchema.parse(device())).toEqual(device());
    expect(pairTvSchema.parse({ code: "  ab12cd34  " })).toEqual({
      code: "AB12CD34",
    });
    expect(
      updateTvDeviceSchema.parse({
        expectedVersion: 2,
        departments: ["Pessoal", "Fiscal", "Contábil"],
        showNames: true,
        blocks: ["upcoming", "progress"],
        rotationSeconds: 60,
        active: false,
      }),
    ).toMatchObject({ expectedVersion: 2, showNames: true, active: false });
  });

  it.each([
    { name: " " },
    { name: "x".repeat(61) },
    { departments: [] },
    { departments: ["Fiscal", "Fiscal"] },
    { departments: [""] },
    { competence: "2026-00" },
    { competence: "2026-13" },
    { competence: "0000-01" },
    { competence: "9999-12" },
    { competence: "2026-9" },
    { tenantId: "forged-tenant" },
    { showNames: true },
  ])("rejects invalid or client-forged device creation %j", (patch) => {
    expect(createTvDeviceSchema.safeParse({ ...input, ...patch }).success).toBe(
      false,
    );
  });

  it.each([
    { expectedVersion: 0 },
    { expectedVersion: 1.5 },
    { expectedVersion: "1" },
    { rotationSeconds: 4 },
    { rotationSeconds: 61 },
    { rotationSeconds: 5.5 },
    { blocks: [] },
    { blocks: ["progress", "progress"] },
    { blocks: ["performance"] },
    { departments: ["Fiscal", "Fiscal"] },
    { active: "false" },
    { tenantId: "forged-tenant" },
    { version: 99 },
    { tokenHash: "forged" },
  ])("rejects invalid or client-forged device update %j", (patch) => {
    expect(
      updateTvDeviceSchema.safeParse({ expectedVersion: 1, ...patch }).success,
    ).toBe(false);
  });

  it.each([
    { code: "AB12CD3" },
    { code: "AB12CD34EFG" },
    { code: "AB12-CD34" },
    { code: "AB12 CD34" },
    { code: "ÁB12CD34" },
    { code: "AB12CD34", tenantId: "foreign" },
  ])("rejects unsafe pairing request %j", (input) => {
    expect(pairTvSchema.safeParse(input).success).toBe(false);
  });

  it("requires complete versioned portable configuration without credentials", () => {
    expect(tvDeviceSchema.safeParse({ ...device(), version: 0 }).success).toBe(
      false,
    );
    expect(
      tvDeviceSchema.safeParse({ ...device(), createdAt: "2026-10-14" })
        .success,
    ).toBe(false);
    expect(
      tvDeviceSchema.safeParse({ ...device(), tokenHash: "secret" }).success,
    ).toBe(false);
    expect(
      tvDeviceSchema.safeParse({ ...device(), departments: [] }).success,
    ).toBe(false);
  });
});

describe("Sanitized TV aggregation", () => {
  it("isolates all counters and rows by server device tenant, department and competence", () => {
    const source = state([
      task({ id: "fiscal" }),
      task({
        id: "contabil",
        title: "Contábil privada",
        department: "Contábil",
      }),
      task({
        id: "previous",
        title: "Competência privada",
        competence: "2026-08",
      }),
      task({ id: "foreign", title: "Tenant privado", tenantId: "foreign" }),
    ]);
    const feed = createTvFeed(source, device(), now);
    expect(feed.total).toBe(1);
    expect(feed.companies).toBe(1);
    expect(feed.progress).toEqual({ closed: 0, total: 1, percent: 0 });
    expect(feed.upcoming).toHaveLength(1);
    expect(feed.obligations).toEqual([
      { title: "PGDAS-D", total: 1, completed: 0, percent: 0 },
    ]);
    expect(JSON.stringify(feed)).not.toContain("privada");
    expect(
      createTvFeed(source, device({ departments: ["Fiscal", "Contábil"] }), now)
        .total,
    ).toBe(2);
  });

  it("counts closures including dispenses without treating dispenses as deliveries", () => {
    const feed = createTvFeed(
      state([
        task({ status: "done", completedAt: "2026-10-12T16:00:00-03:00" }),
        task({ id: "dispensed", status: "dispensed" }),
        task({ id: "open" }),
      ]),
      device(),
      now,
    );
    expect(feed.progress).toEqual({ closed: 2, total: 3, percent: 67 });
    expect(feed.deadlines.done).toBe(2);
    expect(feed.deliveries).toHaveLength(1);
    expect(feed.upcoming).toHaveLength(1);
    expect(feed.obligations[0]).toEqual({
      title: "PGDAS-D",
      total: 3,
      completed: 2,
      percent: 67,
    });
  });

  it("partitions deadline situations and prioritizes legal delay, today and internal target", () => {
    const feed = createTvFeed(
      state([
        task({ id: "on-time", title: "No prazo" }),
        task({
          id: "meta",
          title: "Meta",
          internalDue: "2026-10-10",
          legalDue: "2026-10-22",
        }),
        task({
          id: "today",
          title: "Hoje",
          internalDue: "2026-10-10",
          legalDue: "2026-10-14",
        }),
        task({
          id: "legal",
          title: "Legal",
          internalDue: "2026-10-10",
          legalDue: "2026-10-12",
        }),
        task({ id: "closed", status: "done", completedAt: now }),
        task({ id: "dispensed", status: "dispensed" }),
      ]),
      device(),
      now,
    );
    expect(feed.deadlines).toEqual({
      legalLate: 1,
      internalLate: 1,
      dueToday: 1,
      onTime: 1,
      done: 2,
    });
    expect(
      Object.values(feed.deadlines).reduce((sum, count) => sum + count, 0),
    ).toBe(feed.total);
    expect(feed.upcoming.map((row) => row.urgency)).toEqual([
      "legal",
      "today",
      "internal",
      "on-time",
    ]);
  });

  it("handles empty scope without invented progress or NaN", () => {
    const feed = createTvFeed(state([]), device(), now);
    expect(feed.total).toBe(0);
    expect(feed.companies).toBe(0);
    expect(feed.progress).toEqual({ closed: 0, total: 0, percent: 0 });
    expect(Object.values(feed.deadlines)).toEqual([0, 0, 0, 0, 0]);
    expect(feed.obligations).toEqual([]);
    expect(feed.deliveries).toEqual([]);
    expect(feed.upcoming).toEqual([]);
  });

  it("emits only allowed team display fields and hides company names, IDs and private records", () => {
    const source = state([
      task(),
      task({ id: "delivery-private-id", status: "done", completedAt: now }),
    ]);
    const feed = createTvFeed(source, device(), now);
    expect(feed.upcoming[0]?.companyLabel).toBe("Empresa 0101");
    expect(feed.deliveries[0]?.companyLabel).toBe("Empresa 0101");
    expect(Object.keys(feed.device).sort()).toEqual([
      "blocks",
      "competence",
      "departments",
      "name",
      "rotationSeconds",
      "showNames",
    ]);
    expect(Object.keys(feed.upcoming[0]!).sort()).toEqual([
      "companyLabel",
      "department",
      "internalDue",
      "legalDue",
      "obligation",
      "responsibleLabel",
      "urgency",
    ]);
    expect(Object.keys(feed.deliveries[0]!).sort()).toEqual([
      "companyLabel",
      "completedAt",
      "department",
      "obligation",
      "responsibleLabel",
    ]);
    const serialized = JSON.stringify(feed);
    for (const secret of [
      source.companies[0]!.name,
      source.companies[0]!.cnpj,
      "task-private-id",
      "tv-device-private-id",
      "apice-demo",
      "assigneeId",
      "documents",
      "audit",
      "executorId",
      "executionActorIds",
    ])
      expect(serialized).not.toContain(secret);
  });

  it("company names require configuration and never expose foreign same-ID companies", () => {
    const source = state([task()]);
    source.companies.push({
      ...source.companies[0]!,
      tenantId: "foreign",
      name: "Empresa privada de outro tenant",
    });
    const feed = createTvFeed(source, device({ showNames: true }), now);
    expect(feed.upcoming[0]?.companyLabel).toBe("Aurora Comércio");
    expect(feed.upcoming[0]?.responsibleLabel).toBe("Júlia Martins");
    expect(JSON.stringify(feed)).not.toContain("Empresa privada");
    const missing = createTvFeed(
      {
        ...source,
        companies: source.companies.filter((row) => row.tenantId === "foreign"),
      },
      device({ showNames: true }),
      now,
    );
    expect(missing.upcoming[0]?.companyLabel).toBe("Empresa não informada");
  });

  it("sorts delivery timestamps as instants and ignores stale, missing or invalid completion timestamps", () => {
    const feed = createTvFeed(
      state([
        task({
          id: "older",
          title: "Anterior",
          status: "done",
          completedAt: "2026-10-14T10:30:00-03:00",
        }),
        task({
          id: "newer",
          title: "Recente",
          status: "done",
          completedAt: "2026-10-14T14:00:00Z",
        }),
        task({ id: "missing", status: "done" }),
        task({ id: "invalid", status: "done", completedAt: "invalid" }),
        task({
          id: "reopened",
          status: "returned",
          completedAt: "2026-10-08T10:00:00-03:00",
          internalDue: "2026-10-10",
          legalDue: "2026-10-12",
        }),
      ]),
      device(),
      now,
    );
    expect(feed.deliveries.map((row) => row.obligation)).toEqual([
      "Recente",
      "Anterior",
    ]);
    expect(feed.deadlines.legalLate).toBe(1);
    expect(feed.upcoming[0]?.urgency).toBe("legal");
    expect(feed.progress.closed).toBe(4);
  });

  it("limits display lists while retaining full-denominator totals", () => {
    const tasks = Array.from({ length: 75 }, (_, index) =>
      task({
        id: `open-${index}`,
        internalDue: "2026-10-18",
        legalDue: "2026-10-20",
      }),
    );
    tasks.push(
      ...Array.from({ length: 45 }, (_, index) =>
        task({
          id: `done-${index}`,
          status: "done",
          completedAt: new Date(Date.UTC(2026, 9, 13, 10, index)).toISOString(),
        }),
      ),
    );
    const feed = createTvFeed(state(tasks), device(), now);
    expect(feed.total).toBe(120);
    expect(feed.progress).toEqual({ closed: 45, total: 120, percent: 38 });
    expect(feed.deadlines).toMatchObject({ done: 45, onTime: 75 });
    expect(feed.deliveries).toHaveLength(30);
    expect(feed.upcoming).toHaveLength(60);
    expect(feed.obligations[0]?.total).toBe(120);
    expect(feed.deliveries[0]?.completedAt).toBe("2026-10-13T10:44:00.000Z");
  });

  it("does not mutate state or share mutable device arrays with the caller", () => {
    const source = state([task()]);
    const screen = device();
    const before = structuredClone(source);
    const feed = createTvFeed(source, screen, now);
    expect(source).toEqual(before);
    feed.device.departments.push("Pessoal");
    feed.device.blocks.reverse();
    expect(screen.departments).toEqual(["Fiscal"]);
    expect(screen.blocks).toEqual(TV_BLOCKS);
    expect(source).toEqual(before);
  });
  it("does not transmit hidden list blocks", () => {
    const feed = createTvFeed(
      state([task()]),
      device({ blocks: ["progress"] }),
      now,
    );
    expect(feed.total).toBe(1);
    expect(feed.obligations).toEqual([]);
    expect(feed.deliveries).toEqual([]);
    expect(feed.upcoming).toEqual([]);
    expect(feed.collaborators).toEqual([]);
  });
  it("hides ad-hoc request titles when names are disabled", () => {
    const source = state([
      task({
        templateId: "avulsa",
        title: "Solicitação particular de Cliente Teste",
      }),
    ]);
    const feed = createTvFeed(source, device(), now);
    expect(feed.upcoming[0]?.obligation).toBe("Tarefa avulsa");
    expect(feed.obligations[0]?.title).toBe("Tarefa avulsa");
    expect(JSON.stringify(feed)).not.toContain("Solicitação particular");
    expect(
      createTvFeed(source, device({ showNames: true }), now).upcoming[0]
        ?.obligation,
    ).toBe("Solicitação particular de Cliente Teste");
  });
  it("includes every active scoped collaborator, including accounts without tasks, without exposing other departments", () => {
    const source = state([]);
    source.users.push(
      {
        ...source.users[0]!,
        userId: "contabil-only",
        name: "Contábil exclusiva",
        departments: ["Contábil"],
      },
      {
        ...source.users[0]!,
        userId: "inactive",
        name: "Conta inativa",
        active: false,
      },
      {
        ...source.users[0]!,
        tenantId: "foreign",
        name: "Pessoa de outro tenant",
      },
    );
    const feed = createTvFeed(source, device(), now);
    expect(feed.collaborators).toHaveLength(5);
    expect(
      feed.collaborators.every(
        (person) => person.total === 0 && person.percent === 0,
      ),
    ).toBe(true);
    expect(
      feed.collaborators.find((person) => person.name === "Helena Almeida")
        ?.departments,
    ).toEqual(["Fiscal"]);
    const text = JSON.stringify(feed);
    for (const hidden of [
      "Contábil exclusiva",
      "Conta inativa",
      "Pessoa de outro tenant",
      "userId",
      "role",
      "permissions",
      "email",
    ])
      expect(text).not.toContain(hidden);
    const all = createTvFeed(
      source,
      device({ departments: ["Fiscal", "Contábil", "Pessoal"] }),
      now,
    );
    expect(all.collaborators).toHaveLength(6);
    expect(
      all.collaborators.some((person) => person.name === "Contábil exclusiva"),
    ).toBe(true);
  });
  it("aggregates each collaborator from all scoped departments and the selected competence only", () => {
    const source = state([
      task({ id: "progress", status: "in_progress" }),
      task({ id: "review", status: "in_review", department: "Contábil" }),
      task({
        id: "done",
        status: "done",
        completedAt: now,
        department: "Pessoal",
      }),
      task({ id: "dispensed", status: "dispensed" }),
      task({ id: "returned", status: "returned" }),
      task({ id: "other-month", competence: "2026-08" }),
      task({ id: "foreign-task", tenantId: "foreign" }),
      task({ id: "other-person", assigneeId: "helena" }),
    ]);
    const feed = createTvFeed(
      source,
      device({ departments: ["Fiscal", "Contábil", "Pessoal"] }),
      now,
    );
    expect(
      feed.collaborators.find((person) => person.name === "Júlia Martins"),
    ).toMatchObject({
      total: 5,
      pending: 3,
      inProgress: 1,
      inReview: 1,
      closed: 2,
      percent: 40,
    });
    expect(
      feed.collaborators.find((person) => person.name === "Helena Almeida"),
    ).toMatchObject({ total: 1, pending: 1, closed: 0 });
    expect(feed.total).toBe(6);
    expect(
      feed.upcoming.every(
        (item) => item.responsibleLabel !== "Responsável indisponível",
      ),
    ).toBe(true);
    expect(feed.deliveries[0]).toMatchObject({
      department: "Pessoal",
      responsibleLabel: "Júlia Martins",
    });
  });
  it("never resolves a task assignee using an inactive, foreign or out-of-scope account", () => {
    const source = state([task()]);
    source.users = [
      { ...source.users[0]!, tenantId: "foreign", name: "Nome externo" },
    ];
    expect(
      createTvFeed(source, device(), now).upcoming[0]?.responsibleLabel,
    ).toBe("Responsável indisponível");
    source.users = [{ ...createSeed().users[0]!, active: false }];
    expect(createTvFeed(source, device(), now).collaborators).toEqual([]);
    expect(
      createTvFeed(source, device(), now).upcoming[0]?.responsibleLabel,
    ).toBe("Responsável indisponível");
    source.users = [{ ...createSeed().users[0]!, departments: ["Contábil"] }];
    expect(
      createTvFeed(source, device(), now).upcoming[0]?.responsibleLabel,
    ).toBe("Responsável indisponível");
  });
  it("hides staff when its block and task lists are disabled, preserving source arrays", () => {
    const source = state([task()]);
    const feed = createTvFeed(source, device({ blocks: ["progress"] }), now);
    expect(feed.collaborators).toEqual([]);
    expect(JSON.stringify(feed)).not.toContain("Júlia Martins");
    const anonymous = createTvFeed(
      source,
      device({ blocks: ["upcoming", "deliveries"] }),
      now,
    );
    expect(anonymous.upcoming[0]?.responsibleLabel).toBe("Equipe");
    expect(JSON.stringify(anonymous)).not.toContain("Júlia Martins");
    const team = createTvFeed(source, device(), now);
    team.collaborators
      .find((person) => person.name === "Júlia Martins")!
      .departments.push("Pessoal");
    expect(source.users[0]!.departments).toEqual(["Fiscal"]);
    expect(TV_DEFAULT_BLOCKS).toEqual([
      "progress",
      "deadlines",
      "upcoming",
      "collaborators",
      "deliveries",
    ]);
    expect(
      tvDeviceSchema.safeParse(device({ blocks: [...TV_BLOCKS] })).success,
    ).toBe(true);
  });
});
