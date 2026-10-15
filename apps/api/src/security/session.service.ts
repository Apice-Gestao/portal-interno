import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { users } from "@apice/domain";
import type { Actor } from "@apice/domain";
import { IdentityStore } from "../database/identity-store.js";
import type { Identity } from "../database/identity-store.js";
import { EmailMfaService } from "./email-mfa.service.js";
import {
  localTestIdentity,
  localTestLoginEnabled,
  LOCAL_TEST_TENANT,
} from "./local-test-login.js";

interface StoredSession {
  actor: Actor;
  expiresAt: number;
  mode: "demo" | "password" | "local-test";
  mustChangePassword: boolean;
  passwordVersion?: string;
}
@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, StoredSession>();
  constructor(
    @Inject(IdentityStore) private readonly identities: IdentityStore,
    @Optional() @Inject(EmailMfaService) private readonly mfa?: EmailMfaService,
  ) {}
  private issue(identity: Identity, mode: StoredSession["mode"]) {
    for (const [key, value] of this.sessions)
      if (value.expiresAt < Date.now()) this.sessions.delete(key);
    if (this.sessions.size >= 100)
      throw new UnauthorizedException("Limite de sessões atingido.");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const stored = {
      ...identity,
      actor: structuredClone(identity.actor),
      expiresAt,
      mode,
    };
    this.sessions.set(token, stored);
    return {
      token,
      actor: stored.actor,
      expiresAt,
      mode,
      mustChangePassword: stored.mustChangePassword,
    };
  }
  create(userId: string) {
    const actor = users.find((user) => user.userId === userId);
    if (!actor)
      throw new UnauthorizedException("Perfil de demonstração inválido.");
    return this.issue({ actor, mustChangePassword: false }, "demo");
  }
  async login(username: string, password: string) {
    // TEMPORARY: explicit local fixture access requested for UI testing. Remove before VPS release.
    const testActor = localTestIdentity(username, password);
    if (testActor) {
      const identity = await this.identities.resolve(testActor);
      return this.issue(identity, "local-test");
    }
    if (!this.mfa)
      throw new ServiceUnavailableException(
        "Verificação por e-mail ainda não configurada.",
      );
    return this.mfa.begin(
      await this.identities.authenticate(username, password),
    );
  }
  async verifyLogin(challengeId: string, code: string) {
    if (!this.mfa)
      throw new ServiceUnavailableException(
        "Verificação por e-mail ainda não configurada.",
      );
    return this.issue(await this.mfa.verify(challengeId, code), "password");
  }
  async enrollEmail(challengeId: string, email: string) {
    if (!this.mfa)
      throw new ServiceUnavailableException(
        "Verificação por e-mail ainda não configurada.",
      );
    return this.mfa.enroll(challengeId, email);
  }
  async resendLogin(challengeId: string) {
    if (!this.mfa)
      throw new ServiceUnavailableException(
        "Verificação por e-mail ainda não configurada.",
      );
    return this.mfa.resend(challengeId);
  }
  async resolveDetails(header?: string) {
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException("Sessão necessária.");
    const token = header.slice(7);
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    }
    if (
      session.mode === "demo" &&
      (process.env.NODE_ENV !== "development" ||
        process.env.ENABLE_DEMO_SESSIONS !== "true")
    ) {
      this.sessions.delete(token);
      throw new UnauthorizedException(
        "Autenticação de demonstração desabilitada.",
      );
    }
    if (
      session.mode === "local-test" &&
      (!localTestLoginEnabled() || session.actor.tenantId !== LOCAL_TEST_TENANT)
    ) {
      this.sessions.delete(token);
      throw new UnauthorizedException(
        "Acesso temporário de testes desabilitado.",
      );
    }
    if (session.mode === "password" || session.mode === "local-test") {
      try {
        const identity = await this.identities.resolve(session.actor);
        if (identity.passwordVersion !== session.passwordVersion)
          throw new UnauthorizedException(
            "Sua sessão expirou. Entre novamente.",
          );
        session.actor = structuredClone(identity.actor);
        session.mustChangePassword = identity.mustChangePassword;
      } catch (error) {
        if (error instanceof UnauthorizedException) this.sessions.delete(token);
        throw error;
      }
    }
    return structuredClone(session);
  }
  async resolve(header?: string): Promise<Actor> {
    return (await this.resolveDetails(header)).actor;
  }
  async changePassword(
    header: string | undefined,
    currentPassword: string,
    newPassword: string,
  ) {
    const session = await this.resolveDetails(header);
    if (session.mode !== "password")
      throw new UnauthorizedException("Entre com usuário e senha.");
    const identity = await this.identities.changePassword(
      session.actor,
      currentPassword,
      newPassword,
    );
    this.revokeUser(session.actor.tenantId, session.actor.userId, header);
    const stored = this.sessions.get(header!.slice(7));
    if (stored) Object.assign(stored, identity);
    return {
      actor: identity.actor,
      mustChangePassword: false,
      expiresAt: session.expiresAt,
      mode: session.mode,
    };
  }
  revokeUser(tenantId: string, userId: string, exceptHeader?: string) {
    const exceptToken = exceptHeader?.startsWith("Bearer ")
      ? exceptHeader.slice(7)
      : undefined;
    for (const [token, session] of this.sessions)
      if (
        token !== exceptToken &&
        session.actor.tenantId === tenantId &&
        session.actor.userId === userId
      )
        this.sessions.delete(token);
  }
  revoke(header?: string) {
    if (header?.startsWith("Bearer ")) this.sessions.delete(header.slice(7));
  }
}
