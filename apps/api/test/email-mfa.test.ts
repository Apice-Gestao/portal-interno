import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "@apice/domain";
import type {
  Identity,
  IdentityStore,
} from "../dist/database/identity-store.js";
import type { MailService } from "../dist/security/mail.service.js";
import {
  EmailMfaService,
  mfaEmailSchema,
  mfaVerifySchema,
} from "../dist/security/email-mfa.service.js";
import { SessionService } from "../dist/security/session.service.js";
import { createHash } from "node:crypto";

interface Row {
  token_hash: string;
  tenant_id: string;
  user_id: string;
  password_version: string;
  pending_email: string | null;
  code_hash: string | null;
  expires_at: Date;
  last_sent_at: Date | null;
  sends: number;
  attempts: number;
  delivery_pending: boolean;
  consumed_at: Date | null;
}
const actor: Actor = {
  userId: "test-user",
  tenantId: "test-tenant",
  name: "Teste",
  initials: "T",
  role: "operator",
  departments: ["Fiscal"],
  permissions: ["tasks.view", "tasks.execute"],
};
const identity: Identity = {
  actor,
  passwordVersion: "1",
  mustChangePassword: false,
};
function fixture(initialEmail: string | null = "test@example.invalid") {
  let version = "1";
  let email = initialEmail;
  let recent = "0";
  let total = "0";
  let committed = 0;
  let verifiedEmail = false;
  let capturedCode = "";
  const rows = new Map<string, Row>();
  let before = new Map<string, Row>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql === "BEGIN") before = structuredClone(rows);
    if (sql === "COMMIT") committed++;
    if (sql === "ROLLBACK") {
      rows.clear();
      for (const [key, value] of before) rows.set(key, value);
    }
    if (sql.startsWith("SELECT email,password_version"))
      return { rows: [{ email, password_version: version, active: true }] };
    if (sql.startsWith("SELECT count(*) FILTER"))
      return { rows: [{ recent, total }] };
    if (sql.startsWith("INSERT INTO portal.email_mfa_challenges")) {
      const row: Row = {
        token_hash: String(values[0]),
        tenant_id: String(values[1]),
        user_id: String(values[2]),
        password_version: String(values[3]),
        pending_email: values[4] as string | null,
        code_hash: values[5] as string | null,
        expires_at: new Date(Date.now() + 300_000),
        last_sent_at: values[4] ? new Date() : null,
        sends: values[4] ? 1 : 0,
        attempts: 0,
        delivery_pending: Boolean(values[4]),
        consumed_at: null,
      };
      rows.set(row.token_hash, row);
      return { rows: [structuredClone(row)] };
    }
    if (sql.startsWith("SELECT m.*,c.active")) {
      const row = rows.get(String(values[1]));
      return {
        rows: row
          ? [
              {
                ...structuredClone(row),
                active: true,
                current_password_version: version,
              },
            ]
          : [],
      };
    }
    if (sql.startsWith("UPDATE portal.email_mfa_challenges")) {
      const row = rows.get(String(values[1]));
      if (!row) return { rows: [], rowCount: 0 };
      if (sql.includes("attempts=attempts+1")) {
        row.attempts++;
        if (row.attempts >= 5) row.consumed_at = new Date();
      } else if (sql.includes("pending_email=$3")) {
        row.pending_email = String(values[2]);
        row.code_hash = String(values[3]);
        row.last_sent_at = new Date();
        row.sends = 1;
        row.delivery_pending = true;
      } else if (sql.includes("code_hash=$3")) {
        row.code_hash = String(values[2]);
        row.last_sent_at = new Date();
        row.sends++;
        row.delivery_pending = true;
      } else if (sql.includes("consumed_at=now()")) {
        row.consumed_at = new Date();
        if (sql.includes("delivery_pending=false"))
          row.delivery_pending = false;
      } else if (sql.includes("delivery_pending=false"))
        row.delivery_pending = false;
      return { rows: [structuredClone(row)], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE portal.credentials SET email=")) {
      email ??= String(values[2]);
      verifiedEmail = true;
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT email FROM portal.credentials"))
      return { rows: [{ email }] };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
    on: vi.fn(),
    end: vi.fn(async () => {}),
  } as unknown as Pool;
  const identities = {
    authenticate: vi.fn(async () => structuredClone(identity)),
    resolve: vi.fn(async () => ({
      ...structuredClone(identity),
      passwordVersion: version,
    })),
  } as unknown as IdentityStore;
  const mail = {
    sendVerification: vi.fn(async (_email: string, code: string) => {
      capturedCode = code;
    }),
  } as unknown as MailService;
  const mfa = new EmailMfaService(pool, identities, mail, {
    PORTAL_TENANT_ID: actor.tenantId,
    MFA_SECRET: "a".repeat(64),
  });
  const rowOf = (token: string) =>
    rows.get(createHash("sha256").update(token).digest("hex"))!;
  return {
    mfa,
    identities,
    mail,
    pool,
    query,
    rowOf,
    code: () => capturedCode,
    email: () => email,
    verified: () => verifiedEmail,
    commits: () => committed,
    setVersion: (value: string) => {
      version = value;
    },
    setRates: (user: string, active: string) => {
      recent = user;
      total = active;
    },
  };
}

describe("Mandatory email second factor", () => {
  it("fails closed when the database or private signing key is unavailable", async () => {
    const f = fixture();
    const noDatabase = new EmailMfaService(undefined, f.identities, f.mail, {
      MFA_SECRET: "a".repeat(64),
    });
    const noKey = new EmailMfaService(f.pool, f.identities, f.mail, {});
    await expect(noDatabase.begin(identity)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(noKey.begin(identity)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(vi.mocked(f.mail.sendVerification).mock.calls.length).toBe(0);
  });
  it("stores hashes and returns only a pending challenge after the password stage", async () => {
    const f = fixture();
    const sessions = new SessionService(f.identities, f.mfa);
    const pending = await sessions.login("test-user", "example password");
    expect(pending.requiresSecondFactor).toBe(true);
    expect(pending.maskedEmail).toBe("t***@example.invalid");
    expect("token" in pending || "actor" in pending).toBe(false);
    expect(/^\d{6}$/.test(f.code())).toBe(true);
    const row = f.rowOf(pending.challengeId);
    expect(/^[0-9a-f]{64}$/.test(row.code_hash ?? "")).toBe(true);
    expect(
      row.token_hash === pending.challengeId || row.code_hash === f.code(),
    ).toBe(false);
    expect(JSON.stringify(pending).includes(f.code())).toBe(false);
    await expect(
      sessions.resolve(`Bearer ${pending.challengeId}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const complete = await sessions.verifyLogin(pending.challengeId, f.code());
    expect((await sessions.resolve(`Bearer ${complete.token}`)).userId).toBe(
      actor.userId,
    );
    expect(f.verified()).toBe(true);
  });
  it("commits each wrong attempt and blocks even the right code after five failures", async () => {
    const f = fixture();
    const challenge = await f.mfa.begin(identity);
    const wrong = f.code() === "000000" ? "000001" : "000000";
    const firstCommit = f.commits();
    for (let index = 0; index < 5; index++)
      await expect(
        f.mfa.verify(challenge.challengeId, wrong),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.rowOf(challenge.challengeId).attempts).toBe(5);
    expect(f.commits() - firstCommit).toBe(5);
    await expect(
      f.mfa.verify(challenge.challengeId, f.code()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(vi.mocked(f.identities.resolve).mock.calls.length).toBe(0);
  });
  it("consumes a valid challenge and rejects replay", async () => {
    const f = fixture();
    const challenge = await f.mfa.begin(identity);
    await f.mfa.verify(challenge.challengeId, f.code());
    await expect(
      f.mfa.verify(challenge.challengeId, f.code()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(vi.mocked(f.identities.resolve).mock.calls.length).toBe(1);
  });
  it("rejects expiration and credential changes before issuing a session", async () => {
    const f = fixture();
    const expired = await f.mfa.begin(identity);
    f.rowOf(expired.challengeId).expires_at = new Date(Date.now() - 1);
    await expect(
      f.mfa.verify(expired.challengeId, f.code()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const changed = await f.mfa.begin(identity);
    f.setVersion("2");
    await expect(
      f.mfa.verify(changed.challengeId, f.code()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(vi.mocked(f.identities.resolve).mock.calls.length).toBe(0);
  });
  it("binds a legacy account email only after mailbox verification", async () => {
    const f = fixture(null);
    const pending = await f.mfa.begin(identity);
    expect(pending.needsEmail).toBe(true);
    expect(vi.mocked(f.mail.sendVerification).mock.calls.length).toBe(0);
    const sent = await f.mfa.enroll(
      pending.challengeId,
      " Mailbox@example.invalid ",
    );
    expect(sent.needsEmail).toBe(false);
    expect(f.email()).toBe(null);
    await f.mfa.verify(pending.challengeId, f.code());
    expect(f.email()).toBe("mailbox@example.invalid");
    expect(f.verified()).toBe(true);
  });
  it("limits resend intervals and total sends without extending expiration", async () => {
    const f = fixture();
    const pending = await f.mfa.begin(identity);
    await expect(f.mfa.resend(pending.challengeId)).rejects.toMatchObject({
      status: 429,
    });
    f.rowOf(pending.challengeId).last_sent_at = new Date(Date.now() - 61_000);
    const resent = await f.mfa.resend(pending.challengeId);
    expect(resent.expiresAt).toBe(pending.expiresAt);
    expect(f.rowOf(pending.challengeId).sends).toBe(2);
    f.rowOf(pending.challengeId).last_sent_at = new Date(Date.now() - 61_000);
    await f.mfa.resend(pending.challengeId);
    f.rowOf(pending.challengeId).last_sent_at = new Date(Date.now() - 61_000);
    await expect(f.mfa.resend(pending.challengeId)).rejects.toMatchObject({
      status: 429,
    });
    expect(vi.mocked(f.mail.sendVerification).mock.calls.length).toBe(3);
  });
  it("invalidates challenges when mail delivery fails", async () => {
    const f = fixture();
    vi.mocked(f.mail.sendVerification).mockRejectedValueOnce(
      new Error("private transport failure"),
    );
    await expect(f.mfa.begin(identity)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const insert = f.query.mock.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO portal.email_mfa_challenges"),
    );
    const privateHash = String(insert![1]![0]);
    const failedUpdate = f.query.mock.calls.some(
      ([sql, values]) =>
        sql.includes("consumed_at=now(),delivery_pending=false") &&
        values?.[1] === privateHash,
    );
    expect(failedUpdate).toBe(true);
  });
  it("bounds persisted challenge creation per account and per tenant", async () => {
    const f = fixture();
    f.setRates("5", "0");
    await expect(f.mfa.begin(identity)).rejects.toBeInstanceOf(HttpException);
    f.setRates("0", "100");
    await expect(f.mfa.begin(identity)).rejects.toMatchObject({ status: 429 });
    expect(vi.mocked(f.mail.sendVerification).mock.calls.length).toBe(0);
  });
  it("accepts only strict challenge/code and email payloads", () => {
    const challengeId = "a".repeat(43);
    expect(
      mfaVerifySchema.safeParse({
        challengeId,
        code: "123456",
        tenantId: "forged",
      }).success,
    ).toBe(false);
    expect(
      mfaVerifySchema.safeParse({ challengeId, code: "12345" }).success,
    ).toBe(false);
    expect(
      mfaEmailSchema.safeParse({ challengeId, email: "x\r\n@example.invalid" })
        .success,
    ).toBe(false);
    expect(
      mfaEmailSchema.parse({ challengeId, email: " ADMIN@Example.invalid " })
        .email,
    ).toBe("admin@example.invalid");
  });
});
