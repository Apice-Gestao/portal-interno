import { beforeEach, describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  getCompanyWorkflow,
  isWorkflowOverrideOutdated,
  MemoryRepository,
  PortalEngine,
  users,
} from "../src/index.js";
import type { Actor, PortalState } from "../src/index.js";

const helena = users.find((user) => user.userId === "helena")!;
const manager: Actor = {
  ...helena,
  permissions: [
    "templates.view",
    "templates.manage",
    "tasks.view",
    "tasks.team.view",
  ],
};
const steps = [
  { id: "collect", title: "Coletar extratos do cliente" },
  { id: "calc", title: "Apurar com regra própria da empresa" },
];
let repository: MemoryRepository;
let engine: PortalEngine;
const company = () =>
  repository.read().companies.find((item) => item.id === "company-1")!;
const revision = () => company().revision ?? 1;
const dctfVersion = () =>
  repository.read().templates.find((item) => item.id === "dctf")!.version;
const withState = (change: (state: PortalState) => void) => {
  const state = repository.read();
  change(state);
  repository.replace(state);
};

beforeEach(() => {
  repository = new MemoryRepository(createSeed());
  engine = new PortalEngine(repository, () => DEMO_NOW);
});

describe("company-specific task steps", () => {
  it("is used by tasks generated after the customization only", () => {
    // company-1 is Lucro Presumido, so the Fiscal template "dctf" applies to it.
    engine.generate(manager, "2026-10", "Fiscal");
    const before = repository
      .read()
      .tasks.find(
        (task) =>
          task.companyId === "company-1" &&
          task.templateId === "dctf" &&
          task.competence === "2026-10",
      )!;
    engine.setCompanyWorkflow(manager, {
      companyId: "company-1",
      templateId: "dctf",
      action: "save",
      workflowSteps: steps,
      expectedRevision: revision(),
      expectedTemplateVersion: dctfVersion(),
    });
    engine.generate(manager, "2026-11", "Fiscal");
    const state = repository.read();
    const after = state.tasks.find(
      (task) =>
        task.companyId === "company-1" &&
        task.templateId === "dctf" &&
        task.competence === "2026-11",
    )!;
    const other = state.tasks.find(
      (task) =>
        task.companyId !== "company-1" &&
        task.templateId === "dctf" &&
        task.competence === "2026-11",
    )!;
    expect(after.steps.map((step) => step.title)).toEqual(
      steps.map((step) => step.title),
    );
    expect(other.steps.map((step) => step.id)).not.toEqual(
      steps.map((step) => step.id),
    );
    // Existing tasks keep the steps they were created with.
    expect(
      state.tasks
        .find((task) => task.id === before.id)!
        .steps.map((step) => step.id),
    ).toEqual(before.steps.map((step) => step.id));
  });

  it("flags the customization when the general template changes, then keeps or resets it", () => {
    engine.setCompanyWorkflow(manager, {
      companyId: "company-1",
      templateId: "dctf",
      action: "save",
      workflowSteps: steps,
      expectedRevision: revision(),
      expectedTemplateVersion: dctfVersion(),
    });
    const template = () =>
      repository.read().templates.find((item) => item.id === "dctf")!;
    expect(isWorkflowOverrideOutdated(template(), company())).toBe(false);
    withState((state) => {
      state.templates.find((item) => item.id === "dctf")!.version += 1;
    });
    expect(isWorkflowOverrideOutdated(template(), company())).toBe(true);
    engine.setCompanyWorkflow(manager, {
      companyId: "company-1",
      templateId: "dctf",
      action: "acknowledge",
      expectedRevision: revision(),
      expectedTemplateVersion: dctfVersion(),
    });
    expect(isWorkflowOverrideOutdated(template(), company())).toBe(false);
    expect(getCompanyWorkflow(template(), company()).map((s) => s.id)).toEqual(
      steps.map((step) => step.id),
    );
    engine.setCompanyWorkflow(manager, {
      companyId: "company-1",
      templateId: "dctf",
      action: "reset",
      expectedRevision: revision(),
    });
    expect(company().workflowOverrides).toBeUndefined();
    expect(
      repository
        .read()
        .audit.filter(
          (event) => event.action === "Etapas da empresa atualizadas",
        ),
    ).toHaveLength(3);
  });

  it("requires the template permission, the template department and the current revision", () => {
    const viewer: Actor = { ...helena, permissions: ["templates.view"] };
    expect(() =>
      engine.setCompanyWorkflow(viewer, {
        companyId: "company-1",
        templateId: "dctf",
        action: "save",
        workflowSteps: steps,
        expectedRevision: revision(),
        expectedTemplateVersion: dctfVersion(),
      }),
    ).toThrow(expect.objectContaining({ status: 403 }));
    const otherDepartment: Actor = { ...manager, departments: ["Pessoal"] };
    expect(() =>
      engine.setCompanyWorkflow(otherDepartment, {
        companyId: "company-1",
        templateId: "dctf",
        action: "save",
        workflowSteps: steps,
        expectedRevision: revision(),
        expectedTemplateVersion: dctfVersion(),
      }),
    ).toThrow(expect.objectContaining({ status: 404 }));
    expect(() =>
      engine.setCompanyWorkflow(manager, {
        companyId: "company-1",
        templateId: "dctf",
        action: "save",
        workflowSteps: steps,
        expectedRevision: revision() + 5,
        expectedTemplateVersion: dctfVersion(),
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
    expect(() =>
      engine.setCompanyWorkflow(manager, {
        companyId: "company-1",
        templateId: "dctf",
        action: "reset",
        expectedRevision: revision(),
      }),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });

  it("rejects empty or malformed step lists", () => {
    expect(() =>
      engine.setCompanyWorkflow(manager, {
        companyId: "company-1",
        templateId: "dctf",
        action: "save",
        workflowSteps: [],
        expectedRevision: revision(),
        expectedTemplateVersion: dctfVersion(),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_WORKFLOW" }));
  });
});
