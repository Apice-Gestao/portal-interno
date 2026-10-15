import type { Actor, PortalState, Task, TaskTemplate } from "./types.js";
import { cnpjFromBase } from "./identifiers.js";
export const DEMO_TODAY = "2026-10-07";
export const DEMO_NOW = "2026-10-07T15:30:00-03:00";
export const users: Actor[] = [
  {
    userId: "julia",
    tenantId: "apice-demo",
    name: "Júlia Martins",
    initials: "JM",
    role: "operator",
    departments: ["Fiscal"],
  },
  {
    userId: "marina",
    tenantId: "apice-demo",
    name: "Marina Costa",
    initials: "MC",
    role: "operator",
    departments: ["Fiscal"],
  },
  {
    userId: "rafael",
    tenantId: "apice-demo",
    name: "Rafael Oliveira",
    initials: "RO",
    role: "coordinator",
    departments: ["Fiscal"],
  },
  {
    userId: "helena",
    tenantId: "apice-demo",
    name: "Helena Almeida",
    initials: "HA",
    role: "admin",
    departments: ["Fiscal", "Contábil", "Pessoal"],
  },
  {
    userId: "consulta",
    tenantId: "apice-demo",
    name: "Perfil de consulta",
    initials: "CO",
    role: "viewer",
    departments: ["Fiscal"],
  },
];
const companyNames = [
  "Aurora Comércio",
  "Vértice Engenharia",
  "Horizonte Clínica",
  "Norte Tecnologia",
  "Essência Alimentos",
  "Raiz Arquitetura",
  "Lumina Educação",
  "Atlas Logística",
  "Jardim Farmácia",
  "Prisma Consultoria",
  "Brisa Hotelaria",
  "Ponto Design",
];
export function createSeed(): PortalState {
  const companies = companyNames.map((name, i) => ({
    id: `company-${i + 1}`,
    tenantId: "apice-demo",
    code: String(i + 101).padStart(4, "0"),
    name,
    cnpj: cnpjFromBase(`${String(i + 1).padStart(8, "0")}0001`),
    regime: i % 3 === 0 ? "Lucro Presumido" : "Simples Nacional",
    city:
      ["São Paulo / SP", "Campinas / SP", "Santos / SP"][i % 3] ??
      "São Paulo / SP",
    active: true,
    ownerId: i < 9 ? "julia" : "marina",
    startDate: "2026-01-01",
  }));
  const templates: TaskTemplate[] = [
    {
      id: "pgdas",
      tenantId: "apice-demo",
      title: "PGDAS-D",
      description: "Apuração mensal do Simples Nacional",
      department: "Fiscal",
      regime: "Simples Nacional",
      periodicity: "Mensal",
      internalDay: 15,
      legalDay: 20,
      requiresReview: true,
      requiredDocument: "Guia DAS",
      version: 1,
      active: true,
    },
    {
      id: "dctf",
      tenantId: "apice-demo",
      title: "DCTFWeb",
      description: "Declaração de débitos e créditos tributários",
      department: "Fiscal",
      regime: "Todos",
      periodicity: "Mensal",
      internalDay: 7,
      legalDay: 15,
      requiresReview: true,
      requiredDocument: "Recibo de transmissão",
      version: 2,
      active: true,
    },
    {
      id: "efd",
      tenantId: "apice-demo",
      title: "EFD-Reinf",
      description: "Escrituração de retenções e informações fiscais",
      department: "Fiscal",
      regime: "Todos",
      periodicity: "Mensal",
      internalDay: 6,
      legalDay: 15,
      requiresReview: true,
      requiredDocument: "Recibo de entrega",
      version: 1,
      active: true,
    },
    {
      id: "iss",
      tenantId: "apice-demo",
      title: "ISS",
      description: "Apuração do imposto sobre serviços",
      department: "Fiscal",
      regime: "Todos",
      periodicity: "Mensal",
      internalDay: 3,
      legalDay: 6,
      requiresReview: false,
      requiredDocument: "Guia de recolhimento",
      version: 1,
      active: true,
    },
    {
      id: "contabil",
      tenantId: "apice-demo",
      title: "Conciliação",
      description: "Conciliação bancária mensal",
      department: "Contábil",
      regime: "Todos",
      periodicity: "Mensal",
      internalDay: 20,
      legalDay: 28,
      requiresReview: true,
      requiredDocument: "Relatório de conciliação",
      version: 1,
      active: true,
    },
    {
      id: "folha",
      tenantId: "apice-demo",
      title: "Folha de pagamento",
      description: "Fechamento mensal da folha",
      department: "Pessoal",
      regime: "Todos",
      periodicity: "Mensal",
      internalDay: 3,
      legalDay: 5,
      requiresReview: true,
      requiredDocument: "Resumo da folha",
      version: 1,
      active: true,
    },
  ];
  const tasks: Task[] = [];
  companies.forEach((company, ci) =>
    templates.slice(0, 4).forEach((template, ti) => {
      if (template.regime !== "Todos" && company.regime !== template.regime)
        return;
      const index = ci * 4 + ti;
      const status =
        (
          [
            "todo",
            "in_progress",
            "todo",
            "in_review",
            "done",
            "waiting",
            "todo",
            "returned",
            "done",
            "in_progress",
            "todo",
            "done",
          ] as const
        )[index % 12] ?? "todo";
      const completed = status === "in_review" || status === "done";
      tasks.push({
        id: `task-${index + 1}`,
        tenantId: "apice-demo",
        companyId: company.id,
        templateId: template.id,
        templateVersion: template.version,
        title: template.title,
        description: template.description,
        department: template.department,
        competence: "2026-09",
        internalDue: `2026-10-${String(template.internalDay).padStart(2, "0")}`,
        legalDue: `2026-10-${String(template.legalDay).padStart(2, "0")}`,
        status,
        assigneeId: company.ownerId,
        executorId: status !== "todo" ? company.ownerId : undefined,
        executionActorIds: status !== "todo" ? [company.ownerId] : [],
        requiresReview: template.requiresReview,
        steps: [
          {
            id: "check",
            title: "Conferir dados e documentos da empresa",
            completed,
          },
          {
            id: "calculate",
            title: "Realizar apuração e validar os valores",
            completed,
          },
          {
            id: "prepare",
            title: "Preparar a entrega e anexar a evidência",
            completed,
          },
        ],
        documentLabel: template.requiredDocument,
        documents: completed
          ? [
              {
                id: `doc-${index}`,
                version: 1,
                name: `${template.title}_09-2026.pdf`,
                bytes: 148320,
                kind: "PDF",
                createdAt: "2026-10-05T14:20:00-03:00",
                authorId: company.ownerId,
                validation: "accepted",
              },
            ]
          : [],
        revision: 1,
        dispenseRequested: index === 9,
        startedAt: status !== "todo" ? "2026-10-05T13:00:00-03:00" : undefined,
        originalCompletedAt:
          status === "done" ? "2026-10-05T14:30:00-03:00" : undefined,
        completedAt:
          status === "done" ? "2026-10-05T14:30:00-03:00" : undefined,
        reopenedCount: status === "returned" ? 1 : 0,
      });
    }),
  );
  companies.slice(0, 3).forEach((company, i) => {
    const template = templates[4 + (i % 2)];
    if (template)
      tasks.push({
        ...structuredClone(tasks[0]!),
        id: `other-${i}`,
        companyId: company.id,
        templateId: template.id,
        title: template.title,
        description: template.description,
        department: template.department,
        assigneeId: "helena",
        internalDue: "2026-10-20",
        legalDue: "2026-10-28",
        status: "todo",
        documents: [],
      });
  });
  const audit = tasks
    .filter((t) => t.status !== "todo")
    .map((t, i) => ({
      id: `event-${i}`,
      tenantId: t.tenantId,
      taskId: t.id,
      companyId: t.companyId,
      department: t.department,
      actorId: t.assigneeId,
      actorName: users.find((u) => u.userId === t.assigneeId)?.name ?? "Equipe",
      action:
        t.status === "done"
          ? "Tarefa concluída"
          : t.status === "in_review"
            ? "Encaminhada para conferência"
            : "Execução iniciada",
      detail: `${t.title} · ${companies.find((c) => c.id === t.companyId)?.name ?? ""}`,
      at: "2026-10-07T10:15:00-03:00",
    }));
  return { companies, templates, tasks, audit, users: structuredClone(users) };
}
