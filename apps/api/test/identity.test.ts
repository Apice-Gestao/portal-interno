import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Actor } from "@apice/domain";
import { hashPassword, verifyPassword } from "../dist/security/password.js";
import { SessionService } from "../dist/security/session.service.js";
import type {
  EmailMfaService,
  MfaChallenge,
} from "../dist/security/email-mfa.service.js";
import { AuthGuard } from "../dist/security/auth.guard.js";
import type { AuthRequest } from "../dist/security/auth.guard.js";
import type {
  IdentityStore,
  Identity,
} from "../dist/database/identity-store.js";
import {
  accountInputSchema,
  accountUpdateSchema,
  loginSchema,
  passwordSchema,
  validateAccountPermissions,
} from "../dist/security/identity.schemas.js";

const admin: Actor = {
  userId: "account-test",
  tenantId: "test",
  name: "Administrador de teste",
  initials: "AT",
  role: "admin",
  departments: ["Fiscal"],
  permissions: ["users.manage"],
};
function setup(mustChangePassword = false) {
  let current: Identity = {
    actor: structuredClone(admin),
    mustChangePassword,
    passwordVersion: "1",
  };
  const identities = {
    authenticate: vi.fn(async () => structuredClone(current)),
    resolve: vi.fn(async () => structuredClone(current)),
    changePassword: vi.fn(async () => {
      current = { ...current, mustChangePassword: false, passwordVersion: "2" };
      return structuredClone(current);
    }),
  } as unknown as IdentityStore;
  const challenges = new Map<string, Identity>();
  let challengeSequence = 0;
  const mfa = {
    begin: vi.fn(async (identity: Identity): Promise<MfaChallenge> => {
      const challengeId = `test-challenge-${++challengeSequence}`.padEnd(
        43,
        "_",
      );
      challenges.set(challengeId, structuredClone(identity));
      return {
        requiresSecondFactor: true,
        challengeId,
        maskedEmail: "a***@example.invalid",
        needsEmail: false,
        expiresAt: Date.now() + 300_000,
      };
    }),
    verify: vi.fn(async (challengeId: string, code: string) => {
      const pending = challenges.get(challengeId);
      if (!pending || code !== "123456") throw new UnauthorizedException();
      const identity = await identities.resolve(pending.actor);
      if (identity.passwordVersion !== pending.passwordVersion)
        throw new UnauthorizedException();
      challenges.delete(challengeId);
      return identity;
    }),
  } as unknown as EmailMfaService;
  const sessions = new SessionService(identities, mfa);
  return {
    sessions,
    identities,
    mfa,
    set: (identity: Identity) => {
      current = identity;
    },
  };
}
async function login(fixture: ReturnType<typeof setup>) {
  const challenge = await fixture.sessions.login("admin", "initial");
  expect(challenge).not.toHaveProperty("token");
  if ("token" in challenge)
    throw new Error("Password login must require the second factor.");
  expect(challenge.requiresSecondFactor).toBe(true);
  expect(challenge.maskedEmail).toBe("a***@example.invalid");
  expect(challenge.needsEmail).toBe(false);
  expect(fixture.identities.authenticate).toHaveBeenCalledWith(
    "admin",
    "initial",
  );
  const session = await fixture.sessions.verifyLogin(
    challenge.challengeId,
    "123456",
  );
  expect(fixture.mfa.verify).toHaveBeenCalledWith(
    challenge.challengeId,
    "123456",
  );
  return session;
}
function context(
  path: string,
  method: string,
  token: string,
): ExecutionContext {
  const req = {
    path,
    method,
    headers: { authorization: `Bearer ${token}` },
  } as AuthRequest;
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}
describe("Password identity and mutable permissions", () => {
  it("hashes with independent salts and verifies without storing plaintext", async () => {
    const plaintext = "Local test password 19!";
    const first = await hashPassword(plaintext);
    const second = await hashPassword(plaintext);
    expect(first).not.toBe(second);
    expect(first).not.toContain(plaintext);
    expect(await verifyPassword(plaintext, first)).toBe(true);
    expect(await verifyPassword("wrong password", first)).toBe(false);
    expect(await verifyPassword(plaintext, "malformed")).toBe(false);
  });
  it("bounds concurrent password derivations and refuses excessive queued requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 21 }, () => hashPassword("Load test password 19!")),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(20);
    const refused = results.find((result) => result.status === "rejected");
    expect(refused?.status).toBe("rejected");
    if (refused?.status === "rejected") {
      expect(refused.reason).toBeInstanceOf(HttpException);
      expect((refused.reason as HttpException).getStatus()).toBe(429);
    }
    expect(
      await verifyPassword(
        "Recovery password 19!",
        await hashPassword("Recovery password 19!"),
      ),
    ).toBe(true);
  }, 15000);
  it("validates strict inputs and normalizes usernames without modifying passwords", () => {
    expect(
      loginSchema.parse({ username: " ADMIN ", password: " admin " }),
    ).toEqual({ username: "admin", password: " admin " });
    expect(
      loginSchema.safeParse({
        username: "admin",
        password: "admin",
        tenantId: "forged",
      }).success,
    ).toBe(false);
    expect(
      passwordSchema.safeParse({
        currentPassword: "admin",
        newPassword: "short",
      }).success,
    ).toBe(false);
    expect(
      accountInputSchema.safeParse({
        name: "Usuário",
        username: "worker",
        email: "worker@example.invalid",
        password: "Safe password 123",
        departments: ["Fiscal"],
        permissions: ["tasks.view", "unknown"],
        role: "operator",
      }).success,
    ).toBe(false);
    expect(accountUpdateSchema.safeParse({}).success).toBe(false);
  });
  it("allows administrator-assigned grants for any role and validates action dependencies", () => {
    expect(() =>
      validateAccountPermissions("operator", ["tasks.view", "tasks.execute"]),
    ).not.toThrow();
    expect(() =>
      validateAccountPermissions("operator", ["tasks.view", "tasks.create"]),
    ).not.toThrow();
    expect(() =>
      validateAccountPermissions("supervisor", ["users.manage"]),
    ).not.toThrow();
    expect(() =>
      validateAccountPermissions("admin", ["tasks.execute"]),
    ).toThrow();
    expect(() =>
      validateAccountPermissions("supervisor", ["companies.manage"]),
    ).toThrow();
    expect(() =>
      validateAccountPermissions("operator", ["tv.view", "tv.team.view"]),
    ).not.toThrow();
    expect(() =>
      validateAccountPermissions("admin", ["tv.team.view"]),
    ).toThrow();
  });
  it("requires a verified email challenge before issuing a session and consumes it once", async () => {
    const fixture = setup();
    const challenge = await fixture.sessions.login("admin", "initial");
    expect(challenge).not.toHaveProperty("token");
    if ("token" in challenge)
      throw new Error("Password login must require the second factor.");
    await expect(
      fixture.sessions.resolve(`Bearer ${challenge.challengeId}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      fixture.sessions.verifyLogin(challenge.challengeId, "000000"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const session = await fixture.sessions.verifyLogin(
      challenge.challengeId,
      "123456",
    );
    expect(
      (await fixture.sessions.resolve(`Bearer ${session.token}`)).userId,
    ).toBe(admin.userId);
    await expect(
      fixture.sessions.verifyLogin(challenge.challengeId, "123456"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("revalidates active accounts and updated permissions for existing sessions", async () => {
    const fixture = setup();
    const session = await login(fixture);
    fixture.set({
      actor: { ...admin, permissions: [] },
      mustChangePassword: false,
      passwordVersion: "1",
    });
    expect(
      (await fixture.sessions.resolve(`Bearer ${session.token}`)).permissions,
    ).toEqual([]);
    vi.mocked(fixture.identities.resolve).mockRejectedValueOnce(
      new UnauthorizedException(),
    );
    await expect(
      fixture.sessions.resolve(`Bearer ${session.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      fixture.sessions.resolve(`Bearer ${session.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("blocks all operational routes until the temporary password is changed", async () => {
    const fixture = setup(true);
    const session = await login(fixture);
    const guard = new AuthGuard(fixture.sessions, new Reflector());
    await expect(
      guard.canActivate(context("/api/v1/snapshot", "GET", session.token)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(context("/api/v1/users", "POST", session.token)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      await guard.canActivate(
        context("/api/v1/session/", "GET", session.token),
      ),
    ).toBe(true);
    expect(
      await guard.canActivate(
        context("/api/v1/password", "POST", session.token),
      ),
    ).toBe(true);
    expect(
      await guard.canActivate(
        context("/api/v1/session", "DELETE", session.token),
      ),
    ).toBe(true);
  });
  it("keeps the current session after a password change and revokes the others", async () => {
    const fixture = setup(true);
    const first = await login(fixture);
    const second = await login(fixture);
    await fixture.sessions.changePassword(
      `Bearer ${first.token}`,
      "initial",
      "New safe password 19!",
    );
    expect(
      (await fixture.sessions.resolveDetails(`Bearer ${first.token}`))
        .mustChangePassword,
    ).toBe(false);
    await expect(
      fixture.sessions.resolveDetails(`Bearer ${second.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("rejects a stale credential version even when a reset happened outside this process", async () => {
    const fixture = setup();
    const session = await login(fixture);
    fixture.set({
      actor: admin,
      mustChangePassword: true,
      passwordVersion: "2",
    });
    await expect(
      fixture.sessions.resolveDetails(`Bearer ${session.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify(session)).not.toContain("passwordVersion");
  });
  it("revokes already-issued demo tokens when demonstration authentication is disabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEMO_SESSIONS", "true");
    try {
      const fixture = setup();
      const session = fixture.sessions.create("julia");
      expect(
        (await fixture.sessions.resolve(`Bearer ${session.token}`)).userId,
      ).toBe("julia");
      vi.stubEnv("ENABLE_DEMO_SESSIONS", "false");
      await expect(
        fixture.sessions.resolve(`Bearer ${session.token}`),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      vi.stubEnv("ENABLE_DEMO_SESSIONS", "true");
      await expect(
        fixture.sessions.resolve(`Bearer ${session.token}`),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
