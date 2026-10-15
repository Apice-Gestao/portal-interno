import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { SchemaPipe, swaggerSchema } from "../common/validation.js";
import { Public } from "./auth.guard.js";
import { RecoveryService } from "./recovery.service.js";

export const forgotPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((email) => email.toLowerCase()),
  })
  .strict();
export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
    newPassword: z
      .string()
      .min(12, "A senha deve ter pelo menos 12 caracteres.")
      .max(128),
  })
  .strict();

@ApiTags("Recuperação de senha")
@Controller("api/v1/password")
export class RecoveryController {
  constructor(
    @Inject(RecoveryService) private readonly recovery: RecoveryService,
  ) {}
  @Public()
  @Post("forgot")
  @ApiBody({ schema: swaggerSchema(forgotPasswordSchema) })
  forgot(@Body(new SchemaPipe(forgotPasswordSchema)) body: { email: string }) {
    return this.recovery.forgot(body.email);
  }
  @Public()
  @Post("reset")
  @ApiBody({ schema: swaggerSchema(resetPasswordSchema) })
  reset(
    @Body(new SchemaPipe(resetPasswordSchema))
    body: {
      token: string;
      newPassword: string;
    },
  ) {
    return this.recovery.reset(body.token, body.newPassword);
  }
}
