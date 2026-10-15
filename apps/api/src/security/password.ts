import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { HttpException } from "@nestjs/common";

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let running = 0;
const waiting: Array<() => void> = [];
async function acquire() {
  if (running < 4) {
    running++;
    return;
  }
  if (waiting.length >= 16)
    throw new HttpException(
      "Muitas verificações de senha. Aguarde e tente novamente.",
      429,
    );
  await new Promise<void>((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  await acquire();
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, parameters, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  } finally {
    release();
  }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const match = /^scrypt\$32768\$8\$3\$([0-9a-f]{64})\$([0-9a-f]{128})$/.exec(
    encoded,
  );
  if (!match) return false;
  const actual = await derive(password, Buffer.from(match[1]!, "hex"));
  return timingSafeEqual(actual, Buffer.from(match[2]!, "hex"));
}
// Unknown logins still perform the same expensive derivation as known accounts.
export const DUMMY_PASSWORD_HASH = `scrypt$32768$8$3$${"0".repeat(64)}$${"0".repeat(128)}`;
