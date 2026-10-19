import { describe, expect, it } from "vitest";
import {
  businessDate,
  businessTime,
  createSeed,
  DEMO_NOW,
  documentsReady,
  latestDocuments,
  MemoryRepository,
  matchesSelection,
  metric,
  PERMISSIONS,
  PortalEngine,
} from "../packages/domain/src/index.js";
import type { Task } from "../packages/domain/src/index.js";

function fixture(status: Task["status"] = "in_progress") {
  const state = createSeed();
  const admin = {
    ...state.users.find((user) => user.userId === "helena")!,
    permissions: [...PERMISSIONS],
    active: true,
  };
  const operator = {
    ...state.users.find((user) => user.userId === "julia")!,
    permissions: ["tasks.view", "tasks.execute", "tasks.attach"] as const,
    active: true,
  };
  const actor = { ...operator, permissions: [...operator.permissions] };
  state.users = state.users.map((user) =>
    user.userId === actor.userId
      ? actor
      : user.userId === admin.userId
        ? admin
        : user,
  );
  const task = state.tasks.find(
    (item) => item.assigneeId === actor.userId && item.department === "Fiscal",
  )!;
  task.status = status;
  task.requiresReview = false;
  task.steps = task.steps.map((step) => ({ ...step, completed: true }));
  task.startedAt = "2026-09-10T12:00:00-03:00";
  task.executionActorIds = [actor.userId];
  const repository = new MemoryRepository(state);
  const engine = new PortalEngine(repository, () => DEMO_NOW);
  return { repository, engine, actor, admin, task };
}

describe("connections between task execution, company ownership and document rules", () => {
  it("keeps a real cancellation out of delivery metrics and restores it only after reopening", () => {
    const { engine, admin, task } = fixture();
    const cancelled = engine.command(admin, task.id, {
      type: "cancel",
      expectedRevision: task.revision,
      reason: "Cancelamento sintético para testar indicadores",
    });
    expect(cancelled).toMatchObject({ status: "dispensed", cancelled: true });
    expect(metric([cancelled], "2026-10-15")).toMatchObject({
      total: 0,
      cancelled: 1,
      dispensed: 0,
      progress: 0,
    });
    expect(
      matchesSelection(cancelled, { status: "closed" }, "2026-10-15"),
    ).toBe(false);
    expect(
      matchesSelection(cancelled, { status: "cancelled" }, "2026-10-15"),
    ).toBe(true);
    const reopened = engine.command(admin, task.id, {
      type: "reopen",
      expectedRevision: cancelled.revision,
      reason: "Reabertura sintética para testar retorno à operação",
    });
    expect(metric([reopened], "2026-10-15")).toMatchObject({
      total: 1,
      open: 1,
      cancelled: 0,
      dispensed: 0,
    });
  });
  it.each(["in_progress", "waiting", "in_review"] as const)(
    "claims a transferred %s task without losing progress or participants",
    (status) => {
      const { repository, engine, actor, task } = fixture(status);
      const state = repository.read();
      state.tasks.find((item) => item.id === task.id)!.assigneeId =
        "department:Fiscal";
      repository.replace(state);
      const claimed = engine.command(actor, task.id, {
        type: "start",
        expectedRevision: task.revision,
      });
      expect(claimed).toMatchObject({
        assigneeId: actor.userId,
        status,
        startedAt: task.startedAt,
        steps: task.steps,
        executionActorIds: task.executionActorIds,
      });
      expect(
        engine
          .snapshot(actor)
          .audit.some(
            (event) =>
              event.taskId === task.id &&
              event.action === "Tarefa assumida da fila",
          ),
      ).toBe(true);
      expect(() =>
        engine.command(actor, task.id, {
          type: "start",
          expectedRevision: task.revision,
        }),
      ).toThrow();
      if (status === "in_progress")
        expect(
          engine.command(actor, task.id, {
            type: "step",
            expectedRevision: claimed.revision,
            stepId: claimed.steps[0]!.id,
            completed: false,
          }).steps[0]!.completed,
        ).toBe(false);
      if (status === "waiting")
        expect(
          engine.command(actor, task.id, {
            type: "resume",
            expectedRevision: claimed.revision,
          }).status,
        ).toBe("in_progress");
    },
  );

  it("continues execution after the manager transfers a company's open tasks to the department", () => {
    const { repository, engine, actor, admin, task } = fixture();
    const company = repository
      .read()
      .companies.find((item) => item.id === task.companyId)!;
    const proposal = engine.proposeCompanyChange(admin, {
      companyId: company.id,
      expectedRevision: company.revision ?? 1,
      effectiveCompetence: task.competence,
      reason: "Devolver a carteira para a fila do setor",
      transferOpenTasks: true,
      patch: { responsibilities: { Fiscal: { mode: "department" } } },
    });
    engine.decideChangeProposal(admin, proposal.id, {
      expectedRevision: proposal.revision,
      decision: "approve",
    });
    const queued = engine
      .snapshot(actor)
      .tasks.find((item) => item.id === task.id)!;
    expect(queued.assigneeId).toBe("department:Fiscal");
    const claimed = engine.command(actor, queued.id, {
      type: "start",
      expectedRevision: queued.revision,
    });
    expect(claimed.status).toBe("in_progress");
    expect(claimed.steps).toEqual(task.steps);
  });

  it("does not let a superseded accepted document satisfy a current mandatory type", () => {
    const { repository, engine, actor, task } = fixture();
    const state = repository.read();
    const current = state.tasks.find((item) => item.id === task.id)!;
    current.requiredDocumentTypeIds = ["receipt"];
    const doc = {
      name: "fixture.pdf",
      kind: "PDF" as const,
      bytes: 100,
      createdAt: DEMO_NOW,
      authorId: actor.userId,
    };
    current.documents = [
      {
        ...doc,
        id: "receipt-v1",
        logicalId: "receipt",
        version: 1,
        documentTypeId: "receipt",
        validation: "accepted",
      },
      {
        ...doc,
        id: "receipt-v2",
        logicalId: "receipt",
        version: 2,
        documentTypeId: "receipt",
        validation: "rejected",
      },
      {
        ...doc,
        id: "support-v1",
        logicalId: "support",
        version: 3,
        validation: "accepted",
      },
    ];
    repository.replace(state);
    expect(documentsReady(current)).toBe(false);
    expect(latestDocuments(current.documents).map((entry) => entry.id)).toEqual(
      ["receipt-v2", "support-v1"],
    );
    expect(() =>
      engine.command(actor, current.id, {
        type: "complete",
        expectedRevision: current.revision,
      }),
    ).toThrow("tipos de documentos");
    expect(
      repository.read().tasks.find((item) => item.id === task.id)!.status,
    ).toBe("in_progress");
  });

  it("keeps a valid independent document usable when another attachment was rejected", () => {
    const { repository, engine, actor, task } = fixture();
    const state = repository.read();
    const current = state.tasks.find((item) => item.id === task.id)!;
    current.requiredDocumentTypeIds = [];
    const doc = {
      name: "fixture.pdf",
      kind: "PDF" as const,
      bytes: 100,
      createdAt: DEMO_NOW,
      authorId: actor.userId,
    };
    current.documents = [
      {
        ...doc,
        id: "valid",
        logicalId: "valid",
        version: 1,
        validation: "accepted",
      },
      {
        ...doc,
        id: "invalid",
        logicalId: "other",
        version: 2,
        validation: "rejected",
      },
    ];
    repository.replace(state);
    expect(documentsReady(current)).toBe(true);
    expect(
      engine.command(actor, current.id, {
        type: "complete",
        expectedRevision: current.revision,
      }).status,
    ).toBe("done");
  });
});

describe("business dates shared by tasks, dashboards and reports", () => {
  it("keeps UTC instants in the same São Paulo business day and competence", () => {
    expect(businessDate("2026-10-01T02:30:00Z")).toBe("2026-09-30");
    expect(businessDate("2026-10-01T03:00:00Z")).toBe("2026-10-01");
    expect(businessDate("2026-10-01")).toBe("2026-10-01");
    expect(businessTime("2026-10-01T02:30:00Z")).toBe("23:30");
    expect(businessTime("2026-10-01T03:00:00Z")).toBe("00:00");
    expect(businessDate("invalid legacy timestamp")).toBe("");
    expect(businessTime("invalid legacy timestamp")).toBe("—");
  });
});
