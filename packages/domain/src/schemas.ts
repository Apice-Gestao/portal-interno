import { z } from "zod";
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
export const companySchema = z
  .object({
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
  })
  .strict();
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
const templateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(40),
    description: z.string().trim().min(3).max(140),
    department: z.enum(["Fiscal", "Contábil", "Pessoal"]),
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
export const generationSchema = z
  .object({
    competence: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .refine(
        (value) => value >= "0001-01" && value <= "9999-11",
        "Competência fora do intervalo de datas suportado.",
      ),
    department: z.enum(["Fiscal", "Contábil", "Pessoal"]),
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
    department: z.enum(["Fiscal", "Contábil", "Pessoal"]),
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
