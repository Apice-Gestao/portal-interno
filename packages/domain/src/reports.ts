import { z } from "zod";
import { hasPermission, PERMISSION_LABELS } from "./access.js";
import type { Permission } from "./access.js";
import type { Actor, Snapshot, Task, TaskStatus, Company } from "./types.js";
import { competenceSchema, departmentSchema } from "./schemas.js";
import { canSeeTask, deadline, statusLabels, roleLabels } from "./selectors.js";
import { obligationCell, obligationGroups } from "./task-query.js";
import { DomainError } from "./errors.js";
import { csvCell } from "./files.js";
import { businessDate } from "./dates.js";
import { latestDocuments } from "./documents.js";
import { companyStatusBase, companyStatusLabel } from "./workspace.js";

export type ReportCategory =
  | "essential"
  | "tasks"
  | "companies"
  | "processes"
  | "documents"
  | "management"
  | "access";
export type ReportDateBasis =
  | "competence"
  | "internalDue"
  | "legalDue"
  | "completedAt"
  | "startedAt"
  | "recordedAt";
export interface ReportSupports {
  dateBases: ReportDateBasis[];
  company: boolean;
  owner: boolean;
  regime: boolean;
  status: boolean;
  search: boolean;
  scope: boolean;
  /** Task lists can be summarized by collaborator or company (17/10/2026). */
  group: boolean;
}
// Task-list reports whose rows can be grouped by collaborator or company.
const GROUPABLE_REPORTS = [
  "reconciliation",
  "deliveries",
  "pending",
  "deadlines",
  "overdue",
  "internal-late",
  "review",
  "waiting",
  "returned",
  "department-queue",
  "dispense-requests",
  "cancelled",
  "missing-documents",
];
const taskDates: ReportDateBasis[] = [
  "competence",
  "internalDue",
  "legalDue",
  "completedAt",
  "startedAt",
];
const definition = <T extends string>(
  id: T,
  title: string,
  caption: string,
  category: ReportCategory,
  dateBasis: ReportDateBasis = "competence",
  extras: Permission[] = [],
  supports: Partial<ReportSupports> = {},
) => ({
  id,
  title,
  caption,
  category,
  dateBasis,
  requiredPermissions: ["reports.view", ...extras] as Permission[],
  supports: {
    dateBases: taskDates,
    company: true,
    owner: true,
    regime: true,
    status: true,
    search: true,
    scope: true,
    group: GROUPABLE_REPORTS.includes(id),
    ...supports,
  } as ReportSupports,
});
const companySupports: Partial<ReportSupports> = {
  dateBases: ["recordedAt"],
  status: false,
};
const processSupports: Partial<ReportSupports> = {
  dateBases: ["competence", "startedAt", "completedAt"],
  status: false,
};
const accessSupports: Partial<ReportSupports> = {
  dateBases: [],
  company: false,
  owner: true,
  regime: false,
  status: false,
};
export const REPORT_DEFINITIONS = [
  definition(
    "reconciliation",
    "Conciliação operacional",
    "Etapas, evidências e situação das atividades.",
    "essential",
  ),
  definition(
    "deliveries",
    "Entregas por competência",
    "Entregas concluídas no período.",
    "essential",
  ),
  definition(
    "pending",
    "Pendências e atrasos",
    "Atividades abertas e respectivos prazos.",
    "essential",
  ),
  definition(
    "matrix",
    "Matriz de obrigações",
    "Obrigações e situação por empresa.",
    "essential",
  ),
  definition(
    "productivity",
    "Entregas por colaborador",
    "Totais de execução e entregas individuais.",
    "essential",
    "competence",
    ["reports.performance.view"],
  ),
  definition(
    "changes",
    "Dispensas e reaberturas",
    "Histórico de exceções registradas nas tarefas.",
    "essential",
    "recordedAt",
    [],
    { dateBases: ["recordedAt", "competence"] },
  ),
  definition(
    "deadlines",
    "Agenda de prazos",
    "Metas e prazos legais das atividades.",
    "tasks",
    "legalDue",
  ),
  definition(
    "overdue",
    "Prazo legal vencido",
    "Atividades abertas após o prazo legal.",
    "tasks",
    "legalDue",
  ),
  definition(
    "internal-late",
    "Metas internas vencidas",
    "Atividades abertas após a meta interna.",
    "tasks",
    "internalDue",
  ),
  definition(
    "review",
    "Fila de conferência",
    "Entregas aguardando revisão.",
    "tasks",
  ),
  definition(
    "waiting",
    "Aguardando cliente",
    "Atividades pausadas por pendências externas.",
    "tasks",
  ),
  definition(
    "returned",
    "Devoluções e retrabalho",
    "Atividades devolvidas ou já reabertas.",
    "tasks",
  ),
  definition(
    "department-queue",
    "Fila do departamento",
    "Atividades sem responsável individual.",
    "tasks",
  ),
  definition(
    "dispense-requests",
    "Solicitações de dispensa",
    "Pedidos que aguardam decisão do gestor.",
    "tasks",
  ),
  definition(
    "cancelled",
    "Tarefas canceladas",
    "Cancelamentos preservados no histórico.",
    "tasks",
  ),
  definition(
    "companies",
    "Cadastro de empresas",
    "Cadastros, códigos e início do atendimento.",
    "companies",
    "recordedAt",
    ["companies.view"],
    companySupports,
  ),
  definition(
    "new-companies",
    "Novas empresas",
    "Empresas pela data real de cadastro.",
    "companies",
    "recordedAt",
    ["companies.view"],
    companySupports,
  ),
  definition(
    "company-status",
    "Situação das empresas",
    "Ativas, em encerramento e inativas.",
    "companies",
    "recordedAt",
    ["companies.view"],
    companySupports,
  ),
  definition(
    "portfolios",
    "Carteiras e responsáveis",
    "Vínculos por pessoa, fila e departamento.",
    "companies",
    "recordedAt",
    ["companies.view"],
    companySupports,
  ),
  definition(
    "regimes",
    "Empresas por regime",
    "Regimes registrados no cadastro atual.",
    "companies",
    "recordedAt",
    ["companies.view"],
    companySupports,
  ),
  definition(
    "companies-without-tasks",
    "Empresas sem tarefas",
    "Empresas sem atividades no recorte escolhido.",
    "companies",
    "competence",
    ["companies.view"],
    { ...companySupports, dateBases: taskDates },
  ),
  definition(
    "processes",
    "Implantações e processos",
    "Andamento dos processos entre setores.",
    "processes",
    "startedAt",
    ["processes.view"],
    processSupports,
  ),
  definition(
    "process-stages",
    "Etapas entre departamentos",
    "Responsáveis e liberação de cada etapa.",
    "processes",
    "startedAt",
    ["processes.view"],
    processSupports,
  ),
  definition(
    "recurring-blocks",
    "Rotinas bloqueadas",
    "Implantações que aguardam liberar a rotina.",
    "processes",
    "startedAt",
    ["processes.view"],
    processSupports,
  ),
  definition(
    "documents",
    "Inventário de documentos",
    "Versões e validações das evidências anexadas.",
    "documents",
    "recordedAt",
    [],
    { dateBases: ["recordedAt", "competence"] },
  ),
  definition(
    "missing-documents",
    "Pendências documentais",
    "Atividades sem as evidências exigidas.",
    "documents",
  ),
  definition(
    "comments",
    "Comunicação nas tarefas",
    "Comentários e autoria no período.",
    "documents",
    "recordedAt",
    [],
    { dateBases: ["recordedAt", "competence"] },
  ),
  definition(
    "company-changes",
    "Alterações de empresas",
    "Propostas, decisões e competência de efeito.",
    "management",
    "recordedAt",
    ["changes.manage"],
    { dateBases: ["recordedAt", "competence"], status: false },
  ),
  definition(
    "activity",
    "Histórico de movimentações",
    "Registros operacionais sem detalhes de segurança.",
    "management",
    "recordedAt",
    ["settings.view"],
    { dateBases: ["recordedAt"], regime: false, status: false },
  ),
  definition(
    "user-access",
    "Acessos dos usuários",
    "Permissões concedidas e departamentos.",
    "access",
    "recordedAt",
    ["users.manage"],
    accessSupports,
  ),
  definition(
    "department-structure",
    "Estrutura dos departamentos",
    "Cargos, lideranças e organização dos setores.",
    "access",
    "recordedAt",
    ["users.manage"],
    accessSupports,
  ),
] as const;
export type ReportId = (typeof REPORT_DEFINITIONS)[number]["id"];
export interface ReportFilters {
  id: ReportId;
  scope: "department" | "all";
  department?: string;
  competence?: string;
  dateBasis: ReportDateBasis;
  from?: string;
  to?: string;
  companyId?: string;
  ownerId?: string;
  regime?: string;
  status?: TaskStatus;
  search?: string;
  /** Task-list reports only: one row per task (default), collaborator or company. */
  groupBy?: "task" | "owner" | "company";
}
const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Data inválida.");
export const reportFiltersSchema = z
  .object({
    id: z.enum(
      REPORT_DEFINITIONS.map((item) => item.id) as [ReportId, ...ReportId[]],
    ),
    scope: z.enum(["department", "all"]),
    department: departmentSchema.optional(),
    competence: competenceSchema.optional(),
    dateBasis: z.enum([
      "competence",
      "internalDue",
      "legalDue",
      "completedAt",
      "startedAt",
      "recordedAt",
    ]),
    from: realDate.optional(),
    to: realDate.optional(),
    companyId: z.string().min(1).max(80).optional(),
    ownerId: z.string().min(1).max(100).optional(),
    regime: z.string().trim().min(1).max(120).optional(),
    status: z
      .enum([
        "todo",
        "in_progress",
        "in_review",
        "returned",
        "waiting",
        "done",
        "dispensed",
      ])
      .optional(),
    search: z.string().trim().max(200).optional(),
    groupBy: z.enum(["task", "owner", "company"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const add = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    const item = REPORT_DEFINITIONS.find((def) => def.id === value.id)!;
    if (
      item.supports.dateBases.length &&
      !item.supports.dateBases.includes(value.dateBasis)
    )
      add("dateBasis", "Base de datas não disponível neste relatório.");
    if (value.dateBasis === "competence" && (value.from || value.to))
      add("from", "Use competência ou intervalo de datas, separadamente.");
    if (value.dateBasis !== "competence" && value.competence)
      add("competence", "Competência exige a base de competência.");
    if (value.from && value.to && value.from > value.to)
      add("to", "A data final deve ser igual ou posterior à inicial.");
    if (value.scope === "department" && !value.department)
      add("department", "Selecione um departamento.");
    for (const [filter, supported] of [
      ["companyId", item.supports.company],
      ["ownerId", item.supports.owner],
      ["regime", item.supports.regime],
      ["status", item.supports.status],
    ] as const) {
      if (value[filter] && !supported)
        add(filter, "Filtro não disponível neste relatório.");
    }
    if (value.groupBy && value.groupBy !== "task" && !item.supports.group)
      add("groupBy", "Este relatório não pode ser agrupado.");
    if (
      !item.supports.dateBases.length &&
      (value.from || value.to || value.competence)
    )
      add("from", "Este cadastro não possui recorte de datas.");
  });
export type ReportTone = "danger" | "warning" | "success" | "neutral";
export interface ReportRow {
  id: string;
  cells: Record<string, string | number>;
  tones?: Record<string, ReportTone>;
  taskId?: string;
  companyId?: string;
  /** Set on rows grouped by collaborator, to open that person's tasks. */
  ownerId?: string;
  department?: string;
  competence?: string;
}
export interface ReportResult {
  id: ReportId;
  title: string;
  description: string;
  dateLabel: string;
  columns: { key: string; label: string }[];
  rows: ReportRow[];
  summary: { label: string; value: string | number }[];
  notes: string[];
  generatedAt: string;
  total: number;
}
export function availableReports(actor: Actor) {
  return REPORT_DEFINITIONS.filter(
    (item) =>
      actor.active !== false &&
      item.requiredPermissions.every((permission) =>
        hasPermission(actor, permission),
      ),
  );
}

// The builder revalidates authorization even when invoked with an untrusted snapshot.
export function buildReport(
  snapshot: Snapshot,
  actor: Actor,
  input: ReportFilters,
): ReportResult {
  const parsed = reportFiltersSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      "INVALID_REPORT_FILTERS",
      parsed.error.issues[0]?.message ?? "Filtros inválidos.",
    );
  const filters = parsed.data;
  const def = availableReports(actor).find((item) => item.id === filters.id);
  if (!def)
    throw new DomainError(
      "FORBIDDEN",
      "Seu acesso não permite este relatório.",
      403,
    );
  if (
    filters.scope === "department" &&
    !actor.departments.includes(filters.department!)
  )
    throw new DomainError("FORBIDDEN", "Departamento fora do seu acesso.", 403);
  const departments =
    filters.scope === "department" ? [filters.department!] : actor.departments;
  const inDepartment = (department: string) => departments.includes(department);
  const companyMap = new Map(
    snapshot.companies
      .filter((company) => company.tenantId === actor.tenantId)
      .map((company) => [company.id, company]),
  );
  const users = snapshot.users.filter(
    (user) =>
      user.tenantId === actor.tenantId && user.departments.some(inDepartment),
  );
  const userMap = new Map(users.map((user) => [user.userId, user]));
  const workspace =
    snapshot.workspace.tenantId === actor.tenantId
      ? snapshot.workspace
      : undefined;
  const departmentName = (id: string) =>
    workspace?.departments.find((department) => department.id === id)?.name ??
    id;
  const companyStatus = (company: Company) =>
    company.status
      ? companyStatusLabel(company.status, workspace)
      : company.active
        ? "Ativa"
        : "Inativa";
  const ownerName = (id: string) =>
    id.startsWith("department:")
      ? `Fila · ${departmentName(id.slice(11))}`
      : (userMap.get(id)?.name ??
        (id === actor.userId ? actor.name : "Colaborador fora do recorte"));
  const companyName = (id: string) =>
    companyMap.get(id)?.name ?? "Empresa indisponível";
  const datePart = (value?: string): string | undefined => {
    if (!value) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return undefined;
    return businessDate(value);
  };
  const displayDate = (value?: string) => {
    const day = datePart(value);
    return day
      ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
      : "Não registrado";
  };
  const inRange = (value?: string) => {
    if (!filters.from && !filters.to) return true;
    const day = datePart(value);
    return (
      !!day &&
      (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to)
    );
  };
  const today = datePart(snapshot.now)!;
  const companyMatches = (company: Company) =>
    (!filters.companyId || company.id === filters.companyId) &&
    (!filters.regime || company.regime === filters.regime);
  const visibleTasks = snapshot.tasks.filter(
    (task) => canSeeTask(actor, task) && inDepartment(task.department),
  );
  const baseTasks = visibleTasks.filter((task) => {
    const company = companyMap.get(task.companyId);
    return (
      (!filters.companyId || task.companyId === filters.companyId) &&
      (!filters.ownerId || task.assigneeId === filters.ownerId) &&
      (!filters.status || task.status === filters.status) &&
      (!filters.regime || company?.regime === filters.regime)
    );
  });
  const taskDateMatches = (task: Task) =>
    filters.dateBasis === "competence"
      ? !filters.competence || task.competence === filters.competence
      : filters.dateBasis === "recordedAt"
        ? true
        : inRange(task[filters.dateBasis]);
  const tasks = baseTasks.filter(taskDateMatches);
  const taskMap = new Map(baseTasks.map((task) => [task.id, task]));
  const isOpen = (task: Task) =>
    !task.cancelled && task.status !== "done" && task.status !== "dispensed";
  const status = (task: Task) =>
    task.cancelled ? "Cancelada" : statusLabels[task.status];
  // Only the latest version of each logical document counts, as in the task drawer.
  const latest = (task: Task) => {
    return latestDocuments(task.documents);
  };
  const accepted = (task: Task) =>
    latest(task).filter((document) => document.validation === "accepted");
  const missing = (task: Task) => {
    const types = task.requiredDocumentTypeIds ?? [];
    return types.length
      ? types
          .filter(
            (id) =>
              !accepted(task).some(
                (document) => document.documentTypeId === id,
              ),
          )
          .map(
            (id) =>
              workspace?.documentTypes.find((type) => type.id === id)?.name ??
              id,
          )
      : task.evidenceRequired !== false && !accepted(task).length
        ? [task.documentLabel || "Evidência"]
        : [];
  };
  const taskColumns = [
    ["code", "Código"],
    ["company", "Empresa"],
    ["task", "Atividade"],
    ["department", "Departamento"],
    ["owner", "Responsável"],
    ["competence", "Competência"],
    ["status", "Situação"],
    ["internalDue", "Meta interna"],
    ["legalDue", "Prazo legal"],
    ["situation", "Situação do prazo"],
    ["completedAt", "Conclusão"],
    ["steps", "Etapas"],
    ["documents", "Documentos aceitos"],
  ]
    // Columns fixed by the chosen scope or only useful to some reports are left out to keep the table readable.
    .filter(
      ([key]) =>
        !(key === "department" && filters.scope === "department") &&
        !(
          key === "competence" &&
          filters.dateBasis === "competence" &&
          !!filters.competence
        ) &&
        !(
          key === "completedAt" &&
          !["deliveries", "cancelled", "returned", "reconciliation"].includes(
            filters.id,
          )
        ) &&
        !(
          (key === "steps" || key === "documents") &&
          !["reconciliation", "missing-documents"].includes(filters.id)
        ),
    )
    .map(([key, label]) => ({ key: key!, label: label! }));
  const sortKeys = new Map<string, string>();
  let descending = false;
  const taskRow = (task: Task): ReportRow => {
    const situation = task.cancelled
      ? { label: "Cancelada", tone: "neutral" as const }
      : deadline(task, today);
    sortKeys.set(
      task.id,
      `${task.legalDue}|${companyName(task.companyId)}|${task.title}`,
    );
    return {
      id: task.id,
      taskId: task.id,
      companyId: task.companyId,
      department: task.department,
      competence: task.competence,
      tones: { situation: situation.tone },
      cells: {
        code: companyMap.get(task.companyId)?.code ?? "",
        company: companyName(task.companyId),
        task: task.title,
        department: departmentName(task.department),
        owner: ownerName(task.assigneeId),
        competence: task.competence,
        status: status(task),
        internalDue: displayDate(task.internalDue),
        legalDue: displayDate(task.legalDue),
        situation: situation.label,
        completedAt: displayDate(task.completedAt),
        steps: `${task.steps.filter((step) => step.completed).length}/${task.steps.length}`,
        documents: accepted(task).length,
      },
    };
  };
  let columns = taskColumns;
  let rows: ReportRow[] = [];
  const notes = [
    "Os dados respeitam o grupo, os departamentos e as permissões da sessão. Datas e prazos são interpretados em America/Sao_Paulo.",
  ];
  const setColumns = (entries: [string, string][]) => {
    columns = entries.map(([key, label]) => ({ key, label }));
  };
  const taskReports: Partial<Record<ReportId, (task: Task) => boolean>> = {
    reconciliation: (task) => !task.cancelled,
    deliveries: (task) => !task.cancelled && task.status === "done",
    pending: isOpen,
    deadlines: (task) => !task.cancelled,
    overdue: (task) => isOpen(task) && task.legalDue < today,
    "internal-late": (task) => isOpen(task) && task.internalDue < today,
    review: (task) => isOpen(task) && task.status === "in_review",
    waiting: (task) => isOpen(task) && task.status === "waiting",
    returned: (task) =>
      !task.cancelled && (task.status === "returned" || task.reopenedCount > 0),
    "department-queue": (task) =>
      isOpen(task) && task.assigneeId === `department:${task.department}`,
    "dispense-requests": (task) => isOpen(task) && task.dispenseRequested,
    cancelled: (task) => task.cancelled === true,
    "missing-documents": (task) => isOpen(task) && missing(task).length > 0,
  };
  const taskPredicate = taskReports[filters.id];
  if (filters.id === "matrix") {
    const matrixTasks = tasks.filter((task) => !task.cancelled);
    const groups = obligationGroups(matrixTasks).sort((left, right) =>
      left.title.localeCompare(right.title, "pt-BR"),
    );
    columns = [
      { key: "code", label: "Código" },
      { key: "company", label: "Empresa" },
      ...groups.map((group, index) => ({
        key: `obligation${index}`,
        label: group.title,
      })),
    ];
    const companyIds = [...new Set(matrixTasks.map((task) => task.companyId))];
    rows = companyIds.map((companyId) => {
      sortKeys.set(companyId, companyName(companyId));
      const cells: ReportRow["cells"] = {
        code: companyMap.get(companyId)?.code ?? "",
        company: companyName(companyId),
      };
      const tones: Record<string, ReportTone> = {};
      groups.forEach((group, index) => {
        const matching = obligationCell(matrixTasks, companyId, group);
        cells[`obligation${index}`] = matching.length
          ? matching.map((task) => statusLabels[task.status]).join(" | ")
          : "—";
        if (matching.length)
          tones[`obligation${index}`] = matching.every(
            (task) => task.status === "done",
          )
            ? "success"
            : matching.some(
                  (task) => isOpen(task) && deadline(task, today).legalLate,
                )
              ? "danger"
              : "neutral";
      });
      return { id: companyId, companyId, cells, tones };
    });
    notes.push(
      "Cada coluna reúne as atividades do mesmo modelo; avulsas são agrupadas pelo título. “—” indica que não há atividade no recorte, sem afirmar dispensa legal.",
    );
  } else if (taskPredicate) {
    rows = tasks.filter(taskPredicate).map(taskRow);
    if (filters.id === "reconciliation" || filters.id === "missing-documents") {
      columns = [...columns, { key: "missing", label: "Evidências pendentes" }];
      rows.forEach((row) => {
        row.cells.missing =
          missing(taskMap.get(row.id)!).join("; ") || "Nenhuma";
      });
    }
    if (filters.id === "returned") {
      columns = [...columns, { key: "reopened", label: "Reaberturas" }];
      rows.forEach((row) => {
        row.cells.reopened = taskMap.get(row.id)!.reopenedCount;
      });
    }
    // Same tasks, summarized per collaborator or company instead of one row per task.
    if (filters.groupBy === "owner" || filters.groupBy === "company") {
      const byOwner = filters.groupBy === "owner";
      // % on time per person is individual performance: only with its own grant.
      const showRate =
        !byOwner || hasPermission(actor, "reports.performance.view");
      const selected = tasks.filter(taskPredicate);
      const keyOf = (task: Task) =>
        byOwner ? task.assigneeId : task.companyId;
      setColumns([
        ["group", byOwner ? "Colaborador" : "Empresa"],
        ["total", "Atividades"],
        ["open", "Abertas"],
        ["dueToday", "Vencem hoje"],
        ["internalLate", "Meta vencida"],
        ["legalLate", "Prazo legal vencido"],
        ["done", "Concluídas"],
        ...(showRate
          ? [["onTimePercent", "% concluídas na meta"] as [string, string]]
          : []),
        ["oldest", "Prazo legal mais antigo em aberto"],
      ]);
      rows = [...new Set(selected.map(keyOf))].map((key) => {
        const items = selected.filter((task) => keyOf(task) === key);
        const open = items.filter(isOpen);
        const delivered = items.filter(
          (task) => !task.cancelled && task.status === "done",
        );
        const onTime = delivered.filter(
          (task) =>
            !!task.completedAt &&
            datePart(task.completedAt)! <= task.internalDue,
        ).length;
        const internalLate = open.filter(
          (task) => task.internalDue < today,
        ).length;
        const legalLate = open.filter((task) => task.legalDue < today).length;
        const oldest = open.map((task) => task.legalDue).sort()[0];
        const name = byOwner ? ownerName(key) : companyName(key);
        sortKeys.set(`group:${key}`, `${9999 - legalLate}|${name}`);
        const tones: Record<string, ReportTone> = {};
        if (legalLate) tones.legalLate = "danger";
        if (internalLate) tones.internalLate = "warning";
        return {
          id: `group:${key}`,
          ...(byOwner ? { ownerId: key } : { companyId: key }),
          tones,
          cells: {
            group: name,
            total: items.length,
            open: open.length,
            dueToday: open.filter(
              (task) => task.internalDue === today || task.legalDue === today,
            ).length,
            internalLate,
            legalLate,
            done: delivered.length,
            ...(showRate
              ? {
                  onTimePercent: delivered.length
                    ? `${Math.round((onTime / delivered.length) * 100)}%`
                    : "—",
                }
              : {}),
            oldest: oldest ? displayDate(oldest) : "—",
          },
        };
      });
      notes.push(
        `Agrupado por ${byOwner ? "colaborador (responsável atual)" : "empresa"}; abra uma linha para ver as atividades. Os totais descrevem entregas e prazos, não avaliam pessoas.`,
      );
    }
  } else if (filters.id === "productivity") {
    setColumns([
      ["owner", "Colaborador"],
      ["total", "Atividades"],
      ["done", "Concluídas"],
      ["dispensed", "Dispensadas"],
      ["cancelled", "Canceladas"],
      ["open", "Abertas"],
      ["review", "Em conferência"],
      ["reopened", "Reaberturas"],
      ["onTime", "Entregas na meta"],
      ["onTimePercent", "% na meta"],
    ]);
    const owners = new Set(tasks.map((task) => task.assigneeId));
    for (const owner of owners) {
      const items = tasks.filter((task) => task.assigneeId === owner);
      const delivered = items.filter(
        (task) => !task.cancelled && task.status === "done",
      );
      const onTime = delivered.filter(
        (task) =>
          !!task.completedAt && datePart(task.completedAt)! <= task.internalDue,
      ).length;
      sortKeys.set(owner, ownerName(owner));
      rows.push({
        id: owner,
        cells: {
          owner: ownerName(owner),
          total: items.length,
          done: items.filter(
            (task) => !task.cancelled && task.status === "done",
          ).length,
          dispensed: items.filter(
            (task) => !task.cancelled && task.status === "dispensed",
          ).length,
          cancelled: items.filter((task) => task.cancelled).length,
          open: items.filter(isOpen).length,
          review: items.filter(
            (task) => !task.cancelled && task.status === "in_review",
          ).length,
          reopened: items.reduce((sum, task) => sum + task.reopenedCount, 0),
          onTime,
          onTimePercent: delivered.length
            ? `${Math.round((onTime / delivered.length) * 100)}%`
            : "—",
        },
      });
    }
    notes.push(
      "Totais por responsável atual da atividade; não representam horas trabalhadas, qualidade fiscal ou avaliação automática de pessoas. % na meta = entregas concluídas até a meta interna ÷ entregas concluídas.",
    );
  } else if (filters.id === "changes" || filters.id === "activity") {
    setColumns([
      ["at", "Data"],
      ["action", "Movimentação"],
      ["company", "Empresa"],
      ["task", "Atividade"],
      ["department", "Departamento"],
      ["owner", "Autor"],
      ["detail", "Descrição"],
    ]);
    // Activity filters the author, not the task assignee, so it starts from every visible task.
    const eventTasks =
      filters.id === "changes"
        ? baseTasks
        : visibleTasks.filter(
            (task) =>
              !filters.companyId || task.companyId === filters.companyId,
          );
    const eventTaskMap = new Map(eventTasks.map((task) => [task.id, task]));
    descending = true;
    rows = snapshot.audit
      .filter((event) => {
        if (
          event.tenantId !== actor.tenantId ||
          event.category === "security" ||
          (event.department && !inDepartment(event.department))
        )
          return false;
        const task = event.taskId ? eventTaskMap.get(event.taskId) : undefined;
        if (event.taskId && !task) return false;
        if (
          filters.id === "changes" &&
          (!task || !/dispens|reabert|corre[cç][aã]o/i.test(event.action))
        )
          return false;
        if (
          filters.companyId &&
          (event.companyId ?? task?.companyId) !== filters.companyId
        )
          return false;
        if (
          filters.ownerId &&
          (filters.id === "changes" ? task?.assigneeId : event.actorId) !==
            filters.ownerId
        )
          return false;
        if (
          filters.regime &&
          companyMap.get(event.companyId ?? task?.companyId ?? "")?.regime !==
            filters.regime
        )
          return false;
        if (filters.status && task?.status !== filters.status) return false;
        if (filters.scope === "department" && !event.department && !task)
          return false;
        return filters.dateBasis === "competence"
          ? !!task &&
              (!filters.competence || task.competence === filters.competence)
          : inRange(event.at);
      })
      .map((event) => {
        const task = event.taskId ? eventTaskMap.get(event.taskId) : undefined;
        sortKeys.set(event.id, event.at);
        return {
          id: event.id,
          taskId: task?.id,
          companyId: event.companyId ?? task?.companyId,
          department: event.department ?? task?.department,
          competence: task?.competence,
          cells: {
            at: displayDate(event.at),
            action: event.action,
            company:
              event.companyId || task
                ? companyName(event.companyId ?? task!.companyId)
                : "—",
            task: task?.title ?? "—",
            department: event.department
              ? departmentName(event.department)
              : "Geral",
            owner: event.actorName || ownerName(event.actorId),
            detail: event.detail,
          },
        };
      });
    notes.push(
      "Não inclui eventos de segurança, IP, dispositivo, credenciais ou estados internos anteriores/posteriores. O filtro de responsável representa o autor nas movimentações gerais.",
    );
  } else if (def.category === "companies") {
    // Legacy companies may lack createdAt; a registration event in the visible history is the only trusted fallback.
    const registeredAt = new Map<string, string>();
    for (const event of snapshot.audit)
      if (
        event.tenantId === actor.tenantId &&
        event.companyId &&
        event.action === "Empresa cadastrada" &&
        (!registeredAt.has(event.companyId) ||
          event.at < registeredAt.get(event.companyId)!)
      )
        registeredAt.set(event.companyId, event.at);
    const createdOf = (company: Company) =>
      company.createdAt ?? registeredAt.get(company.id);
    let companies = [...companyMap.values()].filter(companyMatches);
    if (filters.scope === "department")
      companies = companies.filter(
        (company) =>
          !company.responsibilities ||
          departments.some(
            (department) =>
              company.responsibilities?.[department]?.mode !== "none",
          ),
      );
    if (filters.id === "companies-without-tasks") {
      const activity = visibleTasks.filter(
        (task) => !task.cancelled && taskDateMatches(task),
      );
      companies = companies.filter(
        (company) => !activity.some((task) => task.companyId === company.id),
      );
      if (filters.ownerId)
        companies = companies.filter(
          (company) =>
            departments.some(
              (department) =>
                company.responsibilities?.[department]?.userId ===
                filters.ownerId,
            ) || company.ownerId === filters.ownerId,
        );
      notes.push(
        "Considera atividades visíveis no escopo e recorte escolhidos, incluindo encerradas; tarefas canceladas não contam como obrigação ativa. O filtro de responsável seleciona a carteira da empresa, não o responsável das tarefas.",
      );
      if (!hasPermission(actor, "tasks.team.view"))
        notes.push(
          "Sua conta vê somente as próprias tarefas; empresas atendidas por colegas podem aparecer como sem tarefas.",
        );
    } else {
      companies = companies.filter((company) => inRange(createdOf(company)));
      if (filters.id === "new-companies") {
        companies = companies.filter((company) => !!createdOf(company));
        descending = true;
      }
      if (filters.ownerId)
        companies = companies.filter((company) =>
          filters.id === "portfolios"
            ? true
            : departments.some(
                (department) =>
                  company.responsibilities?.[department]?.userId ===
                  filters.ownerId,
              ) || company.ownerId === filters.ownerId,
        );
    }
    setColumns([
      ["code", "Código"],
      ["company", "Empresa"],
      ["regime", "Regime atual"],
      ["status", "Situação"],
      ["city", "Cidade"],
      ["started", "Início do atendimento"],
      ["created", "Cadastro registrado"],
    ]);
    for (const company of companies)
      sortKeys.set(
        company.id,
        filters.id === "new-companies"
          ? `${createdOf(company)}|${company.name}`
          : filters.id === "regimes"
            ? `${company.regime}|${company.name}`
            : company.name,
      );
    const companyRow = (company: Company): ReportRow => ({
      id: company.id,
      companyId: company.id,
      tones: {
        status:
          companyStatusBase(company.status) === "closing" ||
          companyStatusBase(company.status) === "suspended"
            ? "warning"
            : companyStatusBase(company.status) === "inactive" ||
                !company.active
              ? "neutral"
              : "success",
      },
      cells: {
        code: company.code,
        company: company.name,
        regime: company.regime,
        status: companyStatus(company),
        city: company.city,
        started: displayDate(company.startDate),
        created: displayDate(createdOf(company)),
      },
    });
    rows = companies.map(companyRow);
    if (filters.id === "portfolios") {
      columns = [
        ...columns,
        { key: "department", label: "Departamento" },
        { key: "mode", label: "Responsabilidade" },
        { key: "owner", label: "Responsável" },
      ];
      rows = companies.flatMap((company) =>
        departments.flatMap((department) => {
          const responsibility = company.responsibilities?.[department];
          const owner =
            responsibility?.userId ?? (!responsibility ? company.ownerId : "");
          if (filters.ownerId && owner !== filters.ownerId) return [];
          sortKeys.set(
            `${company.id}:${department}`,
            `${company.name}|${departmentName(department)}`,
          );
          return [
            {
              ...companyRow(company),
              id: `${company.id}:${department}`,
              department,
              cells: {
                ...companyRow(company).cells,
                department: departmentName(department),
                mode:
                  responsibility?.mode === "none"
                    ? "Sem obrigações"
                    : responsibility?.mode === "department"
                      ? "Fila do departamento"
                      : "Pessoa",
                owner:
                  responsibility?.mode === "none"
                    ? "—"
                    : responsibility?.mode === "department"
                      ? ownerName(`department:${department}`)
                      : ownerName(owner),
              },
            },
          ];
        }),
      );
    }
    notes.push(
      "Regimes e situações refletem o cadastro atual; o início do atendimento é diferente da data de cadastro. Registros legados sem data de cadastro aparecem como ‘Não registrado’ e ficam fora de intervalos de cadastro explícitos e do relatório de novas empresas.",
    );
  } else if (def.category === "processes") {
    setColumns([
      ["company", "Empresa"],
      ["process", "Processo"],
      ["kind", "Tipo"],
      ["competence", "Competência"],
      ["status", "Situação"],
      ["started", "Início"],
      ["completed", "Conclusão"],
      ["blocked", "Bloqueia rotina"],
      ["stages", "Etapas no escopo"],
    ]);
    const processes = snapshot.companyOnboardings.filter(
      (process) =>
        process.tenantId === actor.tenantId &&
        process.stages.every((stage) =>
          actor.departments.includes(stage.department),
        ) &&
        process.stages.some(
          (stage) =>
            inDepartment(stage.department) &&
            (!filters.ownerId || stage.assigneeId === filters.ownerId),
        ) &&
        (!filters.companyId || process.companyId === filters.companyId) &&
        (!filters.regime ||
          companyMap.get(process.companyId)?.regime === filters.regime) &&
        (filters.dateBasis === "competence"
          ? !filters.competence || process.competence === filters.competence
          : inRange(
              process[
                filters.dateBasis === "completedAt"
                  ? "completedAt"
                  : "startedAt"
              ],
            )) &&
        (filters.id !== "recurring-blocks" ||
          (process.status === "active" && process.blockRecurring)),
    );
    for (const process of processes)
      sortKeys.set(
        process.id,
        `${process.startedAt}|${companyName(process.companyId)}`,
      );
    rows = processes.map((process) => ({
      id: process.id,
      companyId: process.companyId,
      competence: process.competence,
      cells: {
        company: companyName(process.companyId),
        process: process.flowTitle,
        kind: process.kind === "process" ? "Processo" : "Implantação",
        competence: process.competence,
        status: process.status === "completed" ? "Concluído" : "Em andamento",
        started: displayDate(process.startedAt),
        completed: displayDate(process.completedAt),
        blocked:
          process.status === "active" && process.blockRecurring ? "Sim" : "Não",
        stages: `${process.stages.filter((stage) => inDepartment(stage.department) && stage.status === "done").length}/${process.stages.filter((stage) => inDepartment(stage.department)).length}`,
      },
    }));
    if (filters.id === "process-stages") {
      setColumns([
        ["company", "Empresa"],
        ["process", "Processo"],
        ["stage", "Etapa"],
        ["department", "Departamento"],
        ["owner", "Responsável"],
        ["status", "Situação"],
        ["task", "Atividade gerada"],
        ["competence", "Competência"],
      ]);
      rows = processes.flatMap((process) =>
        process.stages
          .filter(
            (stage) =>
              inDepartment(stage.department) &&
              (!filters.ownerId || stage.assigneeId === filters.ownerId),
          )
          .map((stage, order) => {
            sortKeys.set(
              `${process.id}:${stage.id}`,
              `${process.startedAt}|${companyName(process.companyId)}|${String(order).padStart(3, "0")}`,
            );
            return {
              id: `${process.id}:${stage.id}`,
              taskId:
                stage.taskId &&
                visibleTasks.some((task) => task.id === stage.taskId)
                  ? stage.taskId
                  : undefined,
              companyId: process.companyId,
              department: stage.department,
              competence: process.competence,
              cells: {
                company: companyName(process.companyId),
                process: process.flowTitle,
                stage: stage.title,
                department: departmentName(stage.department),
                owner: ownerName(stage.assigneeId),
                status:
                  stage.status === "blocked"
                    ? "Bloqueada"
                    : stage.status === "done"
                      ? "Concluída"
                      : "Liberada",
                task: stage.taskId
                  ? (visibleTasks.find((task) => task.id === stage.taskId)
                      ?.title ?? "Fora do acesso às tarefas")
                  : "Ainda não gerada",
                competence: process.competence,
              },
            };
          }),
      );
    }
    notes.push(
      "Datas das etapas usam o início/conclusão do processo; somente etapas dos departamentos selecionados são listadas.",
    );
  } else if (filters.id === "documents" || filters.id === "comments") {
    if (filters.id === "documents") {
      setColumns([
        ["company", "Empresa"],
        ["task", "Atividade"],
        ["owner", "Responsável"],
        ["department", "Departamento"],
        ["name", "Documento"],
        ["type", "Tipo"],
        ["format", "Formato"],
        ["version", "Versão"],
        ["validation", "Validação"],
        ["date", "Anexado em"],
        ["author", "Autor"],
      ]);
      rows = tasks.flatMap((task) =>
        task.documents
          .filter(
            (document) =>
              filters.dateBasis === "competence" || inRange(document.createdAt),
          )
          .map((document) => {
            sortKeys.set(`${task.id}:${document.id}`, document.createdAt);
            return {
              id: `${task.id}:${document.id}`,
              taskId: task.id,
              companyId: task.companyId,
              department: task.department,
              competence: task.competence,
              cells: {
                company: companyName(task.companyId),
                task: task.title,
                owner: ownerName(task.assigneeId),
                department: departmentName(task.department),
                name: document.name,
                type:
                  workspace?.documentTypes.find(
                    (type) => type.id === document.documentTypeId,
                  )?.name ?? "Não informado",
                format: document.kind,
                version: document.logicalVersion ?? document.version,
                validation:
                  document.validation === "accepted" ? "Aceito" : "Rejeitado",
                date: displayDate(document.createdAt),
                author: ownerName(document.authorId),
              },
            };
          }),
      );
      descending = true;
      notes.push(
        "Inclui todas as versões registradas. Aceito indica validação operacional, sem certificação fiscal do conteúdo.",
      );
    } else {
      setColumns([
        ["company", "Empresa"],
        ["task", "Atividade"],
        ["department", "Departamento"],
        ["owner", "Responsável"],
        ["author", "Autor"],
        ["date", "Comentado em"],
        ["comment", "Comentário"],
      ]);
      rows = tasks.flatMap((task) =>
        (task.comments ?? [])
          .filter(
            (comment) =>
              filters.dateBasis === "competence" || inRange(comment.at),
          )
          .map((comment) => {
            sortKeys.set(`${task.id}:${comment.id}`, comment.at);
            return {
              id: `${task.id}:${comment.id}`,
              taskId: task.id,
              companyId: task.companyId,
              department: task.department,
              competence: task.competence,
              cells: {
                company: companyName(task.companyId),
                task: task.title,
                department: departmentName(task.department),
                owner: ownerName(task.assigneeId),
                author: ownerName(comment.authorId),
                date: displayDate(comment.at),
                comment: comment.text,
              },
            };
          }),
      );
      descending = true;
    }
  } else if (filters.id === "company-changes") {
    setColumns([
      ["company", "Empresa"],
      ["status", "Decisão"],
      ["competence", "Competência de efeito"],
      ["changes", "Campos alterados"],
      ["created", "Proposta em"],
      ["author", "Proposta por"],
      ["decided", "Decidida em"],
      ["decisionBy", "Decidida por"],
      ["reason", "Motivo"],
      ["create", "Criar"],
      ["review", "Revisar"],
      ["transfer", "Transferir"],
    ]);
    rows = snapshot.changeProposals
      .filter((proposal) => {
        const company = companyMap.get(proposal.companyId);
        if (
          proposal.tenantId !== actor.tenantId ||
          !company ||
          !companyMatches(company) ||
          (filters.ownerId && proposal.createdBy !== filters.ownerId)
        )
          return false;
        // "All" still means the actor's authorized departments, not the tenant.
        const patchDepartments = Object.keys(
          proposal.patch.responsibilities ?? {},
        );
        if (
          patchDepartments.length
            ? !patchDepartments.some(inDepartment)
            : !visibleTasks.some((task) => task.companyId === company.id) &&
              !departments.some(
                (department) =>
                  company.responsibilities?.[department]?.mode !== undefined &&
                  company.responsibilities[department]!.mode !== "none",
              )
        )
          return false;
        return filters.dateBasis === "competence"
          ? !filters.competence ||
              proposal.effectiveCompetence === filters.competence
          : inRange(proposal.createdAt);
      })
      .map((proposal) => {
        sortKeys.set(proposal.id, proposal.createdAt);
        return {
          id: proposal.id,
          companyId: proposal.companyId,
          competence: proposal.effectiveCompetence,
          cells: {
            company: companyName(proposal.companyId),
            status:
              proposal.status === "pending"
                ? "Pendente"
                : proposal.status === "approved"
                  ? "Aprovada"
                  : "Rejeitada",
            competence: proposal.effectiveCompetence,
            changes: [
              proposal.patch.regime ? "Regime" : "",
              proposal.patch.status ? "Situação" : "",
              proposal.patch.responsibilities ? "Responsáveis" : "",
              proposal.patch.serviceEndCompetence ? "Encerramento" : "",
            ]
              .filter(Boolean)
              .join("; "),
            created: displayDate(proposal.createdAt),
            author: ownerName(proposal.createdBy),
            decided: displayDate(proposal.decidedAt),
            decisionBy: proposal.decidedBy
              ? ownerName(proposal.decidedBy)
              : "—",
            reason: proposal.reason,
            create: proposal.impact.create,
            review: proposal.impact.review,
            transfer: proposal.impact.transfer,
          },
        };
      });
    descending = true;
    notes.push(
      "O filtro de responsável representa o autor da proposta. Impactos são os registrados na proposta, sem executar ou aprovar alterações por este relatório.",
    );
  } else if (filters.id === "user-access") {
    setColumns([
      ["name", "Usuário"],
      ["role", "Cargo de identificação"],
      ["departments", "Departamentos no escopo"],
      ["permissions", "Permissões concedidas"],
    ]);
    rows = users
      .filter((user) => !filters.ownerId || user.userId === filters.ownerId)
      .map((user) => {
        sortKeys.set(user.userId, user.name);
        return {
          id: user.userId,
          cells: {
            name: user.name,
            role: roleLabels[user.role],
            departments: user.departments
              .filter(inDepartment)
              .map(departmentName)
              .join("; "),
            permissions: user.permissions
              ? user.permissions
                  .map(
                    (permission) => PERMISSION_LABELS[permission] ?? permission,
                  )
                  .join("; ")
              : "Concessões legadas não detalhadas",
          },
        };
      });
    notes.push(
      "Não inclui e-mail, nome de login, senhas, sessão, códigos ou status de autenticação. Cargo não concede nem limita permissões; o relatório mostra os grants presentes no cadastro operacional.",
    );
  } else if (filters.id === "department-structure") {
    setColumns([
      ["department", "Departamento"],
      ["active", "Setor ativo"],
      ["position", "Cargo no setor"],
      ["name", "Colaborador"],
      ["leader", "Liderança"],
    ]);
    rows = (workspace?.departments ?? [])
      .filter((department) => inDepartment(department.id))
      .flatMap((department) => {
        const members = (department.members ?? []).filter(
          (member) =>
            userMap.has(member.userId) &&
            (!filters.ownerId || member.userId === filters.ownerId),
        );
        if (!members.length && !filters.ownerId)
          return [
            {
              id: department.id,
              department: department.id,
              cells: {
                department: department.name,
                active: department.active ? "Sim" : "Não",
                position: "—",
                name: "Sem membros neste recorte",
                leader: "—",
              },
            },
          ];
        return members.map((member) => ({
          id: `${department.id}:${member.userId}`,
          department: department.id,
          cells: {
            department: department.name,
            active: department.active ? "Sim" : "Não",
            position:
              department.positions?.find(
                (position) => position.id === member.positionId,
              )?.name ?? "Não informado",
            name: ownerName(member.userId),
            leader: member.reportsTo
              ? ownerName(member.reportsTo)
              : "Sem liderança vinculada",
          },
        }));
      });
    notes.push(
      "Cargos e lideranças organizam os setores e não concedem acesso automaticamente.",
    );
  }
  if (filters.search) {
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR");
    const search = normalize(filters.search);
    rows = rows.filter((row) =>
      Object.values(row.cells).some((value) =>
        normalize(String(value)).includes(search),
      ),
    );
  }
  const direction = descending ? -1 : 1;
  rows.sort(
    (left, right) =>
      direction *
        (sortKeys.get(left.id) ?? "").localeCompare(
          sortKeys.get(right.id) ?? "",
          "pt-BR",
        ) || left.id.localeCompare(right.id, "pt-BR"),
  );
  const dates: Record<ReportDateBasis, string> = {
    competence: "Competência",
    internalDue: "Meta interna",
    legalDue: "Prazo legal",
    completedAt: "Conclusão",
    startedAt: "Início",
    recordedAt: "Data de registro",
  };
  const dateLabel = !def.supports.dateBases.length
    ? "Cadastro atual, sem recorte de datas"
    : filters.dateBasis === "competence"
      ? `${dates.competence}: ${filters.competence ?? "todas"}`
      : `${dates[filters.dateBasis]}: ${filters.from ? displayDate(filters.from) : "início do histórico"} até ${filters.to ? displayDate(filters.to) : "fim do histórico"}`;
  if (filters.dateBasis !== "competence" && (filters.from || filters.to))
    notes.push(
      "Os limites inicial e final são inclusivos. Registros sem a data escolhida não entram no intervalo.",
    );
  if (filters.scope === "all")
    notes.push(
      "‘Todos’ significa somente os departamentos autorizados para esta conta.",
    );
  if (filters.regime)
    notes.push(
      "O filtro de regime usa o cadastro atual da empresa; não recompõe o regime histórico de cada competência.",
    );
  // Up to three extra counters per report, derived from the same filtered rows.
  const breakdown = (): ReportResult["summary"] => {
    const taskRows = rows
      .map((row) => (row.taskId ? taskMap.get(row.taskId) : undefined))
      .filter((task): task is Task => !!task);
    if (taskPredicate && taskRows.length === rows.length)
      return [
        { label: "Abertas", value: taskRows.filter(isOpen).length },
        {
          label: "Concluídas",
          value: taskRows.filter(
            (task) => !task.cancelled && task.status === "done",
          ).length,
        },
        {
          label: "Prazo legal vencido",
          value: taskRows.filter(
            (task) => isOpen(task) && task.legalDue < today,
          ).length,
        },
      ];
    const key =
      filters.id === "regimes"
        ? "regime"
        : def.category === "companies" && filters.id !== "portfolios"
          ? "status"
          : undefined;
    if (!key) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = String(row.cells[key] ?? "");
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([label, value]) => ({ label, value }));
  };
  return {
    id: def.id,
    title: def.title,
    description: def.caption,
    dateLabel,
    columns,
    rows,
    summary:
      taskPredicate &&
      (filters.groupBy === "owner" || filters.groupBy === "company")
        ? [
            {
              label:
                filters.groupBy === "owner"
                  ? "Colaboradores no resultado"
                  : "Empresas no resultado",
              value: rows.length,
            },
            {
              label: "Atividades",
              value: rows.reduce(
                (sum, row) => sum + Number(row.cells.total),
                0,
              ),
            },
            {
              label: "Prazo legal vencido",
              value: rows.reduce(
                (sum, row) => sum + Number(row.cells.legalLate),
                0,
              ),
            },
          ]
        : [
            { label: "Registros no resultado", value: rows.length },
            {
              label: "Empresas no resultado",
              value: new Set(rows.map((row) => row.companyId).filter(Boolean))
                .size,
            },
            ...breakdown(),
          ],
    notes,
    generatedAt: snapshot.now,
    total: rows.length,
  };
}

export function reportCsv(result: ReportResult): string {
  return (
    "\uFEFF" +
    [
      result.columns.map((column) => csvCell(column.label)).join(";"),
      ...result.rows.map((row) =>
        result.columns
          .map((column) => csvCell(row.cells[column.key] ?? ""))
          .join(";"),
      ),
    ].join("\r\n")
  );
}
