import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApplication, validateEnvironment } from "../dist/bootstrap.js";
import { demoPdf, cnpjFromBase } from "@apice/domain";
import type { INestApplication } from "@nestjs/common";
import { PortalService } from "../dist/portal/portal.service.js";
let app: INestApplication;
let token: string;
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DEMO_AUTH", "true");
  vi.stubEnv('ENABLE_DEMO_SESSIONS','true');
  vi.stubEnv("PORTAL_STORAGE", "memory");
  app = await createApplication();
  const result = await request(app.getHttpServer())
    .post("/api/v1/demo-session")
    .send({ userId: "julia" });
  token = result.body.token;
}, 20000);
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});
describe("HTTP security and contracts", () => {
  it("reports unavailable persistence without leaking the database error", async () => {
    const ping = vi
      .spyOn(app.get(PortalService).store, "ping")
      .mockRejectedValueOnce(new Error("private connection details"));
    try {
      const failed = await request(app.getHttpServer())
        .get("/api/v1/health")
        .expect(503);
      expect(JSON.stringify(failed.body)).not.toContain(
        "private connection details",
      );
      await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    } finally {
      ping.mockRestore();
    }
  });
  it("returns 401 when a session is missing or forged", async () => {
    await request(app.getHttpServer()).get("/api/v1/snapshot").expect(401);
    await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", "Bearer fake")
      .expect(401);
  });
  it("returns an authorized snapshot and security headers", async () => {
    const result = await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(result.body.tasks.length).toBeGreaterThan(0);
    expect(
      result.body.tasks.every(
        (t: { department: string; tenantId: string }) =>
          t.department === "Fiscal" && t.tenantId === "apice-demo",
      ),
    ).toBe(true);
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.headers["cache-control"]).toBe("no-store");
  });
  it("denies foreign browser origins and hostnames", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/demo-session")
      .set("Origin", "https://evil.example")
      .send({ userId: "helena" })
      .expect(403);
    await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Host", "evil.example")
      .expect(403);
  });
  it("ignores client-supplied tenant and profile headers", async () => {
    const result = await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Id", "foreign")
      .set("X-Role", "admin")
      .expect(200);
    expect(
      result.body.tasks.every(
        (t: { tenantId: string }) => t.tenantId === "apice-demo",
      ),
    ).toBe(true);
  });
  it("rejects unknown fields and short reasons", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/tasks/task-2/actions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "start", expectedRevision: 1, role: "admin" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/tasks/task-2/actions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "dispense", expectedRevision: 1, reason: "x" })
      .expect(400);
  });
  it("denies direct dispensation and foreign-department resources", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/tasks/task-2/actions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "dispense",
        expectedRevision: 1,
        reason: "Motivo informado pelo operador.",
      })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/v1/tasks/other-0/actions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "start", expectedRevision: 1 })
      .expect(404);
  });
  it("checks missing evidence and stale revisions", async () => {
    const state = await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${token}`);
    const task = state.body.tasks.find(
      (t: { status: string; requiresReview: boolean }) =>
        t.status === "todo" && t.requiresReview,
    );
    const started = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${task.id}/actions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "start", expectedRevision: task.revision })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${task.id}/actions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "submit", expectedRevision: started.body.revision })
      .expect(422);
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${task.id}/actions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "start", expectedRevision: task.revision })
      .expect(409);
  });
  it("rejects arbitrary uploaded content and accepts structural PDF evidence", async () => {
    const state = await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${token}`);
    const task = state.body.tasks.find(
      (t: { status: string }) => t.status === "in_progress",
    );
    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${task.id}/evidence`)
      .set("Authorization", `Bearer ${token}`)
      .field("expectedRevision", String(task.revision))
      .attach("file", Buffer.from("fake pdf"), "fake.pdf")
      .expect(422);
    const attached = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${task.id}/evidence`)
      .set("Authorization", `Bearer ${token}`)
      .field("expectedRevision", String(task.revision))
      .attach("file", Buffer.from(demoPdf()), "demo.pdf")
      .expect(201);
    const doc = attached.body.documents.at(-1);
    const downloaded = await request(app.getHttpServer())
      .get(`/api/v1/tasks/${task.id}/documents/${doc.id}/download`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(downloaded.headers["content-type"]).toContain("application/pdf");
    expect(downloaded.headers["content-disposition"]).toContain("attachment");
  });
  it("limits JSON payloads", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ data: "x".repeat(70_000) })
      .expect(413);
  });
  it("accepts the documented 200-company import with long UTF-8 fields", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/demo-session")
      .send({ userId: "rafael" })
      .expect(201);
    const companies = Array.from({ length: 200 }, (_, i) => ({
      name: "Á".repeat(100),
      city: "Á".repeat(80),
      cnpj: cnpjFromBase(`${String(88888000 + i)}0001`),
      regime: "Simples Nacional",
      ownerId: "julia",
    }));
    expect(Buffer.byteLength(JSON.stringify({ companies }))).toBeGreaterThan(
      64 * 1024,
    );
    const result = await request(app.getHttpServer())
      .post("/api/v1/companies/import")
      .set("Authorization", `Bearer ${session.body.token}`)
      .send({ companies })
      .expect(201);
    expect(result.body).toEqual({ created: 200, existing: 0 });
  });
  it("publishes its local OpenAPI contract", async () => {
    const result = await request(app.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    expect(result.body.paths["/api/v1/tasks/{id}/actions"]).toBeDefined();
  });
  it("revokes opaque sessions", async () => {
    const result = await request(app.getHttpServer())
      .post("/api/v1/demo-session")
      .send({ userId: "consulta" })
      .expect(201);
    await request(app.getHttpServer())
      .delete("/api/v1/session")
      .set("Authorization", `Bearer ${result.body.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${result.body.token}`)
      .expect(401);
  });
  it("refuses demo authentication in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(validateEnvironment).toThrow("produção");
    vi.stubEnv("NODE_ENV", "development");
  });
});
