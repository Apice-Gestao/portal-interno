import { describe, it, expect } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PortalEngine,
  PERMISSIONS,
  departmentPositionLabel,
} from "../packages/domain/src/index.js";
import type {
  DepartmentDefinition,
  Permission,
} from "../packages/domain/src/index.js";
function fixture() {
  const state = createSeed();
  state.users = state.users.map((user) => ({
    ...user,
    active: true,
    permissions:
      user.userId === "helena"
        ? [...PERMISSIONS]
        : (["tasks.view", "tasks.execute"] as Permission[]),
  }));
  const repository = new MemoryRepository(state);
  return {
    repository,
    engine: new PortalEngine(repository, () => DEMO_NOW),
    admin: state.users.find((user) => user.userId === "helena")!,
    operator: state.users.find((user) => user.userId === "julia")!,
  };
}
function structuredDepartment(): DepartmentDefinition {
  return {
    id: "Fiscal",
    name: "Fiscal e consultoria",
    active: true,
    positions: [
      { id: "director", name: "Diretor técnico" },
      { id: "analyst", name: "Analista tributário" },
      { id: "operator", name: "Operador" },
    ],
    members: [
      { userId: "helena", positionId: "director" },
      { userId: "julia", positionId: "analyst", reportsTo: "helena" },
      { userId: "marina", positionId: "operator", reportsTo: "julia" },
    ],
  };
}
describe("organização livre dos departamentos", () => {
  it("saves custom jobs and reporting lines without changing account permissions", () => {
    const { engine, admin, repository, operator } = fixture();
    const before = repository.read().users;
    const original = engine.snapshot(admin).workspace;
    const saved = engine.updateWorkspaceSettings(admin, {
      expectedRevision: original.revision,
      departments: [
        structuredDepartment(),
        ...original.departments.filter((item) => item.id !== "Fiscal"),
      ],
    });
    expect(saved.departments[0]!.members).toHaveLength(3);
    expect(repository.read().users).toEqual(before);
    expect(departmentPositionLabel(saved, operator, "Fiscal")).toBe(
      "Analista tributário",
    );
    expect(
      engine
        .snapshot(operator)
        .tasks.every((task) => task.assigneeId === operator.userId),
    ).toBe(true);
  });
  it("rejects cross-tenant people, missing positions and leadership cycles atomically", () => {
    const { engine, admin, repository } = fixture();
    const workspace = engine.snapshot(admin).workspace;
    for (const department of [
      {
        ...structuredDepartment(),
        members: [{ userId: "foreign", positionId: "director" }],
      },
      { ...structuredDepartment(), positions: [] },
      {
        ...structuredDepartment(),
        members: [
          { userId: "helena", positionId: "director", reportsTo: "julia" },
          { userId: "julia", positionId: "analyst", reportsTo: "helena" },
        ],
      },
      {
        ...structuredDepartment(),
        members: [
          { userId: "julia", positionId: "analyst", reportsTo: "missing" },
        ],
      },
    ]) {
      const before = repository.read();
      expect(() =>
        engine.updateWorkspaceSettings(admin, {
          expectedRevision: workspace.revision,
          departments: [department, ...workspace.departments.slice(1)],
        }),
      ).toThrow();
      expect(repository.read()).toEqual(before);
    }
  });
  it("preserves the chosen department and job order with stable references", () => {
    const { engine, admin, repository } = fixture();
    const original = engine.snapshot(admin).workspace;
    const department = structuredDepartment();
    department.positions!.reverse();
    const saved = engine.updateWorkspaceSettings(admin, {
      expectedRevision: original.revision,
      departments: [
        original.departments[2]!,
        department,
        original.departments[1]!,
      ],
    });
    expect(engine.snapshot(admin).actor.departments).toEqual([
      "Pessoal",
      "Fiscal",
      "Contábil",
    ]);
    expect(saved.departments[1]!.positions![0]!.id).toBe("operator");
    expect(saved.departments[1]!.members![1]!.reportsTo).toBe("helena");
    expect(
      repository.read().users.find((user) => user.userId === "julia")!.role,
    ).toBe("operator");
  });
  it("does not disclose other memberships through snapshots or document-settings responses", () => {
    const { engine, admin, operator, repository } = fixture();
    const original = engine.snapshot(admin).workspace;
    const settings = engine.updateWorkspaceSettings(admin, {
      expectedRevision: original.revision,
      departments: [structuredDepartment(), ...original.departments.slice(1)],
    });
    const personal = engine.snapshot(operator).workspace;
    expect(personal.departments[0]!.members).toEqual([
      { userId: operator.userId, positionId: "analyst" },
    ]);
    const documentManager = {
      ...operator,
      permissions: ["documents.view", "documents.manage"] as Permission[],
    };
    const response = engine.updateWorkspaceSettings(documentManager, {
      expectedRevision: settings.revision,
      documentTypes: [
        ...settings.documentTypes,
        { id: "new-type", name: "Tipo adicional", formats: ["PDF"] },
      ],
    });
    expect(response.departments[0]!.members).toHaveLength(1);
    expect(
      repository.read().workspaces![0]!.departments[0]!.members,
    ).toHaveLength(3);
    expect(() =>
      engine.updateWorkspaceSettings(operator, {
        expectedRevision: response.revision,
        departments: personal.departments,
      }),
    ).toThrow();
  });
  it("allows one person to hold different jobs in different departments", () => {
    const { engine, admin, operator } = fixture();
    const original = engine.snapshot(admin).workspace;
    const settings = engine.updateWorkspaceSettings(admin, {
      expectedRevision: original.revision,
      departments: [
        structuredDepartment(),
        {
          ...original.departments[1]!,
          positions: [{ id: "coordinator", name: "Coordenador de projetos" }],
          members: [{ userId: operator.userId, positionId: "coordinator" }],
        },
        original.departments[2]!,
      ],
    });
    expect(departmentPositionLabel(settings, operator, "Fiscal")).toBe(
      "Analista tributário",
    );
    expect(departmentPositionLabel(settings, operator, "Contábil")).toBe(
      "Coordenador de projetos",
    );
    expect(engine.snapshot(operator).actor.departments).toEqual(["Fiscal"]);
  });
  it("requires an explicit management grant regardless of the job name", () => {
    const { engine, admin, operator } = fixture();
    const original = engine.snapshot(admin).workspace;
    engine.updateWorkspaceSettings(admin, {
      expectedRevision: original.revision,
      departments: [
        {
          ...structuredDepartment(),
          members: [{ userId: operator.userId, positionId: "director" }],
        },
        ...original.departments.slice(1),
      ],
    });
    expect(() =>
      engine.updateWorkspaceSettings(operator, {
        expectedRevision: 2,
        departments: original.departments,
      }),
    ).toThrow();
    expect(engine.snapshot(operator).actor.permissions).not.toContain(
      "users.manage",
    );
  });
});
