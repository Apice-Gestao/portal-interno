import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { sessionSchema } from "@apice/domain";
import type { AccountInput, AccountUpdate } from "@apice/domain";
import { SchemaPipe, swaggerSchema } from "../common/validation.js";
import { RequirePermission } from "../common/permission.guard.js";
import { Public } from "./auth.guard.js";
import type { AuthRequest } from "./auth.guard.js";
import { SessionService } from "./session.service.js";
import { PortalService } from "../portal/portal.service.js";
import { IdentityStore } from "../database/identity-store.js";
import { isLocalTestShortcutAccount } from "./local-test-login.js";
import {
  mfaChallengeSchema,
  mfaEmailSchema,
  mfaVerifySchema,
} from "./email-mfa.service.js";
import {
  accountInputSchema,
  accountImportSchema,
  accountUpdateSchema,
  loginSchema,
  passwordSchema,
} from "./identity.schemas.js";

@ApiTags("Identidade e permissões")
@Controller("api/v1")
export class SessionController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PortalService) private readonly portal: PortalService,
    @Inject(IdentityStore) private readonly identities: IdentityStore,
  ) {}
  @Public() @Get("health") async health() {
    try {
      await this.portal.ready();
    } catch {
      throw new ServiceUnavailableException(
        "Persistência temporariamente indisponível.",
      );
    }
    return {
      status: "ok",
      persistence: this.portal.storageMode,
      authentication:
        this.portal.storageMode === "postgres"
          ? "password+email-mfa"
          : "local-demo",
    };
  }
  @Public()
  @Post("login")
  @ApiBody({ schema: swaggerSchema(loginSchema) })
  async login(
    @Body(new SchemaPipe(loginSchema))
    body: {
      username: string;
      password: string;
      groupId?: "contabil" | "go" | "condominios";
    },
    @Req() req: AuthRequest,
  ) {
    const result = await this.sessions.login(
      body.username,
      body.password,
      body.groupId,
    );
    if ("token" in result) {
      try {
        await this.portal.security(
          result.actor,
          "Acesso temporário de testes",
          "Sessão local com dados fictícios; remover antes da implantação na VPS.",
          this.securityContext(req),
        );
      } catch (error) {
        this.sessions.revoke(`Bearer ${result.token}`);
        throw error;
      }
    }
    return result;
  }
  @Public()
  @Post("login/email")
  @ApiBody({ schema: swaggerSchema(mfaEmailSchema) })
  async enrollEmail(
    @Body(new SchemaPipe(mfaEmailSchema))
    body: {
      challengeId: string;
      email: string;
    },
  ) {
    return this.sessions.enrollEmail(body.challengeId, body.email);
  }
  @Public()
  @Post("login/resend")
  @ApiBody({ schema: swaggerSchema(mfaChallengeSchema) })
  async resendLogin(
    @Body(new SchemaPipe(mfaChallengeSchema)) body: { challengeId: string },
  ) {
    return this.sessions.resendLogin(body.challengeId);
  }
  @Public()
  @Post("login/verify")
  @ApiBody({ schema: swaggerSchema(mfaVerifySchema) })
  async verifyLogin(
    @Body(new SchemaPipe(mfaVerifySchema))
    body: { challengeId: string; code: string },
    @Req() req: AuthRequest,
  ) {
    const session = await this.sessions.verifyLogin(
      body.challengeId,
      body.code,
    );
    try {
      await this.portal.security(
        session.actor,
        "Login realizado",
        "Identidade validada por senha e código enviado ao e-mail.",
        this.securityContext(req),
      );
      return session;
    } catch (error) {
      this.sessions.revoke(`Bearer ${session.token}`);
      throw error;
    }
  }
  @Get("session") async current(@Req() req: AuthRequest) {
    const session = await this.sessions.resolveDetails(
      req.headers.authorization,
    );
    return {
      actor: session.actor,
      expiresAt: session.expiresAt,
      mode: session.mode,
      mustChangePassword: session.mustChangePassword,
    };
  }
  @Post("password")
  @ApiBody({ schema: swaggerSchema(passwordSchema) })
  async password(
    @Body(new SchemaPipe(passwordSchema))
    body: { currentPassword: string; newPassword: string },
    @Req() req: AuthRequest,
  ) {
    return this.sessions.changePassword(
      req.headers.authorization,
      body.currentPassword,
      body.newPassword,
    );
  }
  @RequirePermission("users.manage")
  @Get("users")
  async users(@Req() req: AuthRequest) {
    return this.identities.list(req.actor);
  }
  @RequirePermission("users.manage")
  @Post("users")
  @ApiBody({ schema: swaggerSchema(accountInputSchema) })
  async createUser(
    @Body(new SchemaPipe(accountInputSchema)) body: AccountInput,
    @Req() req: AuthRequest,
  ) {
    return this.identities.create(req.actor, body);
  }
  @RequirePermission("users.manage")
  @Post("users/import")
  @ApiBody({ schema: swaggerSchema(accountImportSchema) })
  async importUsers(
    @Body(new SchemaPipe(accountImportSchema)) body: { users: AccountInput[] },
    @Req() req: AuthRequest,
  ) {
    return this.identities.createMany(req.actor, body.users);
  }
  @RequirePermission("users.manage")
  @Patch("users/:id")
  @ApiBody({ schema: swaggerSchema(accountUpdateSchema) })
  async updateUser(
    @Param("id") userId: string,
    @Body(new SchemaPipe(accountUpdateSchema)) body: AccountUpdate,
    @Req() req: AuthRequest,
  ) {
    if (
      body.password !== undefined &&
      isLocalTestShortcutAccount(req.actor.tenantId, userId)
    )
      throw new ConflictException(
        "As senhas dos dois acessos de teste são definidas na configuração local. Edite apenas os dados e permissões destas contas.",
      );
    const updated = await this.identities.update(req.actor, userId, body);
    if (body.password !== undefined || body.active === false)
      this.sessions.revokeUser(req.actor.tenantId, userId);
    return updated;
  }
  @Public()
  @Post("demo-session")
  @ApiBody({ schema: swaggerSchema(sessionSchema) })
  async create(
    @Body(new SchemaPipe(sessionSchema)) body: { userId: string },
    @Req() req: AuthRequest,
  ) {
    if (
      process.env.NODE_ENV !== "development" ||
      process.env.ENABLE_DEMO_SESSIONS !== "true"
    )
      throw new ForbiddenException(
        "Autenticação de demonstração desabilitada.",
      );
    const session = this.sessions.create(body.userId);
    try {
      await this.portal.security(
        session.actor,
        "Sessão demonstrativa iniciada",
        "Perfil fictício selecionado para teste.",
        this.securityContext(req),
      );
      return session;
    } catch (error) {
      this.sessions.revoke(`Bearer ${session.token}`);
      throw error;
    }
  }
  @Delete("session") async revoke(@Req() req: AuthRequest) {
    this.sessions.revoke(req.headers.authorization);
    await this.portal.security(
      req.actor,
      "Sessão revogada",
      "Encerramento da sessão.",
      this.securityContext(req),
    );
    return { revoked: true };
  }
  private securityContext(req: AuthRequest) {
    return {
      ip: req.ip,
      device: String(req.headers["user-agent"] ?? "").slice(0, 200),
    };
  }
}
