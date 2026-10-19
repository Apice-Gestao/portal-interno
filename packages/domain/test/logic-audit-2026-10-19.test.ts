import { beforeEach, describe, expect, it } from "vitest";
import {
  createSeed,
  createTvFeed,
  DEMO_NOW,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
  tvCompetence,
  users,
} from "../src/index.js";
import type { Actor, Permission } from "../src/index.js";

// Regressions for L15–L16 and the manual-generation part of L03 in the
// consolidated 19/10/2026 logic audit (docs/AUDITORIA-LOGICA-2026-10-19.md);
// L01–L14 are covered by audit-2026-10-19.test.ts.
const admin: Actor = {
  ...users.find((user) => user.userId === "helena")!,
  permissions: [...PERMISSIONS] as Permission[],
};
let repository: MemoryRepository;
let engine: PortalEngine;
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

function oneOff(assigneeId: string, requiresReview = true) {
  return engine.addTask(admin, {
    title: "Conferência independente",
    description: "Cenário da auditoria de lógica",
    companyId: "company-1",
    department: "Fiscal",
    internalDue: "2026-10-15",
    legalDue: "2026-10-20",
    assigneeId,
    requiresReview,
  });
}

describe("manual generation with a deactivated responsible", () => {
  it("manual generation skips a company whose responsible is deactivated and names it", () => {
    const state = repository.read();
    const broken = state.companies.find((item) => item.id === "company-1")!;
    broken.responsibilities = {
      ...broken.responsibilities,
      Fiscal: { mode: "person", userId: "julia" },
    };
    state.users.find((user) => user.userId === "julia")!.active = false;
    repository.replace(state);
    const result = engine.generate(admin, "2026-11", "Fiscal");
    expect(result.skipped).toContain(broken.name);
    expect(result.created).toBeGreaterThan(0);
    expect(tasksOf("2026-11")).toHaveLength(0);
    expect(
      repository
        .read()
        .audit.some((event) => event.action === "Geração com pendências"),
    ).toBe(true);
  });

});

describe("competence of one-off tasks and TV", () => {
  it("a one-off task lands in the chosen competence", () => {
    const task = engine.addTask(admin, {
      title: "Ajuste de competência",
      description: "Tarefa avulsa da competência em andamento",
      companyId: "company-1",
      department: "Fiscal",
      internalDue: "2026-10-15",
      legalDue: "2026-10-20",
      assigneeId: "julia",
      requiresReview: false,
      competence: "2026-09",
    });
    expect(task.competence).toBe("2026-09");
    expect(oneOff("julia").competence).toBe("2026-10");
  });

  it("a TV device follows the competence in progress unless pinned", () => {
    expect(
      tvCompetence({ competence: "2026-08" }, "2026-11-10T12:00:00.000Z"),
    ).toBe("2026-10");
    expect(
      tvCompetence(
        { competence: "2026-08", followCurrent: false },
        "2026-11-10T12:00:00.000Z",
      ),
    ).toBe("2026-08");
    const device = {
      id: "tv-1",
      tenantId: admin.tenantId,
      name: "Recepção",
      departments: ["Fiscal"],
      competence: "2026-08",
      active: true,
      showNames: false,
      blocks: ["progress"],
      rotationSeconds: 12,
      version: 1,
      createdAt: DEMO_NOW,
      updatedAt: DEMO_NOW,
    } as Parameters<typeof createTvFeed>[1];
    expect(
      createTvFeed(repository.read(), device, DEMO_NOW).device.competence,
    ).toBe("2026-09");
  });
});
