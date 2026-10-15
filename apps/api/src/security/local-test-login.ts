import { timingSafeEqual } from "node:crypto";
import { users } from "@apice/domain";

// TEMPORARY TEST ACCESS: remove this module and its callers before VPS release.
// Credentials are supplied privately; only this isolated fixture tenant is eligible.
export const LOCAL_TEST_TENANT = "apice-local-test";

export function isLocalTestShortcutAccount(tenantId: string, userId: string) {
  return tenantId === LOCAL_TEST_TENANT && ["helena", "julia"].includes(userId);
}

export function localTestLoginEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.NODE_ENV !== "development" ||
    env.ENABLE_LOCAL_TEST_LOGIN !== "true" ||
    env.PORTAL_STORAGE !== "postgres" ||
    !env.LOCAL_TEST_USERNAME ||
    !env.LOCAL_TEST_ADMIN_PASSWORD ||
    !env.LOCAL_TEST_OPERATOR_PASSWORD ||
    env.LOCAL_TEST_ADMIN_PASSWORD === env.LOCAL_TEST_OPERATOR_PASSWORD
  )
    return false;
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    return (
      ["localhost", "127.0.0.1"].includes(database.hostname) &&
      database.port === "55432"
    );
  } catch {
    return false;
  }
}

function matches(input: string, expected: string) {
  const supplied = Buffer.from(input);
  const configured = Buffer.from(expected);
  return (
    supplied.length === configured.length &&
    timingSafeEqual(supplied, configured)
  );
}

export function localTestIdentity(
  username: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    !localTestLoginEnabled(env) ||
    username !== env.LOCAL_TEST_USERNAME!.trim().toLowerCase()
  )
    return undefined;
  const userId = matches(password, env.LOCAL_TEST_ADMIN_PASSWORD!)
    ? "helena"
    : matches(password, env.LOCAL_TEST_OPERATOR_PASSWORD!)
      ? "julia"
      : undefined;
  const actor = users.find((user) => user.userId === userId);
  return actor
    ? { ...structuredClone(actor), tenantId: LOCAL_TEST_TENANT }
    : undefined;
}
