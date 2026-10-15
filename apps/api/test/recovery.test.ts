import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { Pool } from "pg";
import type { Actor } from "@apice/domain";
import {
  newRecoveryToken,
  recoveryTokenHash,
  RecoveryService,
} from "../dist/security/recovery.service.js";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../dist/security/recovery.controller.js";
import {
  MailService,
  resetLink,
  smtpOptions,
} from "../dist/security/mail.service.js";
import { verifyPassword } from "../dist/security/password.js";

const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({ accepted: [] })),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => smtp) },
}));
const account = {
  user_id: "recovery-unit",
  email: "worker@example.test",
  password_version: "7",
  payload: {
    tenantId: "test",
    userId: "recovery-unit",
    name: "Conta de teste",
    initials: "CT",
    role: "operator",
    departments: ["Fiscal"],
    permissions: ["tasks.view", "tasks.execute"],
  } satisfies Actor,
};
function fixture(
  options: {
    exists?: boolean;
    invalidVersion?: boolean;
    invalidToken?: boolean;
    commitFails?: boolean;
  } = {},
) {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    queries.push({ sql, args });
    if (
      sql.startsWith("SELECT c.user_id,c.email") &&
      sql.includes("password_reset_tokens")
    )
      return {
        rows: options.invalidToken
          ? []
          : [
              {
                ...account,
                issued_password_version: options.invalidVersion ? "6" : "7",
              },
            ],
      };
    if (sql.startsWith("SELECT c.user_id,c.email"))
      return { rows: options.exists === false ? [] : [account] };
    if (sql === "COMMIT" && options.commitFails)
      throw new Error("Failure containing a private server detail");
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const pool = {
    connect: vi.fn(async () => client),
    on: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;
  const mail = {
    sendReset: vi.fn(async () => undefined),
  } as unknown as MailService;
  const service = new RecoveryService(undefined, mail, "test", pool);
  return { service, mail, queries, query, client };
}
const mailEnv = {
  NODE_ENV: "development",
  MAIL_DELIVERY: "smtp",
  PORTAL_PUBLIC_URL: "https://portal.example.test/",
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "unit-test-sender",
  SMTP_PASSWORD: "synthetic-unit-test-credential",
  SMTP_FROM: "sender@example.test",
};

describe("Private password recovery", () => {
  it("creates independent 256-bit secrets and stores only a fixed SHA-256 digest", () => {
    const secrets = Array.from({ length: 1000 }, () => newRecoveryToken());
    expect(new Set(secrets.map(({ token }) => token)).size).toBe(1000);
    for (const secret of secrets) {
      expect(Buffer.from(secret.token, "base64url")).toHaveLength(32);
      expect(secret.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(secret.hash).toBe(recoveryTokenHash(secret.token));
      expect(secret.hash).not.toContain(secret.token);
    }
  });
  it("validates strict email/token/password inputs without accepting a forged tenant", () => {
    expect(
      forgotPasswordSchema.parse({ email: " Worker@Example.Test " }),
    ).toEqual({ email: "worker@example.test" });
    expect(
      forgotPasswordSchema.safeParse({
        email: "worker@example.test",
        tenantId: "forged",
      }).success,
    ).toBe(false);
    expect(
      forgotPasswordSchema.safeParse({
        email: "worker@example.test\r\nBcc: other@example.test",
      }).success,
    ).toBe(false);
    expect(
      forgotPasswordSchema.safeParse({
        email: `${"a".repeat(250)}@example.test`,
      }).success,
    ).toBe(false);
    const token = newRecoveryToken().token;
    expect(
      resetPasswordSchema.safeParse({ token, newPassword: "short" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        token: "bad",
        newPassword: "Safe password 19!",
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        token,
        newPassword: "Safe password 19!",
        userId: "forged",
      }).success,
    ).toBe(false);
  });
  it("keeps the same public response for known, unknown and unavailable accounts", async () => {
    const known = fixture();
    const unknown = fixture({ exists: false });
    const unavailable = new RecoveryService(undefined, known.mail);
    const responses = await Promise.all([
      known.service.forgot(account.email),
      unknown.service.forgot("absent@example.test"),
      unavailable.forgot(account.email),
    ]);
    expect(responses).toEqual([
      { accepted: true },
      { accepted: true },
      { accepted: true },
    ]);
    expect(vi.mocked(known.mail.sendReset)).toHaveBeenCalledOnce();
    expect(vi.mocked(unknown.mail.sendReset)).not.toHaveBeenCalled();
    const secret = vi.mocked(known.mail.sendReset).mock.calls[0]![1];
    const insert = known.queries.find(({ sql }) =>
      sql.startsWith("INSERT INTO portal.password_reset_tokens"),
    );
    expect(insert?.args?.[0]).toBe(recoveryTokenHash(secret));
    expect(insert?.args?.[3]).toBe(account.password_version);
    expect(JSON.stringify(known.queries)).not.toContain(secret);
    const audit = known.queries.find(({ sql }) =>
      sql.startsWith("INSERT INTO portal.audit"),
    );
    expect(JSON.stringify(audit)).not.toContain(account.email);
    expect(JSON.stringify(audit)).not.toContain(secret);
    expect(
      known.queries.findIndex(({ sql }) => sql === "COMMIT"),
    ).toBeGreaterThan(
      known.queries.findIndex(({ sql }) =>
        sql.startsWith("INSERT INTO portal.password_reset_tokens"),
      ),
    );
    await known.service.waitForDeliveries();
  });
  it("keeps delivery latency outside the HTTP response and invalidates a failed delivery", async () => {
    const failed = fixture();
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    vi.mocked(failed.mail.sendReset).mockRejectedValueOnce(
      new Error("private delivery data"),
    );
    try {
      expect(await failed.service.forgot(account.email)).toEqual({
        accepted: true,
      });
      await failed.service.waitForDeliveries();
      expect(
        failed.queries.some(({ sql }) =>
          sql.includes("token_hash=$2 AND used_at IS NULL"),
        ),
      ).toBe(true);
      expect(JSON.stringify(warning.mock.calls)).not.toContain(
        "private delivery data",
      );
      const blocked = fixture();
      let release: () => void = () => undefined;
      vi.mocked(blocked.mail.sendReset).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      expect(await blocked.service.forgot(account.email)).toEqual({
        accepted: true,
      });
      release();
      await blocked.service.waitForDeliveries();
    } finally {
      warning.mockRestore();
    }
  });
  it("never sends a reset message before its transaction has committed", async () => {
    const failed = fixture({ commitFails: true });
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      expect(await failed.service.forgot(account.email)).toEqual({
        accepted: true,
      });
      expect(vi.mocked(failed.mail.sendReset)).not.toHaveBeenCalled();
      expect(failed.queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
      expect(failed.client.release).toHaveBeenCalledOnce();
      expect(JSON.stringify(warning.mock.calls)).not.toContain(
        "private server detail",
      );
    } finally {
      warning.mockRestore();
    }
  });
  it("rejects invalid, consumed/expired and stale-version links before changing a password", async () => {
    const invalid = fixture({ invalidToken: true });
    const stale = fixture({ invalidVersion: true });
    await expect(
      invalid.service.reset("bad", "Safe password 19!"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(invalid.query).not.toHaveBeenCalled();
    const token = newRecoveryToken().token;
    await expect(
      invalid.service.reset(token, "Safe password 19!"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      stale.service.reset(token, "Safe password 19!"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      [...invalid.queries, ...stale.queries].some(({ sql }) =>
        sql.startsWith("UPDATE portal.credentials"),
      ),
    ).toBe(false);
    expect(stale.queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });
  it("hashes the new password, advances the credential version and consumes all links atomically", async () => {
    const valid = fixture();
    const token = newRecoveryToken().token;
    const password = "Recovered test password 19!";
    expect(await valid.service.reset(token, password)).toEqual({ reset: true });
    const update = valid.queries.find(({ sql }) =>
      sql.startsWith("UPDATE portal.credentials"),
    );
    expect(update?.sql).toContain("password_version=password_version+1");
    expect(update?.sql).toContain("must_change_password=false");
    expect(await verifyPassword(password, update?.args?.[2] as string)).toBe(
      true,
    );
    expect(JSON.stringify(valid.queries)).not.toContain(password);
    expect(JSON.stringify(valid.queries)).not.toContain(token);
    expect(
      valid.queries.some(({ sql }) =>
        sql.includes("user_id=$2 AND used_at IS NULL"),
      ),
    ).toBe(true);
    expect(valid.queries.at(-1)?.sql).toBe("COMMIT");
  });
});

describe("Recovery and verification delivery configuration", () => {
  it("requires HTTPS outside local development and keeps reset secrets in the URL fragment", () => {
    const token = newRecoveryToken().token;
    const url = new URL(
      resetLink("https://portal.example.test/", token, false),
    );
    expect(url.search).toBe("");
    expect(url.hash).toContain(token);
    expect(() =>
      resetLink("http://portal.example.test/", token, true),
    ).toThrow();
    expect(() => resetLink("http://127.0.0.1:5173/", token, false)).toThrow();
    expect(() =>
      resetLink("https://user:pass@portal.example.test/", token, false),
    ).toThrow();
    expect(() =>
      resetLink("https://portal.example.test/?redirect=other", token, false),
    ).toThrow();
    expect(resetLink("http://127.0.0.1:5173/", token, true)).toContain(
      "#/redefinir-senha?token=",
    );
  });
  it("requires TLS with certificate verification and disables mail debug/content fetches", () => {
    expect(smtpOptions(mailEnv)).toMatchObject({
      secure: false,
      requireTLS: true,
      opportunisticTLS: false,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(
      smtpOptions({ ...mailEnv, SMTP_SECURE: "true", SMTP_PORT: "465" }),
    ).toMatchObject({ secure: true, requireTLS: false });
    expect(() =>
      smtpOptions({ ...mailEnv, SMTP_PASSWORD: undefined }),
    ).toThrow();
    expect(() => smtpOptions({ ...mailEnv, SMTP_PORT: "0" })).toThrow();
    expect(() =>
      smtpOptions({
        ...mailEnv,
        SMTP_FROM: "sender@example.test\r\nBcc: other@example.test",
      }),
    ).toThrow();
  });
  it("has no silent local fallback when delivery is absent or running in production", async () => {
    expect(
      () => new MailService({ MAIL_DELIVERY: "local", NODE_ENV: "production" }),
    ).toThrow();
    expect(
      () =>
        new MailService({
          MAIL_DELIVERY: "smtp",
          PORTAL_PUBLIC_URL: "https://portal.example.test",
        }),
    ).toThrow();
    expect(
      () =>
        new MailService({
          NODE_ENV: "development",
          MAIL_DELIVERY: "local",
          PORTAL_PUBLIC_URL: "http://127.0.0.1:5173",
          MAIL_OUTBOX_DIR: "../unprotected-mail",
        }),
    ).toThrow();
    const disabled = new MailService({});
    await expect(
      disabled.sendReset(account.email, newRecoveryToken().token),
    ).rejects.toThrow("ainda não configurada");
    await expect(
      disabled.sendVerification(account.email, "123456"),
    ).rejects.toThrow("ainda não configurada");
  });
  it("sends password-reset links and short-lived verification codes through one configured transport", async () => {
    smtp.sendMail.mockClear();
    const service = new MailService(mailEnv);
    const token = newRecoveryToken().token;
    await service.sendReset(account.email, token);
    await service.sendVerification(account.email, "123456");
    expect(smtp.sendMail).toHaveBeenCalledTimes(2);
    const first = smtp.sendMail.mock.calls[0] as unknown as [
      { text: string; envelope: { to: string[] } },
    ];
    const second = smtp.sendMail.mock.calls[1] as unknown as [{ text: string }];
    expect(first[0].text).toContain(`#/redefinir-senha?token=${token}`);
    expect(first[0].envelope.to).toEqual([account.email]);
    expect(second[0].text).toContain("123456");
    expect(second[0].text).toContain("5 minutos");
    await expect(
      service.sendVerification(account.email, "unsafe\r\ncode"),
    ).rejects.toThrow("Código");
  });
});
