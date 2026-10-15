import { z } from "zod";
import { generationSchema } from "./schemas.js";
import { deadline, metric } from "./selectors.js";
import type { Department, PortalState, Task } from "./types.js";

export const TV_BLOCKS = [
  "progress",
  "deadlines",
  "upcoming",
  "obligations",
  "deliveries",
  "collaborators",
] as const;
export type TvBlock = (typeof TV_BLOCKS)[number];
export const TV_DEFAULT_BLOCKS = [
  "progress",
  "deadlines",
  "upcoming",
  "collaborators",
  "deliveries",
] as const satisfies readonly TvBlock[];

export interface TvDevice {
  id: string;
  tenantId: string;
  name: string;
  departments: Department[];
  competence: string;
  active: boolean;
  showNames: boolean;
  blocks: TvBlock[];
  rotationSeconds: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTvDevice {
  name: string;
  departments: Department[];
  competence: string;
}

export interface UpdateTvDevice {
  expectedVersion: number;
  active?: boolean;
  name?: string;
  departments?: Department[];
  competence?: string;
  showNames?: boolean;
  blocks?: TvBlock[];
  rotationSeconds?: number;
}

const deviceName = z.string().trim().min(2).max(60);
const departments = z
  .array(z.enum(["Fiscal", "Contábil", "Pessoal"]))
  .min(1)
  .max(3)
  .refine((values) => new Set(values).size === values.length, {
    message: "Selecione departamentos diferentes.",
  });
const blocks = z
  .array(z.enum(TV_BLOCKS))
  .min(1)
  .max(TV_BLOCKS.length)
  .refine((values) => new Set(values).size === values.length, {
    message: "Selecione blocos diferentes.",
  });

export const createTvDeviceSchema = z
  .object({
    name: deviceName,
    departments,
    competence: generationSchema.shape.competence,
  })
  .strict();

export const updateTvDeviceSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    active: z.boolean().optional(),
    name: deviceName.optional(),
    departments: departments.optional(),
    competence: generationSchema.shape.competence.optional(),
    showNames: z.boolean().optional(),
    blocks: blocks.optional(),
    rotationSeconds: z.number().int().min(5).max(60).optional(),
  })
  .strict();

export const tvDeviceSchema = createTvDeviceSchema
  .extend({
    id: z.string().min(1).max(80),
    tenantId: z.string().min(1).max(80),
    active: z.boolean(),
    showNames: z.boolean(),
    blocks,
    rotationSeconds: z.number().int().min(5).max(60),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const pairTvSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{8,10}$/, "Informe o código de pareamento válido."),
  })
  .strict();

export interface TvFeed {
  device: Pick<
    TvDevice,
    | "name"
    | "departments"
    | "competence"
    | "blocks"
    | "rotationSeconds"
    | "showNames"
  >;
  generatedAt: string;
  total: number;
  companies: number;
  progress: { closed: number; total: number; percent: number };
  deadlines: {
    legalLate: number;
    internalLate: number;
    dueToday: number;
    onTime: number;
    done: number;
  };
  obligations: {
    title: string;
    total: number;
    completed: number;
    percent: number;
  }[];
  collaborators: {
    name: string;
    initials: string;
    departments: Department[];
    total: number;
    pending: number;
    inProgress: number;
    inReview: number;
    closed: number;
    percent: number;
  }[];
  deliveries: {
    obligation: string;
    companyLabel: string;
    completedAt: string;
    department: Department;
    responsibleLabel: string;
  }[];
  upcoming: {
    obligation: string;
    companyLabel: string;
    legalDue: string;
    internalDue: string;
    department: Department;
    responsibleLabel: string;
    urgency: "legal" | "internal" | "today" | "on-time";
  }[];
}

type Urgency = TvFeed["upcoming"][number]["urgency"];

function urgency(task: Task, today: string): Urgency {
  // An open task is evaluated today, including a reopened legacy record that
  // retained its previous completion timestamp.
  const due = deadline({ ...task, completedAt: undefined }, today);
  if (due.legalLate) return "legal";
  if (task.legalDue === today || task.internalDue === today) return "today";
  if (due.internalLate) return "internal";
  return "on-time";
}

function closed(task: Task): boolean {
  return task.status === "done" || task.status === "dispensed";
}

/** The server supplies device scope and its operational local clock. Lists are
 * capped for display; totals always cover the complete scoped task set. */
export function createTvFeed(
  state: PortalState,
  device: TvDevice,
  now: string,
): TvFeed {
  const today = now.slice(0, 10);
  const tasks = state.tasks.filter(
    (task) =>
      task.tenantId === device.tenantId &&
      device.departments.includes(task.department) &&
      task.competence === device.competence,
  );
  const companies = new Map(
    state.companies
      .filter((company) => company.tenantId === device.tenantId)
      .map((company) => [company.id, company]),
  );
  const users = state.users.filter(
    (user) =>
      user.tenantId === device.tenantId &&
      user.active !== false &&
      user.departments.some((department) =>
        device.departments.includes(department),
      ),
  );
  const usersById = new Map(users.map((user) => [user.userId, user]));
  const responsibleLabel = (task: Task) =>
    device.blocks.includes("collaborators")
      ? (usersById.get(task.assigneeId)?.name ?? "Responsável indisponível")
      : "Equipe";
  const assigned = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = assigned.get(task.assigneeId) ?? [];
    list.push(task);
    assigned.set(task.assigneeId, list);
  }
  const collaborators = users
    .map((user) => {
      const own = assigned.get(user.userId) ?? [];
      const total = own.length;
      const completed = own.filter(closed).length;
      return {
        name: user.name,
        initials: user.initials,
        departments: user.departments.filter((department) =>
          device.departments.includes(department),
        ),
        total,
        pending: total - completed,
        inProgress: own.filter((task) => task.status === "in_progress").length,
        inReview: own.filter((task) => task.status === "in_review").length,
        closed: completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
      };
    })
    .sort(
      (a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "pt-BR"),
    );
  const companyLabel = (task: Task) => {
    const company = companies.get(task.companyId);
    if (!company) return "Empresa não informada";
    return device.showNames ? company.name : `Empresa ${company.code}`;
  };
  // Ad-hoc titles can contain client names and private request details.
  const obligationLabel = (task: Task) =>
    task.templateId === "avulsa" && !device.showNames
      ? "Tarefa avulsa"
      : task.title;
  const summary = metric(tasks, today);
  const deadlines: TvFeed["deadlines"] = {
    legalLate: 0,
    internalLate: 0,
    dueToday: 0,
    onTime: 0,
    done: 0,
  };
  const byObligation = new Map<string, TvFeed["obligations"][number]>();
  for (const task of tasks) {
    if (closed(task)) deadlines.done++;
    else {
      const situation = urgency(task, today);
      const key = {
        legal: "legalLate",
        internal: "internalLate",
        today: "dueToday",
        "on-time": "onTime",
      } as const;
      deadlines[key[situation]]++;
    }
    const title = obligationLabel(task);
    const obligation = byObligation.get(title) ?? {
      title,
      total: 0,
      completed: 0,
      percent: 0,
    };
    obligation.total++;
    if (closed(task)) obligation.completed++;
    byObligation.set(title, obligation);
  }
  const obligations = [...byObligation.values()]
    .map((group) => ({
      ...group,
      percent: Math.round((group.completed / group.total) * 100),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  const deliveries = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        task.completedAt !== undefined &&
        Number.isFinite(Date.parse(task.completedAt)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.completedAt!) - Date.parse(a.completedAt!) ||
        a.title.localeCompare(b.title, "pt-BR"),
    )
    .slice(0, 30)
    .map((task) => ({
      obligation: obligationLabel(task),
      companyLabel: companyLabel(task),
      completedAt: task.completedAt!,
      department: task.department,
      responsibleLabel: responsibleLabel(task),
    }));

  const urgencyOrder: Record<Urgency, number> = {
    legal: 0,
    today: 1,
    internal: 2,
    "on-time": 3,
  };
  const upcoming = tasks
    .filter((task) => !closed(task))
    .sort(
      (a, b) =>
        urgencyOrder[urgency(a, today)] - urgencyOrder[urgency(b, today)] ||
        a.legalDue.localeCompare(b.legalDue) ||
        a.internalDue.localeCompare(b.internalDue) ||
        a.title.localeCompare(b.title, "pt-BR"),
    )
    .slice(0, 60)
    .map((task) => ({
      obligation: obligationLabel(task),
      companyLabel: companyLabel(task),
      legalDue: task.legalDue,
      internalDue: task.internalDue,
      department: task.department,
      responsibleLabel: responsibleLabel(task),
      urgency: urgency(task, today),
    }));

  return {
    device: {
      name: device.name,
      departments: [...device.departments],
      competence: device.competence,
      blocks: [...device.blocks],
      rotationSeconds: device.rotationSeconds,
      showNames: device.showNames,
    },
    generatedAt: now,
    total: tasks.length,
    companies: new Set(tasks.map((task) => task.companyId)).size,
    progress: {
      closed: summary.done + summary.dispensed,
      total: summary.total,
      percent: summary.progress,
    },
    deadlines,
    collaborators: device.blocks.includes("collaborators") ? collaborators : [],
    obligations: device.blocks.includes("obligations") ? obligations : [],
    deliveries: device.blocks.includes("deliveries") ? deliveries : [],
    upcoming: device.blocks.includes("upcoming") ? upcoming : [],
  };
}
