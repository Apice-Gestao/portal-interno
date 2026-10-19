import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApplication } from "../dist/bootstrap.js";
import type { INestApplication } from "@nestjs/common";

// S03 (19/10/2026): sessions are limited per person, not globally, so one
// account logging in many times never locks the rest of the office out.
let app: INestApplication;
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DEMO_AUTH", "true");
  vi.stubEnv("ENABLE_DEMO_SESSIONS", "true");
  vi.stubEnv("PORTAL_STORAGE", "memory");
  app = await createApplication();
}, 20000);
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});
const login = async (userId: string) =>
  (
    await request(app.getHttpServer())
      .post("/api/v1/demo-session")
      .send({ userId })
      .expect(201)
  ).body.token as string;
const status = async (token: string) =>
  (
    await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${token}`)
  ).status;

describe("sessions per person", () => {
  it("keeps the 5 newest sessions of a person and never blocks others", async () => {
    const other = await login("helena");
    const tokens: string[] = [];
    for (let i = 0; i < 8; i++) tokens.push(await login("julia"));
    expect(await status(tokens[0]!)).toBe(401);
    expect(await status(tokens[2]!)).toBe(401);
    for (const token of tokens.slice(3)) expect(await status(token)).toBe(200);
    expect(await status(other)).toBe(200);
    expect(await status(await login("marina"))).toBe(200);
  });
});
