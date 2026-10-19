import { useEffect, useState } from "react";
import { createTvFeed } from "@apice/domain";
import type {
  Actor,
  Department,
  PortalState,
  Task,
  TvDevice,
  TvFeed,
} from "@apice/domain";

// TEMPORARY: requested by the user on 14/10/2026. Remove this module and the
// explicit preview controls before production. Never persists or calls an API.
export const TV_SIMULATION_INTERVAL = 4000;
export const TV_SIMULATION_AVAILABLE = import.meta.env.DEV;
const SIMULATION_TENANT = "tv-simulation-only";
const people: { name: string; department: Department }[] = [
  { name: "Júlia Martins", department: "Fiscal" },
  { name: "Marina Costa", department: "Fiscal" },
  { name: "Rafael Oliveira", department: "Fiscal" },
  { name: "Camila Rocha", department: "Fiscal" },
  { name: "Ana Silva", department: "Contábil" },
  { name: "Bruno Mendes", department: "Contábil" },
  { name: "Lucas Alves", department: "Contábil" },
  { name: "Fernanda Lima", department: "Contábil" },
  { name: "Beatriz Souza", department: "Pessoal" },
  { name: "Thiago Costa", department: "Pessoal" },
  { name: "Paula Ribeiro", department: "Pessoal" },
  { name: "Diego Santos", department: "Pessoal" },
];
const obligations: Record<Department, string[]> = {
  Fiscal: ["PGDAS-D", "EFD-Reinf", "DCTFWeb", "Apuração de ICMS"],
  Contábil: [
    "Conciliação bancária",
    "Conciliação de fornecedores",
    "Fechamento contábil",
    "Revisão do balancete",
  ],
  Pessoal: [
    "Folha de pagamento",
    "Admissão",
    "Férias",
    "Conferência do eSocial",
  ],
};
function dateOffset(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function buildSimulation(source: TvFeed, step: number, at: string): TvFeed {
  const today = source.generatedAt.slice(0, 10);
  const users: Actor[] = people.map((person, index) => ({
    userId: `simulation-person-${index}`,
    tenantId: SIMULATION_TENANT,
    name: person.name,
    initials: person.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join(""),
    role: "operator",
    departments: [person.department],
    active: true,
  }));
  const companies: PortalState["companies"] = Array.from(
    { length: 12 },
    (_, index) => ({
      id: `simulation-company-${index}`,
      tenantId: SIMULATION_TENANT,
      code: `SIM${String(index + 1).padStart(2, "0")}`,
      name: `Empresa de demonstração ${String(index + 1).padStart(2, "0")}`,
      cnpj: "",
      regime: "Demonstração",
      city: "",
      active: true,
      ownerId: users[index]!.userId,
      startDate: today,
    }),
  );
  function newTask(index: number, personIndex: number): Task {
    const person = people[personIndex]!;
    const variety = Math.floor(index / people.length);
    const slot = (variety + Math.floor(personIndex / 4)) % 4;
    const legal = [-2, 0, 4, 6][slot]!;
    const internal = [-5, 0, -2, 2][slot]!;
    return {
      id: `simulation-task-${index}`,
      tenantId: SIMULATION_TENANT,
      companyId: companies[(personIndex + variety) % companies.length]!.id,
      templateId: `simulation-template-${person.department}-${slot}`,
      templateVersion: 1,
      title: (obligations[person.department] ?? obligations.Fiscal!)[slot]!,
      description: "Dado fictício de simulação temporária.",
      department: person.department,
      competence: source.device.competence,
      internalDue: dateOffset(today, internal),
      legalDue: dateOffset(today, legal),
      status: "todo",
      assigneeId: users[personIndex]!.userId,
      executionActorIds: [],
      requiresReview: true,
      steps: [],
      documentLabel: "",
      documents: [],
      revision: 1,
      dispenseRequested: false,
      reopenedCount: 0,
    };
  }
  const tasks: Task[] = Array.from({ length: 60 }, (_, index) => {
    const task = newTask(index, index % people.length);
    const statuses: Task["status"][] = [
      "todo",
      "in_progress",
      "in_review",
      "waiting",
      "done",
      "todo",
      "in_progress",
    ];
    task.status = statuses[index % statuses.length]!;
    if (task.status === "done")
      task.completedAt = new Date(
        Date.parse(at) -
          (step % 240) * TV_SIMULATION_INTERVAL -
          (index + 1) * 60_000,
      ).toISOString();
    return task;
  });
  // Replay a short deterministic scenario: one event per tick. Bounded loop
  // keeps this disposable preview small even when left running for hours.
  for (let event = 0; event < step % 240; event++) {
    const person = (event + Math.floor(event / 4)) % people.length;
    if (event % 4 === 1) {
      tasks.push(newTask(tasks.length, person));
      continue;
    }
    const eligible = (task: Task) =>
      event % 4 === 0
        ? task.status === "in_review"
        : event % 4 === 2
          ? task.status === "todo" || task.status === "returned"
          : task.status === "in_progress";
    const task =
      tasks.find(
        (item) => item.assigneeId === users[person]!.userId && eligible(item),
      ) ?? tasks.find(eligible);
    if (!task) continue;
    if (event % 4 === 0) {
      task.status = "done";
      task.completedAt = new Date(
        Date.parse(at) - ((step % 240) - event - 1) * TV_SIMULATION_INTERVAL,
      ).toISOString();
    } else task.status = event % 4 === 2 ? "in_progress" : "in_review";
  }
  const state: PortalState = {
    users,
    companies,
    tasks,
    templates: [],
    audit: [],
  };
  const device: TvDevice = {
    ...source.device,
    id: "simulation-device",
    tenantId: SIMULATION_TENANT,
    name: "Simulação temporária · dados fictícios",
    active: true,
    rotationSeconds: 8,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
  return {
    ...createTvFeed(state, device, source.generatedAt),
    generatedAt: at,
  };
}

export function useTvSimulation(source: TvFeed | undefined, enabled: boolean) {
  const [clock, setClock] = useState(() => ({
    step: 0,
    at: new Date().toISOString(),
  }));
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(
      () =>
        setClock((current) => ({
          step: current.step + 1,
          at: new Date().toISOString(),
        })),
      TV_SIMULATION_INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [enabled]);
  return enabled && source
    ? buildSimulation(source, clock.step, clock.at)
    : source;
}
