import { beforeEach, describe, expect, it } from "vitest";
import {
  companyStatusGeneratesTasks,
  companyStatusLabel,
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
  users,
  workspaceOf,
} from "../src/index.js";
import type { Actor, Permission } from "../src/index.js";

const helena = users.find((user) => user.userId === "helena")!;
const admin: Actor = {
  ...helena,
  permissions: [...PERMISSIONS] as Permission[],
};
let repository: MemoryRepository;
let engine: PortalEngine;
const company = (id = "company-1") =>
  repository.read().companies.find((item) => item.id === id)!;
const workspaceRevision = () =>
  workspaceOf(repository.read(), admin.tenantId).revision;

beforeEach(() => {
  repository = new MemoryRepository(createSeed());
  engine = new PortalEngine(repository, () => DEMO_NOW);
});

function changeStatus(status: string, id = "company-1") {
  const proposal = engine.proposeCompanyChange(admin, {
    companyId: id,
    expectedRevision: company(id).revision ?? 1,
    patch: { status },
    effectiveCompetence: "2026-11",
    reason: "Mudança de situação para teste",
  });
  engine.decideChangeProposal(admin, proposal.id, {
    expectedRevision: proposal.revision,
    decision: "approve",
  });
}

describe("company situations (17/10/2026)", () => {
  it("knows which situations generate recurring tasks", () => {
    expect(companyStatusGeneratesTasks("active")).toBe(true);
    expect(companyStatusGeneratesTasks("closing")).toBe(true);
    expect(companyStatusGeneratesTasks("suspended")).toBe(false);
    expect(companyStatusGeneratesTasks("inactive")).toBe(false);
    expect(companyStatusGeneratesTasks("suspended:aguardando-cliente")).toBe(
      false,
    );
    expect(companyStatusGeneratesTasks("active:em-implantacao")).toBe(true);
  });

  it("stops generating tasks for a suspended company from its effective competence", () => {
    changeStatus("suspended");
    engine.generate(admin, "2026-11", "Fiscal");
    const tasks = repository
      .read()
      .tasks.filter(
        (task) =>
          task.companyId === "company-1" && task.competence === "2026-11",
      );
    expect(tasks).toHaveLength(0);
    engine.generate(admin, "2026-10", "Fiscal");
    expect(
      repository
        .read()
        .tasks.some(
          (task) =>
            task.companyId === "company-1" && task.competence === "2026-10",
        ),
    ).toBe(true);
  });

  it("accepts a created situation only after it exists and blocks removing it while in use", () => {
    expect(() => changeStatus("suspended:aguardando-cliente")).toThrow(
      expect.objectContaining({ code: "INVALID_STATUS" }),
    );
    engine.updateWorkspaceSettings(admin, {
      expectedRevision: workspaceRevision(),
      companyStatuses: [
        { id: "suspended:aguardando-cliente", label: "Aguardando cliente" },
      ],
    });
    changeStatus("suspended:aguardando-cliente");
    const workspace = workspaceOf(repository.read(), admin.tenantId);
    expect(
      companyStatusLabel(
        company().operationalHistory?.at(-1)?.status,
        workspace,
      ),
    ).toBe("Aguardando cliente");
    expect(() =>
      engine.updateWorkspaceSettings(admin, {
        expectedRevision: workspaceRevision(),
        companyStatuses: [],
      }),
    ).toThrow(expect.objectContaining({ code: "STATUS_IN_USE" }));
  });
});
