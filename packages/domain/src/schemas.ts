import { z } from "zod";
import { PERMISSIONS } from "./access.js";

export const departmentSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (v) => [...v].every((character) => (character.codePointAt(0) ?? 0) >= 32),
    "Departamento inválido.",
  );
export const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((v) => v >= "0001-01" && v <= "9999-11");

import { normalizeCnpj, validCnpj } from "./identifiers.js";

const version = z.number().int().positive();

const reason = z

  .string()

  .trim()

  .min(8, "Descreva o motivo com pelo menos 8 caracteres.")

  .max(500);

const simple = ["start", "submit", "complete", "approve", "resume"] as const;

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(simple), expectedRevision: version }).strict(),

  z

    .object({
      type: z.literal("step"),

      expectedRevision: version,

      stepId: z.string().max(80),

      completed: z.boolean(),
    })

    .strict(),

  z

    .object({
      type: z.enum([
        "return",

        "wait",

        "request_dispense",

        "dispense",

        "reopen",
        "cancel",
        "retain_applicability",
      ]),

      expectedRevision: version,

      reason,
    })

    .strict(),

  z

    .object({
      type: z.literal("assign"),

      expectedRevision: version,

      assigneeId: z.string().max(80),
    })

    .strict(),
]);

export const templateWorkflowSchema = z

  .array(
    z

      .object({
        id: z

          .string()

          .min(1)

          .max(80)

          .regex(/^[A-Za-z0-9_-]+$/),

        title: z.string().trim().min(2).max(120),
      })

      .strict(),
  )

  .min(1, "Inclua pelo menos uma etapa no fluxo.")

  .max(30, "O fluxo pode ter até 30 etapas.")

  .refine(
    (steps) => new Set(steps.map((step) => step.id)).size === steps.length,

    {
      message: "As etapas devem ter identificadores únicos.",
    },
  );

export const departmentFlowStageSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),

    title: z.string().trim().min(2).max(120),

    department: departmentSchema,

    workflowSteps: templateWorkflowSchema,

    internalDays: z.number().int().min(0).max(3650),

    legalDays: z.number().int().min(0).max(3650),

    requiresReview: z.boolean(),

    requiredDocument: z.string().trim().max(100),
  })
  .strict()
  .refine((stage) => stage.internalDays <= stage.legalDays, {
    message: "A meta deve ser anterior ou igual ao prazo da etapa.",
    path: ["internalDays"],
  });

const departmentFlowBodySchema = z
  .object({
    kind: z.enum(["onboarding", "process"]).optional(),

    title: z.string().trim().min(3).max(100),

    description: z.string().trim().max(500).optional(),

    stages: z
      .array(departmentFlowStageSchema)
      .min(1)
      .max(30)
      .refine(
        (stages) =>
          new Set(stages.map((stage) => stage.id)).size === stages.length,

        { message: "As etapas devem ter identificadores únicos." },
      ),
  })
  .strict();

export const createDepartmentFlowSchema = departmentFlowBodySchema;

export const updateDepartmentFlowSchema = departmentFlowBodySchema.extend({
  expectedVersion: version,
  active: z.boolean(),
});

export const departmentFlowSchema = departmentFlowBodySchema.extend({
  id: z.string().min(1).max(80),
  tenantId: z.string().min(1).max(80),

  version,
  active: z.boolean(),
});

const onboardingBodySchema = z
  .object({
    flowId: z.string().min(1).max(80),
    expectedFlowVersion: version,

    competence: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .refine((value) => value >= "0001-01" && value <= "9999-12"),

    blockRecurring: z.boolean(),

    assignments: z
      .record(
        z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z0-9_-]+$/),
        z.string().min(1).max(80),
      )

      .refine(
        (value) =>
          Object.keys(value).length >= 1 && Object.keys(value).length <= 30,
      ),
  })
  .strict();

export const startCompanyOnboardingSchema = onboardingBodySchema.extend({
  companyId: z.string().min(1).max(80),
});
export const updateCompanyOnboardingSchema = z
  .object({
    expectedRevision: version,
    assignments: onboardingBodySchema.shape.assignments,
  })
  .strict();
export const companyOnboardingSchema = z
  .object({
    kind: z.enum(["onboarding", "process"]).optional(),
    id: z.string().min(1).max(80),
    tenantId: z.string().min(1).max(80),
    companyId: z.string().min(1).max(80),
    flowId: z.string().min(1).max(80),
    flowVersion: version,
    flowTitle: z.string().min(3).max(100),
    competence: onboardingBodySchema.shape.competence,
    blockRecurring: z.boolean(),
    status: z.enum(["active", "completed"]),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }).optional(),
    revision: version,
    stages: z
      .array(
        departmentFlowStageSchema.safeExtend({
          assigneeId: z.string().min(1).max(80),
          taskId: z.string().min(1).max(80).optional(),
          status: z.enum(["blocked", "active", "done"]),
        }),
      )
      .min(1)
      .max(30)
      .refine(
        (stages) =>
          new Set(stages.map((stage) => stage.id)).size === stages.length,
      ),
  })
  .strict();

export const companyResponsibilitySchema = z
  .object({
    mode: z.enum(["person", "department", "none"]),
    userId: z.string().min(1).max(80).optional(),
  })
  .strict()
  .refine(
    (v) => (v.mode === "person" ? !!v.userId : !v.userId),
    "Selecione uma pessoa somente para responsabilidade individual.",
  );
export const responsibilitiesSchema = z
  .record(departmentSchema, companyResponsibilitySchema)
  .refine((v) => Object.keys(v).length <= 30);
const companyCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "Código deve conter apenas letras, números, ponto, traço ou sublinhado.",
  );
const tagsSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(30)
  .refine((v) => new Set(v).size === v.length);
// Company situation (17/10/2026): built-ins plus situations created by the group.
// A created one is "<base>:<slug>"; the base fixes whether tasks are generated.
export const companyStatusSchema = z
  .string()
  .regex(
    /^(active|closing|inactive|suspended)(:[a-z0-9-]{2,40})?$/,
    "Situação inválida.",
  );
export const companyStatusDefinitionSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^(active|inactive|suspended):[a-z0-9-]{2,40}$/,
        "Identificador de situação inválido.",
      ),
    label: z.string().trim().min(2).max(40),
  })
  .strict();
export const companySchema = z

  .object({
    code: companyCodeSchema.optional(),
    status: companyStatusSchema.optional(),
    serviceEndCompetence: competenceSchema.optional(),
    responsibilities: responsibilitiesSchema.optional(),
    tags: tagsSchema.optional(),
    name: z.string().trim().min(3).max(100),

    cnpj: z

      .string()

      .max(18)

      .transform(normalizeCnpj)

      .refine(
        validCnpj,

        "Informe um CNPJ numérico ou alfanumérico com dígitos verificadores válidos.",
      ),

    regime: z.enum(["Simples Nacional", "Lucro Presumido", "Lucro Real"]),

    city: z.string().trim().min(2).max(80),

    ownerId: z.string().min(1).max(80),

    onboarding: onboardingBodySchema.optional(),
  })

  .strict();

const templateBodySchema = z

  .object({
    title: z.string().trim().min(2).max(40),

    description: z.string().trim().min(3).max(140),

    department: departmentSchema,

    regime: z.enum([
      "Todos",

      "Simples Nacional",

      "Lucro Presumido",

      "Lucro Real",
    ]),

    internalDay: z.number().int().min(1).max(28),

    legalDay: z.number().int().min(1).max(28),

    requiresReview: z.boolean(),

    requiredDocument: z.string().trim().min(3).max(100),

    workflowSteps: templateWorkflowSchema.optional(),
  })

  .strict();

export const templateSchema = templateBodySchema.refine(
  (x) => x.internalDay <= x.legalDay,

  {
    message: "A meta interna deve ser anterior ou igual ao prazo legal.",

    path: ["internalDay"],
  },
);

export const updateTemplateSchema = templateBodySchema

  .extend({ workflowSteps: templateWorkflowSchema, expectedVersion: version })

  .refine((x) => x.internalDay <= x.legalDay, {
    message: "A meta interna deve ser anterior ou igual ao prazo legal.",

    path: ["internalDay"],
  });

// Customize, keep (acknowledge a newer template) or drop a company's steps for one template.
export const companyWorkflowSchema = z
  .object({
    companyId: z.string().min(1).max(80),
    templateId: z.string().min(1).max(80),
    action: z.enum(["save", "acknowledge", "reset"]),
    workflowSteps: templateWorkflowSchema.optional(),
    expectedRevision: z.number().int().min(1),
    // Template version the manager reviewed; required to save or keep steps.
    expectedTemplateVersion: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((value) => value.action !== "save" || !!value.workflowSteps, {
    message: "Informe as etapas personalizadas.",
    path: ["workflowSteps"],
  })
  .refine(
    (value) => value.action === "reset" || !!value.expectedTemplateVersion,
    {
      message: "Informe a versão do modelo revisada.",
      path: ["expectedTemplateVersion"],
    },
  );
export type CompanyWorkflowInput = z.infer<typeof companyWorkflowSchema>;

export const generationSchema = z

  .object({
    competence: z

      .string()

      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)

      .refine(
        (value) => value >= "0001-01" && value <= "9999-11",

        "Competência fora do intervalo de datas suportado.",
      ),

    department: departmentSchema,
  })

  .strict();

export const sessionSchema = z

  .object({
    userId: z.enum(["julia", "marina", "rafael", "helena", "consulta"]),
  })

  .strict();

export const taskSchema = z

  .object({
    title: z.string().trim().min(3).max(60),

    description: z.string().trim().min(3).max(140),

    companyId: z.string().min(1).max(80),

    department: departmentSchema,

    internalDue: z.iso.date(),

    legalDue: z.iso.date(),

    assigneeId: z.string().min(1).max(80),

    requiresReview: z.boolean(),
  })

  .strict()

  .refine((x) => x.internalDue <= x.legalDue, {
    message: "A meta interna deve ser anterior ou igual ao prazo legal.",

    path: ["internalDue"],
  });

export const importSchema = z

  .object({ companies: z.array(companySchema).min(1).max(200) })

  .strict();

export const updateCompanySchema = z
  .object({
    expectedRevision: version,
    code: companyCodeSchema.optional(),
    name: z.string().trim().min(3).max(100).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    tags: tagsSchema.optional(),
    reason: reason.optional(),
  })
  .strict();
export const operationalPatchSchema = z
  .object({
    regime: companySchema.shape.regime.optional(),
    responsibilities: responsibilitiesSchema.optional(),
    status: companyStatusSchema.optional(),
    serviceEndCompetence: competenceSchema.optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    "Informe pelo menos uma alteração.",
  );
export const proposeCompanyChangeSchema = z
  .object({
    companyId: z.string().min(1).max(80),
    expectedRevision: version,
    patch: operationalPatchSchema,
    effectiveCompetence: competenceSchema,
    reason,
    transferOpenTasks: z.boolean().optional(),
  })
  .strict();
export const decideChangeProposalSchema = z
  .object({
    expectedRevision: version,
    decision: z.enum(["approve", "reject"]),
  })
  .strict();
export const taskCommentSchema = z
  .object({
    expectedRevision: version,
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export const transferCompaniesSchema = z
  .object({
    companyIds: z
      .array(z.string().min(1).max(80))
      .min(1)
      .max(200)
      .refine((v) => new Set(v).size === v.length),
    department: departmentSchema,
    target: companyResponsibilitySchema,
    transferOpenTasks: z.boolean(),
    expectedRevisions: z.record(z.string().min(1).max(80), version),
  })
  .strict();
const entryId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
const uniqueEntries = <T extends { id: string }>(values: T[]) =>
  new Set(values.map((v) => v.id)).size === values.length;
export const departmentDefinitionSchema = z
  .object({
    id: departmentSchema,
    name: z.string().trim().min(1).max(80),
    active: z.boolean(),
    positions: z
      .array(
        z
          .object({ id: entryId, name: z.string().trim().min(2).max(80) })
          .strict(),
      )
      .max(40)
      .refine(uniqueEntries, "Cargos repetidos no departamento.")
      .optional(),
    members: z
      .array(
        z
          .object({
            userId: z.string().min(1).max(80),
            positionId: entryId,
            reportsTo: z.string().min(1).max(80).optional(),
          })
          .strict(),
      )
      .max(250)
      .refine(
        (values) =>
          new Set(values.map((value) => value.userId)).size === values.length,
        "Uma pessoa deve aparecer uma única vez em cada departamento.",
      )
      .optional(),
  })
  .strict();
export const accessProfileSchema = z
  .object({
    id: entryId,
    name: z.string().trim().min(2).max(80),
    role: z.enum([
      "admin",
      "supervisor",
      "coordinator",
      "manager",
      "director",
      "operator",
      "viewer",
    ]),
    departments: z
      .array(departmentSchema)
      .min(1)
      .max(30)
      .refine((v) => new Set(v).size === v.length),
    permissions: z
      .array(z.enum(PERMISSIONS))
      .max(PERMISSIONS.length)
      .refine((v) => new Set(v).size === v.length),
    homeView: z
      .enum(["personal", "team", "management", "executive"])
      .optional(),
  })
  .strict();
export const documentTypeSchema = z
  .object({
    id: entryId,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
    formats: z
      .array(z.enum(["PDF", "XML"]))
      .min(1)
      .max(2)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
const xmlField = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/);
export const documentRuleSchema = z
  .object({
    id: entryId,
    name: z.string().trim().min(2).max(100),
    templateIds: z.array(z.string().min(1).max(80)).max(200),
    documentTypeIds: z.array(entryId).min(1).max(30),
    required: z.boolean(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30),
    fields: z
      .array(z.enum(["cnpj", "competence", "obligation"]))
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    active: z.boolean(),
    cnpjField: xmlField.optional(),
    competenceField: xmlField.optional(),
    obligationField: xmlField.optional(),
  })
  .strict();
const workspaceBody = z
  .object({
    departments: z
      .array(departmentDefinitionSchema)
      .min(1)
      .max(30)
      .refine(uniqueEntries),
    accessProfiles: z.array(accessProfileSchema).max(50).refine(uniqueEntries),
    documentTypes: z.array(documentTypeSchema).max(100).refine(uniqueEntries),
    documentRules: z.array(documentRuleSchema).max(200).refine(uniqueEntries),
    companyStatuses: z
      .array(companyStatusDefinitionSchema)
      .max(30)
      .refine(uniqueEntries)
      .optional(),
  })
  .strict();
export const updateWorkspaceSettingsSchema = workspaceBody.partial().extend({
  expectedRevision: version,
});
export const workspaceSettingsSchema = workspaceBody.extend({
  id: z.literal("settings"),
  tenantId: z.string().min(1).max(80),
  revision: version,
});
export const companyChangeProposalSchema = proposeCompanyChangeSchema
  .omit({ expectedRevision: true })
  .extend({
    id: z.string().min(1).max(80),
    tenantId: z.string().min(1).max(80),
    expectedCompanyRevision: version,
    revision: version,
    status: z.enum(["pending", "approved", "rejected"]),
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.string().min(1).max(80),
    decidedAt: z.iso.datetime({ offset: true }).optional(),
    decidedBy: z.string().min(1).max(80).optional(),
    impact: z
      .object({
        create: z.number().int().nonnegative(),
        retain: z.number().int().nonnegative(),
        review: z.number().int().nonnegative(),
        transfer: z.number().int().nonnegative(),
        taskIds: z.array(z.string().min(1).max(80)),
      })
      .strict(),
  });
