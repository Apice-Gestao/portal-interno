import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { OPERATOR_PERMISSIONS, PERMISSIONS } from "@apice/domain";
import type { IdentityStore } from "../dist/database/identity-store.js";
import type { EmailMfaService } from "../dist/security/email-mfa.service.js";
import { SessionService } from "../dist/security/session.service.js";
import { SessionController } from "../dist/security/session.controller.js";
import type { AuthRequest } from "../dist/security/auth.guard.js";
import type { PortalService } from "../dist/portal/portal.service.js";
import {
  LOCAL_TEST_TENANT,
  LOCAL_TEST_GROUPS,
  localTestIdentity,
  localTestLoginEnabled,
} from "../dist/security/local-test-login.js";

const env = {
  NODE_ENV: "development",
  PORTAL_STORAGE: "postgres",
  DATABASE_URL: "postgresql://test:synthetic@127.0.0.1:55432/test",
  ENABLE_LOCAL_TEST_LOGIN: "true",
  LOCAL_TEST_USERNAME: "admin",
  LOCAL_TEST_ADMIN_PASSWORD: "admin",
  LOCAL_TEST_OPERATOR_PASSWORD: "operador",
};
function setup() {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const identities = {
    resolve: vi.fn(async (actor) => ({
      actor: {
        ...actor,
        active: true,
        permissions:
          actor.role === "admin" ? [...PERMISSIONS] : [...OPERATOR_PERMISSIONS],
      },
      passwordVersion: "1",
      mustChangePassword: false,
    })),
    authenticate: vi.fn(async () => ({
      actor: { userId: "normal", tenantId: "normal" },
    })),
  };
  const mfa = {
    begin: vi.fn(async () => ({
      requiresSecondFactor: true,
      challengeId: "test-challenge",
    })),
  };
  return {
    identities,
    mfa,
    sessions: new SessionService(
      identities as unknown as IdentityStore,
      mfa as unknown as EmailMfaService,
    ),
  };
}
afterEach(() => vi.unstubAllEnvs());
describe("Temporary isolated local login", () => {
  it.each(Object.entries(LOCAL_TEST_GROUPS))(
    "isolates the %s demonstration in its fixture tenant",
    async (groupId, tenantId) => {
      const { sessions, identities } = setup();
      const result = await sessions.login(
        "admin",
        "admin",
        groupId as keyof typeof LOCAL_TEST_GROUPS,
      );
      if (!("token" in result)) throw new Error("Expected test session");
      expect(result.actor.tenantId).toBe(tenantId);
      expect((await sessions.resolve(`Bearer ${result.token}`)).tenantId).toBe(
        tenantId,
      );
      expect(identities.authenticate).not.toHaveBeenCalled();
    },
  );
  it("does not authenticate normal accounts in an unconfigured group", async () => {
    const { sessions, identities } = setup();
    await expect(
      sessions.login("normal", "password", "go"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.authenticate).not.toHaveBeenCalled();
  });
  it("blocks fixture password resets while preserving grants and normal account resets", async () => {
    const identities = { update: vi.fn(async () => ({})) };
    const sessions = { revokeUser: vi.fn() };
    const controller = new SessionController(
      sessions as unknown as SessionService,
      {} as PortalService,
      identities as unknown as IdentityStore,
    );
    const request = { actor: { tenantId: LOCAL_TEST_TENANT } } as AuthRequest;
    for (const id of ["helena", "julia"])
      await expect(
        controller.updateUser(
          id,
          { password: "SyntheticNewPassword123!" },
          request,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    expect(identities.update).not.toHaveBeenCalled();
    await controller.updateUser(
      "julia",
      { permissions: ["tasks.view"] },
      request,
    );
    await controller.updateUser(
      "julia",
      { password: "SyntheticNewPassword123!" },
      { actor: { tenantId: "normal" } } as AuthRequest,
    );
    expect(identities.update).toHaveBeenCalledTimes(2);
    expect(sessions.revokeUser).toHaveBeenCalledTimes(1);
  });
  it("requires opt-in, development, separate credentials and dedicated local PostgreSQL", () => {
    expect(localTestLoginEnabled(env)).toBe(true);
    for (const override of [
      { ENABLE_LOCAL_TEST_LOGIN: "false" },
      { NODE_ENV: "production" },
      { PORTAL_STORAGE: "memory" },
      { LOCAL_TEST_USERNAME: "" },
      { LOCAL_TEST_ADMIN_PASSWORD: "" },
      { LOCAL_TEST_OPERATOR_PASSWORD: "admin" },
      { DATABASE_URL: "postgresql://test:test@remote.example:55432/test" },
      { DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test" },
      { DATABASE_URL: "bad-url" },
    ])
      expect(localTestLoginEnabled({ ...env, ...override })).toBe(false);
    expect(localTestIdentity("other", "admin", env)).toBeUndefined();
    expect(localTestIdentity("admin", " admin ", env)).toBeUndefined();
  });
  it.each([
    ["admin", "admin"],
    ["operador", "operator"],
  ])(
    "issues the requested %s fixture with persisted grants",
    async (password, role) => {
      const { sessions, identities, mfa } = setup();
      const result = await sessions.login("admin", password);
      expect("token" in result).toBe(true);
      if (!("token" in result)) throw new Error("Expected test session");
      expect(result.mode).toBe("local-test");
      expect(result.actor.role).toBe(role);
      expect(result.actor.tenantId).toBe(LOCAL_TEST_TENANT);
      expect(result.actor.permissions).toEqual(
        role === "admin" ? [...PERMISSIONS] : [...OPERATOR_PERMISSIONS],
      );
      expect(identities.authenticate).not.toHaveBeenCalled();
      expect(mfa.begin).not.toHaveBeenCalled();
      expect((await sessions.resolve(`Bearer ${result.token}`)).userId).toBe(
        result.actor.userId,
      );
    },
  );
  it("preserves MFA for unmatched credentials and when the shortcut is disabled", async () => {
    const { sessions, mfa, identities } = setup();
    const normal = await sessions.login("other", "password");
    expect(normal).toEqual({
      requiresSecondFactor: true,
      challengeId: "test-challenge",
    });
    expect(normal).not.toHaveProperty("token");
    vi.stubEnv("ENABLE_LOCAL_TEST_LOGIN", "false");
    await sessions.login("admin", "admin");
    vi.stubEnv("ENABLE_LOCAL_TEST_LOGIN", "true");
    vi.stubEnv("NODE_ENV", "production");
    await sessions.login("admin", "operador");
    expect(identities.authenticate).toHaveBeenCalledTimes(3);
    expect(mfa.begin).toHaveBeenCalledTimes(3);
  });
  it("revokes an issued test session permanently when the opt-in is disabled", async () => {
    const { sessions } = setup();
    const result = await sessions.login("admin", "admin");
    if (!("token" in result)) throw new Error("Expected test session");
    vi.stubEnv("ENABLE_LOCAL_TEST_LOGIN", "false");
    await expect(
      sessions.resolve(`Bearer ${result.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    vi.stubEnv("ENABLE_LOCAL_TEST_LOGIN", "true");
    await expect(
      sessions.resolve(`Bearer ${result.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("revalidates grants, inactivity and password version without accepting client roles", async () => {
    const { sessions, identities } = setup();
    const result = await sessions.login("admin", "operador");
    if (!("token" in result)) throw new Error("Expected test session");
    identities.resolve.mockResolvedValueOnce({
      actor: { ...result.actor, active: true, permissions: [] },
      passwordVersion: "1",
      mustChangePassword: false,
    });
    expect(
      (await sessions.resolve(`Bearer ${result.token}`)).permissions,
    ).toEqual([]);
    identities.resolve.mockResolvedValueOnce({
      actor: result.actor,
      passwordVersion: "2",
      mustChangePassword: true,
    });
    await expect(
      sessions.resolve(`Bearer ${result.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const other = await sessions.login("admin", "admin");
    if (!("token" in other)) throw new Error("Expected test session");
    identities.resolve.mockRejectedValueOnce(new UnauthorizedException());
    await expect(
      sessions.resolve(`Bearer ${other.token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
