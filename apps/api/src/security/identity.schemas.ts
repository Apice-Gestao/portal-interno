import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { PERMISSIONS } from "@apice/domain";
import type { Permission, Role } from "@apice/domain";

const username = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._@-]*$/)
  .transform((value) => value.toLowerCase());
const name = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const point = character.codePointAt(0)!;
        return (
          point >= 32 &&
          !(point >= 127 && point <= 159) &&
          !(point >= 0xd800 && point <= 0xdfff)
        );
      }),
    "Nome inválido.",
  );
const password = z
  .string()
  .min(12, "A senha deve ter pelo menos 12 caracteres.")
  .max(128);
const email = z
  .string()
  .trim()
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());
const departments = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{N}_ -]+$/u),
  )
  .min(1, "Selecione ao menos um departamento.")
  .max(30)
  .refine(
    (values) => new Set(values).size === values.length,
    "Departamentos repetidos.",
  );
const permissions = z
  .array(z.enum(PERMISSIONS))
  .max(PERMISSIONS.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Permissões repetidas.",
  );
const role = z.enum([
  "admin",
  "supervisor",
  "coordinator",
  "manager",
  "director",
  "operator",
  "viewer",
]);
const homeView = z.enum(["personal", "team", "management", "executive"]);
export const loginSchema = z
  .object({
    username,
    password: z.string().min(1).max(128),
    groupId: z.enum(["contabil", "go", "condominios"]).optional(),
  })
  .strict();
export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();
export const accountInputSchema = z
  .object({
    name,
    username,
    email,
    password,
    departments,
    permissions,
    role,
    managerId: z.string().max(80).optional(),
    homeView: homeView.optional(),
  })
  .strict();
export const accountImportSchema = z
  .object({ users: z.array(accountInputSchema).min(1).max(50) })
  .strict();
export const accountUpdateSchema = accountInputSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine(
    (input) => Object.keys(input).length > 0,
    "Informe os campos a alterar.",
  );

export function validateAccountPermissions(
  accountRole: Role,
  grants: Permission[],
) {
  void accountRole;
  const requires: Partial<Record<Permission, Permission>> = {
    "tasks.team.view": "tasks.view",
    "tasks.create": "tasks.view",
    "tasks.execute": "tasks.view",
    "tasks.attach": "tasks.view",
    "tasks.download": "tasks.view",
    "tasks.review": "tasks.view",
    "tasks.manage": "tasks.view",
    "tasks.export": "tasks.view",
    "tasks.assign": "tasks.view",
    "tasks.dispense": "tasks.view",
    "tasks.reopen": "tasks.view",
    "tasks.cancel": "tasks.view",
    "tasks.comment": "tasks.view",
    "overview.view": "tasks.view",
    "companies.manage": "companies.view",
    "templates.manage": "templates.view",
    "reports.performance.view": "reports.view",
    "processes.manage": "processes.view",
    "documents.manage": "documents.view",
    "changes.manage": "companies.view",
    "tv.manage": "tv.view",
    "tv.configure": "tv.view",
    "tv.team.view": "tv.view",
  };
  for (const grant of grants) {
    const required = requires[grant];
    if (required && !grants.includes(required))
      throw new BadRequestException("A ação exige acesso à respectiva aba.");
  }
}
