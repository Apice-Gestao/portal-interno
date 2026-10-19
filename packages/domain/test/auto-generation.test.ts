import { describe, expect, it } from "vitest";
import {
  closedCompetence,
  createSeed,
  MemoryRepository,
  PortalEngine,
  SYSTEM_ACTOR_ID,
} from "../src/index.js";

describe("automatic monthly generation (17/10/2026)", () => {
  it("uses the competence that has just closed in São Paulo", () => {
    expect(closedCompetence("2026-10-17T15:00:00.000Z")).toBe("2026-09");
    expect(closedCompetence("2027-01-01T12:00:00.000Z")).toBe("2026-12");
    // 01/11 00:30 in São Paulo is still 31/10 in UTC-3 terms: competence 2026-09.
    expect(closedCompetence("2026-11-01T02:30:00.000Z")).toBe("2026-09");
  });

  it("creates the closed competence once, audited as the system, and is idempotent", () => {
    const repository = new MemoryRepository(createSeed());
    const engine = new PortalEngine(
      repository,
      () => "2026-11-05T12:00:00.000Z",
    );
    const first = engine.autoGenerate("apice-demo");
    expect(first.competence).toBe("2026-10");
    expect(first.created).toBeGreaterThan(0);
    const tasks = repository
      .read()
      .tasks.filter((task) => task.competence === "2026-10");
    expect(tasks).toHaveLength(first.created);
    const audit = repository
      .read()
      .audit.filter(
        (event) => event.action === "Geração automática de tarefas",
      );
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((event) => event.actorId === SYSTEM_ACTOR_ID)).toBe(
      true,
    );
    const second = engine.autoGenerate("apice-demo");
    expect(second.created).toBe(0);
    expect(
      repository.read().tasks.filter((task) => task.competence === "2026-10"),
    ).toHaveLength(first.created);
  });
});
