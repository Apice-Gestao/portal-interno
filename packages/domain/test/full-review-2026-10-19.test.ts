import { beforeEach, describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
  users,
  xmlCompetences,
  xmlRuleMismatch,
} from "../src/index.js";
import type { Actor, DocumentRule, Permission } from "../src/index.js";

// Regressions for C01–C04 of docs/REVISAO-COMPLETA-2026-10-19.md.
const admin: Actor = {
  ...users.find((user) => user.userId === "helena")!,
  permissions: [...PERMISSIONS] as Permission[],
};
const sectorManager = (department: string): Actor => ({
  ...admin,
  userId: `gestor-${department}`,
  departments: [department],
  permissions: ["companies.view", "companies.manage", "changes.manage"],
});
let repository: MemoryRepository;
let engine: PortalEngine;
const company = (id = "company-1") =>
  repository.read().companies.find((item) => item.id === id)!;

beforeEach(() => {
  repository = new MemoryRepository(createSeed());
  engine = new PortalEngine(repository, () => DEMO_NOW);
});

describe("C01 — XML competence in the formats offices receive", () => {
  const rule: DocumentRule = {
    id: "r1",
    name: "Recibo com competência",
    templateIds: [],
    documentTypeIds: ["recibo"],
    required: true,
    keywords: [],
    fields: ["competence"],
    active: true,
  };
  const check = (xml: string) =>
    xmlRuleMismatch(xml, {
      task: { templateId: "dctf", competence: "2026-09" },
      documentTypeId: "recibo",
      fileName: "recibo.xml",
      rules: [rule],
    });

  it("reads 2026-09, 09/2026, 09-2026, 202609 and attributes", () => {
    expect([...xmlCompetences("<a>2026-09-30</a><b>10/2026</b><c>202611</c>")].sort()).toEqual(
      ["2026-09", "2026-10", "2026-11"],
    );
    for (const xml of [
      "<recibo><competencia>2026-09</competencia></recibo>",
      "<recibo><periodo>09/2026</periodo></recibo>",
      "<recibo><periodo>09-2026</periodo></recibo>",
      "<recibo><perApur>202609</perApur></recibo>",
      '<recibo><ideEvento perApur="2026-09"/></recibo>',
    ])
      expect(check(xml)).toBeUndefined();
  });

  it("still refuses another competence and does not read CNPJ digits as a period", () => {
    expect(check("<recibo><competencia>2026-08</competencia></recibo>")).toMatch(/2026-09/);
    expect(check("<recibo><cnpj>12.345.202.609/0001-00</cnpj></recibo>")).toMatch(/2026-09/);
  });
});

describe("C02/C03 — proposals reach the sectors they affect", () => {
  const propose = (patch: Record<string, unknown>) =>
    engine.proposeCompanyChange(admin, {
      companyId: "company-1",
      expectedRevision: company().revision ?? 1,
      patch,
      effectiveCompetence: "2026-11",
      reason: "Alteração de teste da revisão",
    } as never);
  const sees = (department: string, id: string) =>
    engine
      .snapshot(sectorManager(department))
      .changeProposals?.some((proposal) => proposal.id === id) ?? false;

  it("a sector that does not serve the company does not see its proposals", () => {
    const state = repository.read();
    state.companies.find((item) => item.id === "company-1")!.responsibilities = {
      Fiscal: { mode: "person", userId: "julia" },
    };
    repository.replace(state);
    const proposal = propose({ regime: "Lucro Real" });
    expect(sees("Fiscal", proposal.id)).toBe(true);
    expect(sees("Pessoal", proposal.id)).toBe(false);
  });

  it("a regime change with one sector's responsible reaches every sector served", () => {
    const state = repository.read();
    state.companies.find((item) => item.id === "company-1")!.responsibilities = {
      Fiscal: { mode: "person", userId: "julia" },
      Contábil: { mode: "department" },
    };
    repository.replace(state);
    const proposal = propose({
      regime: "Lucro Real",
      responsibilities: { Fiscal: { mode: "person", userId: "marina" } },
    });
    expect(sees("Fiscal", proposal.id)).toBe(true);
    expect(sees("Contábil", proposal.id)).toBe(true);
    expect(sees("Pessoal", proposal.id)).toBe(false);
    // Only a responsible change stays with that sector.
    const onlyFiscal = propose({
      responsibilities: { Fiscal: { mode: "person", userId: "julia" } },
    });
    expect(sees("Contábil", onlyFiscal.id)).toBe(false);
  });
});

describe("C04 — a future portfolio transfer keeps earlier competences", () => {
  it("moves only open tasks from the effective competence on", () => {
    const fiscal = () =>
      repository
        .read()
        .tasks.filter(
          (task) =>
            task.companyId === "company-1" &&
            task.department === "Fiscal" &&
            !["done", "dispensed"].includes(task.status),
        );
    engine.generate(admin, "2026-12", "Fiscal");
    const before = new Map(fiscal().map((task) => [task.id, task.assigneeId]));
    expect([...before.keys()].length).toBeGreaterThan(0);
    engine.transferCompanies(admin, {
      companyIds: ["company-1"],
      department: "Fiscal",
      target: { mode: "person", userId: "marina" },
      transferOpenTasks: true,
      expectedRevisions: { "company-1": company().revision ?? 1 },
      effectiveCompetence: "2026-12",
    });
    for (const task of fiscal()) {
      if (task.competence >= "2026-12") expect(task.assigneeId).toBe("marina");
      else expect(task.assigneeId).toBe(before.get(task.id));
    }
  });
});
