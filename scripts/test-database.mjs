import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import pg from "pg";
import request from "supertest";
import {
  createSeed,
  users,
  DEMO_NOW,
  demoPdf,
  cnpjFromBase,
} from "../packages/domain/dist/index.js";
import { migrateDatabase } from "../apps/api/dist/database/migrations.js";
import {
  PostgresPortalStore,
  seedDatabase,
} from "../apps/api/dist/database/postgres-store.js";
import {
  exportData,
  importData,
} from "../apps/api/dist/database/data-transfer.js";
import { createApplication } from "../apps/api/dist/bootstrap.js";
import { hashPassword } from "../apps/api/dist/security/password.js";
import { PERMISSIONS } from "../packages/domain/dist/index.js";
const root = fileURLToPath(new URL("../", import.meta.url));
process.env.ENABLE_DEMO_SESSIONS = "true";
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
process.env.ENABLE_LOCAL_TEST_LOGIN = "false";
const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL);
const runtimeUrl = new URL(process.env.DATABASE_URL);
assert.ok(
  ["127.0.0.1", "localhost"].includes(migrationUrl.hostname),
  "Testes de destruição de fixtures só podem executar em PostgreSQL local.",
);
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const database = `apice_test_${suffix}`;
const restoreDatabase = `apice_test_restore_${suffix}`;
const portableDatabase = `apice_test_portable_${suffix}`;
const created = [];
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
const adminPool = new pg.Pool({ connectionString: adminUrl.href });
let ownerPool, store, app, restorePool, portablePool;
const report = {
  startedAt: new Date().toISOString(),
  databaseEngine: "PostgreSQL",
  checks: [],
  load: {},
  fixtures: {},
};
async function check(name, fn) {
  const start = performance.now();
  await fn();
  report.checks.push({
    name,
    status: "passed",
    ms: Math.round(performance.now() - start),
  });
  console.log(`✓ ${name}`);
}
function dbUrl(url, name) {
  const value = new URL(url);
  value.pathname = `/${name}`;
  return value.href;
}
const actor = users[0],
  manager = users[2],
  adminActor = users[3];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  await adminPool.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  created.push(database);
  ownerPool = new pg.Pool({ connectionString: dbUrl(migrationUrl, database) });
  await check(
    "migrações repetidas preservam checksum e não duplicam estrutura",
    async () => {
      await migrateDatabase(ownerPool, runtimeUrl.username);
      await migrateDatabase(ownerPool, runtimeUrl.username);
      assert.equal(
        (
          await ownerPool.query(
            "SELECT count(*)::integer AS n FROM portal_meta.migrations",
          )
        ).rows[0].n,
        3,
      );
    },
  );
  const state = createSeed();
  const foreign = JSON.parse(JSON.stringify(state));
  for (const key of ["users", "companies", "templates", "tasks", "audit"]) {
    for (const row of foreign[key]) row.tenantId = "tenant-b";
    state[key].push(...foreign[key]);
  }
  state.users.push({ ...actor, userId: "outside-only", tenantId: "tenant-b" });
  await seedDatabase(ownerPool, state);
  await seedDatabase(ownerPool, state);
  store = new PostgresPortalStore(
    new pg.Pool({ connectionString: dbUrl(runtimeUrl, database), max: 12 }),
    () => DEMO_NOW,
  );
  await check(
    "conexão ociosa interrompida não derruba o processo e o pool reconecta",
    async () => {
      const recovery = await PostgresPortalStore.connect(
        dbUrl(runtimeUrl, database),
      );
      try {
        const connection = await recovery.pool.connect();
        const { rows } = await connection.query(
          "SELECT pg_backend_pid() AS pid",
        );
        connection.release();
        const interrupted = new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Evento de desconexão não foi observado.")),
            5000,
          );
          recovery.pool.once("error", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        await ownerPool.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid=$1 AND datname=$2",
          [rows[0].pid, database],
        );
        await interrupted;
        const snapshot = await recovery.snapshot(actor);
        assert.ok(snapshot.tasks.length > 0);
      } finally {
        await recovery.close();
      }
    },
  );
  await check(
    "dois tenants com IDs iguais permanecem isolados pelo adaptador e por RLS",
    async () => {
      const a = await store.snapshot(actor);
      const b = await store.snapshot({ ...actor, tenantId: "tenant-b" });
      assert.ok(a.tasks.every((t) => t.tenantId === "apice-demo"));
      assert.ok(b.tasks.every((t) => t.tenantId === "tenant-b"));
      assert.equal(a.tasks.length, b.tasks.length);
      const client = await store.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
          "apice-demo",
        ]);
        assert.equal(
          (
            await client.query(
              "SELECT * FROM portal.tasks WHERE tenant_id='tenant-b'",
            )
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await client.query(
              "SELECT DISTINCT tenant_id FROM portal.companies",
            )
          ).rowCount,
          1,
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    },
  );
  await check(
    "RLS nega escrita estrangeira e FK composta nega responsável de outro tenant",
    async () => {
      const client = await store.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
          "apice-demo",
        ]);
        await assert.rejects(
          client.query(
            "INSERT INTO portal.companies(tenant_id,id,payload) VALUES($1,$2,$3)",
            [
              "tenant-b",
              "illegal",
              { ...foreign.companies[0], id: "illegal", code: "9999" },
            ],
          ),
          (e) => e.code === "42501",
        );
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
          "apice-demo",
        ]);
        const task = {
          ...createSeed().tasks[0],
          id: "foreign-assignee",
          templateId: "avulsa",
          assigneeId: "outside-only",
        };
        delete task.documents;
        await assert.rejects(
          client.query(
            "INSERT INTO portal.tasks(tenant_id,id,payload) VALUES($1,$2,$3)",
            ["apice-demo", task.id, task],
          ),
          (e) => e.code === "23503",
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    },
  );
  await check(
    "audit e documentos não podem ser alterados/excluídos pelo papel da API",
    async () => {
      const client = await store.pool.connect();
      try {
        for (const sql of [
          "UPDATE portal.audit SET payload=payload",
          "DELETE FROM portal.audit",
          "UPDATE portal.documents SET content=content",
          "DELETE FROM portal.documents",
        ]) {
          await client.query("BEGIN");
          await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
            "apice-demo",
          ]);
          await assert.rejects(client.query(sql), (e) => e.code === "42501");
          await client.query("ROLLBACK");
        }
      } finally {
        client.release();
      }
      await assert.rejects(
        ownerPool.query(
          "UPDATE portal.audit SET payload=payload WHERE tenant_id='apice-demo'",
        ),
        (e) => e.code === "P0001",
      );
    },
  );
  process.env.NODE_ENV = "development";
  process.env.DEMO_AUTH = "true";
  process.env.PORTAL_STORAGE = "postgres";
  process.env.DATABASE_URL = dbUrl(runtimeUrl, database);
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  const server = app.getHttpServer();
  const tokens = {};
  for (const user of users) {
    const session = await request(server)
      .post("/api/v1/demo-session")
      .send({ userId: user.userId })
      .expect(201);
    tokens[user.userId] = session.body.token;
  }
  function auth(method, route, user = "julia") {
    return request(server)
      [method](route)
      .set("Authorization", `Bearer ${tokens[user]}`);
  }
  let reviewTask, plainTask;
  const body = {
    title: "Ciclo de auditoria",
    description: "Dados fictícios para validação isolada.",
    companyId: "company-1",
    department: "Fiscal",
    internalDue: "2026-10-15",
    legalDue: "2026-10-20",
    assigneeId: "julia",
    requiresReview: true,
  };
  const action = async (task, type, user = "julia", extra = {}) =>
    (
      await auth("post", `/api/v1/tasks/${task.id}/actions`, user)
        .send({ type, expectedRevision: task.revision, ...extra })
        .expect(201)
    ).body;
  await check(
    "API PostgreSQL: criar, iniciar, etapas, PDF/XML, versões, submissão e conferência independente",
    async () => {
      reviewTask = (await auth("post", "/api/v1/tasks").send(body).expect(201))
        .body;
      reviewTask = await action(reviewTask, "start");
      await auth("post", `/api/v1/tasks/${reviewTask.id}/actions`)
        .send({ type: "submit", expectedRevision: reviewTask.revision })
        .expect(422);
      for (const step of reviewTask.steps)
        reviewTask = await action(reviewTask, "step", "julia", {
          stepId: step.id,
          completed: true,
        });
      const xml = Buffer.from("<evidencia/>");
      reviewTask = (
        await auth("post", `/api/v1/tasks/${reviewTask.id}/evidence`)
          .field("expectedRevision", String(reviewTask.revision))
          .attach("file", xml, "evidencia.xml")
          .expect(201)
      ).body;
      assert.equal(reviewTask.documents.at(-1).hash, sha(xml));
      reviewTask = (
        await auth("post", `/api/v1/tasks/${reviewTask.id}/evidence`)
          .field("expectedRevision", String(reviewTask.revision))
          .attach("file", Buffer.from(demoPdf()), "evidencia.pdf")
          .expect(201)
      ).body;
      assert.deepEqual(
        reviewTask.documents.map((d) => d.version),
        [1, 2],
      );
      reviewTask = await action(reviewTask, "submit");
      await auth("post", `/api/v1/tasks/${reviewTask.id}/actions`)
        .send({ type: "approve", expectedRevision: reviewTask.revision })
        .expect(403);
      reviewTask = await action(reviewTask, "approve", "marina");
      assert.equal(reviewTask.status, "done");
    },
  );
  await check(
    "API PostgreSQL: reabrir, esperar/retomar, devolver, dispensa e redistribuir",
    async () => {
      const original = reviewTask.originalCompletedAt;
      reviewTask = await action(reviewTask, "reopen", "rafael", {
        reason: "Reabrir para conferir dados fictícios.",
      });
      assert.equal(reviewTask.originalCompletedAt, original);
      assert.ok(reviewTask.steps.every((s) => !s.completed));
      reviewTask = await action(reviewTask, "wait", "julia", {
        reason: "Aguardar a resposta fictícia do cliente.",
      });
      assert.equal(reviewTask.status, "waiting");
      reviewTask = await action(reviewTask, "resume");
      for (const step of reviewTask.steps)
        reviewTask = await action(reviewTask, "step", "julia", {
          stepId: step.id,
          completed: true,
        });
      reviewTask = await action(reviewTask, "submit");
      reviewTask = await action(reviewTask, "return", "marina", {
        reason: "Corrigir a evidência fictícia.",
      });
      assert.equal(reviewTask.status, "returned");
      reviewTask = await action(reviewTask, "start");
      reviewTask = await action(reviewTask, "request_dispense", "julia", {
        reason: "Sem movimentação fictícia no período.",
      });
      await auth("post", `/api/v1/tasks/${reviewTask.id}/actions`)
        .send({
          type: "dispense",
          expectedRevision: reviewTask.revision,
          reason: "Operador não tem esta autorização.",
        })
        .expect(403);
      reviewTask = await action(reviewTask, "dispense", "rafael", {
        reason: "Dispensa aprovada para o caso fictício.",
      });
      assert.equal(reviewTask.status, "dispensed");
      reviewTask = await action(reviewTask, "reopen", "rafael", {
        reason: "Retomar a tarefa para validar redistribuição.",
      });
      reviewTask = await action(reviewTask, "assign", "rafael", {
        assigneeId: "marina",
      });
      await auth("post", `/api/v1/tasks/${reviewTask.id}/actions`)
        .send({
          type: "step",
          expectedRevision: reviewTask.revision,
          stepId: reviewTask.steps[0].id,
          completed: true,
        })
        .expect(404);
      reviewTask = await action(reviewTask, "step", "marina", {
        stepId: reviewTask.steps[0].id,
        completed: true,
      });
    },
  );
  await check(
    "API PostgreSQL: conclusão direta exige todas as etapas/evidência; consulta não altera",
    async () => {
      plainTask = (
        await auth("post", "/api/v1/tasks")
          .send({ ...body, title: "Conclusão direta", requiresReview: false })
          .expect(201)
      ).body;
      await auth("post", "/api/v1/tasks", "consulta").send(body).expect(403);
      await auth("post", `/api/v1/tasks/${plainTask.id}/actions`, "consulta")
        .send({ type: "start", expectedRevision: plainTask.revision })
        .expect(403);
      plainTask = await action(plainTask, "start");
      await auth("post", `/api/v1/tasks/${plainTask.id}/actions`)
        .send({ type: "complete", expectedRevision: plainTask.revision })
        .expect(422);
      for (const step of plainTask.steps)
        plainTask = await action(plainTask, "step", "julia", {
          stepId: step.id,
          completed: true,
        });
      plainTask = (
        await auth("post", `/api/v1/tasks/${plainTask.id}/evidence`)
          .field("expectedRevision", String(plainTask.revision))
          .attach("file", Buffer.from(demoPdf()), "direta.pdf")
          .expect(201)
      ).body;
      plainTask = await action(plainTask, "complete");
      assert.equal(plainTask.status, "done");
    },
  );
  await check(
    "80 alterações concorrentes na mesma revisão: uma alteração e 79 conflitos",
    async () => {
      const task = (
        await auth("post", "/api/v1/tasks")
          .send({ ...body, title: "Concorrência isolada" })
          .expect(201)
      ).body;
      const results = await Promise.all(
        Array.from({ length: 80 }, () =>
          auth("post", `/api/v1/tasks/${task.id}/actions`).send({
            type: "start",
            expectedRevision: task.revision,
          }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 79);
      const persisted = (await store.snapshot(manager)).tasks.find(
        (t) => t.id === task.id,
      );
      assert.equal(persisted.revision, 2);
      report.load.concurrentCommands = 80;
    },
  );
  await check(
    "erro após atualização SQL desfaz tarefa, evidência e audit na transação",
    async () => {
      const task = (await store.snapshot(manager)).tasks.find(
        (t) => t.title === "Concorrência isolada",
      );
      const before = await store.snapshot(manager);
      await assert.rejects(
        store.run(
          actor,
          (engine, resolved) =>
            engine.attach(resolved, task.id, task.revision, {
              name: "teste.xml",
              kind: "XML",
              bytes: 99,
              hash: sha(Buffer.from("<a/>")),
            }),
          Buffer.from("<a/>"),
        ),
      );
      const after = await store.snapshot(manager);
      assert.deepEqual(
        after.tasks.find((t) => t.id === task.id),
        task,
      );
      assert.equal(after.audit.length, before.audit.length);
    },
  );
  await check(
    "importação inválida não grava parcialmente e duplicados retornam conflito",
    async () => {
      const valid = {
        name: "Teste de atomicidade",
        cnpj: cnpjFromBase("888888880001"),
        regime: "Simples Nacional",
        city: "Cidade / SP",
        ownerId: "julia",
      };
      const before = await store.snapshot(manager);
      await assert.rejects(
        store.run(manager, (e, a) =>
          e.importCompanies(a, [
            valid,
            {
              ...valid,
              cnpj: cnpjFromBase("888888890001"),
              ownerId: "não-existe",
            },
          ]),
        ),
      );
      assert.equal(
        (await store.snapshot(manager)).companies.length,
        before.companies.length,
      );
      await auth("post", "/api/v1/companies", "rafael").send(valid).expect(201);
      await auth("post", "/api/v1/companies", "rafael").send(valid).expect(409);
      await auth("post", "/api/v1/companies", "julia")
        .send({ ...valid, cnpj: cnpjFromBase("888888870001") })
        .expect(403);
      await auth("post", "/api/v1/companies", "rafael")
        .send({ ...valid, cnpj: "00.000.000/0000-00" })
        .expect(400);
    },
  );
  await check(
    "identidade/perfil forjado, arquivo inválido e download fora do escopo são rejeitados",
    async () => {
      await request(server)
        .get("/api/v1/snapshot")
        .set("Authorization", "Bearer fake")
        .expect(401);
      const snap = await auth("get", "/api/v1/snapshot")
        .set("X-Role", "admin")
        .set("X-Tenant-Id", "tenant-b")
        .expect(200);
      assert.ok(snap.body.tasks.every((t) => t.tenantId === "apice-demo"));
      await auth("post", `/api/v1/tasks/${reviewTask.id}/evidence`, "marina")
        .field("expectedRevision", String(reviewTask.revision))
        .attach("file", Buffer.from("não é PDF"), "ruim.pdf")
        .expect(422);
      const inaccessible = state.tasks.find((t) => t.department === "Contábil");
      await auth(
        "get",
        `/api/v1/tasks/${inaccessible.id}/documents/any/download`,
      ).expect(404);
      await auth("post", "/api/v1/tasks")
        .send({ ...body, role: "admin" })
        .expect(400);
    },
  );
  await check(
    "nomes UTF-8, limite de arquivo e quota documental preservam consistência",
    async () => {
      let task = (await store.snapshot(manager)).tasks.find(
        (t) => t.title === "Concorrência isolada",
      );
      const uploaded = await auth("post", `/api/v1/tasks/${task.id}/evidence`)
        .field("expectedRevision", String(task.revision))
        .attach("file", Buffer.from(demoPdf()), "relatório-é.pdf")
        .expect(201);
      task = uploaded.body;
      assert.equal(task.documents.at(-1).name, "relatório-é.pdf");
      const before = await store.snapshot(manager);
      await auth("post", `/api/v1/tasks/${task.id}/evidence`)
        .field("expectedRevision", String(task.revision))
        .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), "grande.pdf")
        .expect(413);
      const previous = process.env.MAX_TENANT_DOCUMENT_BYTES;
      process.env.MAX_TENANT_DOCUMENT_BYTES = "1";
      try {
        await auth("post", `/api/v1/tasks/${task.id}/evidence`)
          .field("expectedRevision", String(task.revision))
          .attach("file", Buffer.from(demoPdf()), "quota.pdf")
          .expect(413);
      } finally {
        if (previous === undefined)
          delete process.env.MAX_TENANT_DOCUMENT_BYTES;
        else process.env.MAX_TENANT_DOCUMENT_BYTES = previous;
      }
      assert.deepEqual(
        (await store.snapshot(manager)).tasks.find((t) => t.id === task.id),
        before.tasks.find((t) => t.id === task.id),
      );
    },
  );
  await check(
    "backend revalida o papel persistido mesmo com sessão antiga ou ator forjado",
    async () => {
      await assert.rejects(
        store.run({ ...actor, role: "admin" }, (engine, resolved) =>
          engine.addCompany(resolved, {
            name: "Sem privilégio",
            cnpj: cnpjFromBase("777777770001"),
            regime: "Simples Nacional",
            city: "Cidade / SP",
            ownerId: "julia",
          }),
        ),
        (e) => e.code === "FORBIDDEN",
      );
      await ownerPool.query(
        "UPDATE portal.users SET payload=jsonb_set(payload,'{role}','\"viewer\"') WHERE tenant_id='apice-demo' AND id='julia'",
      );
      try {
        await auth("post", "/api/v1/tasks").send(body).expect(403);
        const result = await auth("get", "/api/v1/snapshot").expect(200);
        assert.equal(result.body.actor.role, "viewer");
      } finally {
        await ownerPool.query(
          "UPDATE portal.users SET payload=jsonb_set(payload,'{role}','\"operator\"') WHERE tenant_id='apice-demo' AND id='julia'",
        );
      }
    },
  );
  await check(
    "reiniciar API conserva tarefas, versões, conteúdo/hash e auditoria",
    async () => {
      const before = await store.snapshot(adminActor);
      await app.close();
      app = undefined;
      app = await createApplication();
      await app.listen(0, "127.0.0.1");
      const session = await request(app.getHttpServer())
        .post("/api/v1/demo-session")
        .send({ userId: "helena" })
        .expect(201);
      const after = await request(app.getHttpServer())
        .get("/api/v1/snapshot")
        .set("Authorization", `Bearer ${session.body.token}`)
        .expect(200);
      assert.deepEqual(after.body.tasks, before.tasks);
      assert.ok(after.body.audit.length > before.audit.length);
      const doc = plainTask.documents[0];
      const downloaded = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${plainTask.id}/documents/${doc.id}/download`)
        .set("Authorization", `Bearer ${session.body.token}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      assert.equal(sha(downloaded.body), doc.hash);
      assert.ok(
        (await store.snapshot(adminActor)).audit.some(
          (e) => e.action === "Documento baixado",
        ),
      );
    },
  );
  await check(
    "500 empresas × 8 modelos: 4.000 tarefas e 12 gerações concorrentes idempotentes",
    async () => {
      const base = createSeed();
      const loadState = {
        users: base.users.map((u) => ({ ...u, tenantId: "load-tenant" })),
        companies: [],
        templates: [],
        tasks: [],
        audit: [],
      };
      loadState.companies = Array.from({ length: 500 }, (_, i) => ({
        ...base.companies[0],
        tenantId: "load-tenant",
        id: `load-company-${i}`,
        code: String(i + 101).padStart(4, "0"),
        cnpj: cnpjFromBase(`${String(70000000 + i)}0001`),
      }));
      loadState.templates = Array.from({ length: 8 }, (_, i) => ({
        ...base.templates[0],
        tenantId: "load-tenant",
        id: `load-model-${i}`,
        title: `Obrigação fictícia ${i + 1}`,
        regime: "Todos",
      }));
      await seedDatabase(ownerPool, loadState);
      const loadActor = { ...manager, tenantId: "load-tenant" };
      const start = performance.now();
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          store.run(loadActor, (e, a) => e.generate(a, "2026-09", "Fiscal")),
        ),
      );
      assert.equal(
        results.reduce((n, r) => n + r.created, 0),
        4000,
      );
      assert.ok(results.every((r) => r.created === 0 || r.created === 4000));
      const snapshot = await store.snapshot(loadActor);
      assert.equal(snapshot.tasks.length, 4000);
      assert.equal(
        new Set(
          snapshot.tasks.map(
            (t) => `${t.companyId}|${t.templateId}|${t.competence}`,
          ),
        ).size,
        4000,
      );
      report.load = {
        ...report.load,
        companies: 500,
        models: 8,
        tasks: 4000,
        concurrentGenerations: 12,
        generationBatchMs: Math.round(performance.now() - start),
        snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
      };
      const latencies = await Promise.all(
        Array.from({ length: 40 }, async () => {
          const began = performance.now();
          const result = await store.snapshot(loadActor);
          assert.equal(result.tasks.length, 4000);
          return performance.now() - began;
        }),
      );
      latencies.sort((a, b) => a - b);
      report.load.concurrentReaders = 40;
      report.load.snapshotP50Ms = Math.round(
        latencies[Math.floor(latencies.length * 0.5)],
      );
      report.load.snapshotP95Ms = Math.round(
        latencies[Math.floor(latencies.length * 0.95)],
      );
    },
  );
  await check(
    "unicidade da recorrência também bloqueia duplicação por SQL direto",
    async () => {
      const result = await ownerPool.query(
        "SELECT payload FROM portal.tasks WHERE tenant_id='load-tenant' LIMIT 1",
      );
      const payload = { ...result.rows[0].payload, id: "forced-duplicate" };
      await assert.rejects(
        ownerPool.query(
          "INSERT INTO portal.tasks(tenant_id,id,payload) VALUES($1,$2,$3)",
          ["load-tenant", payload.id, payload],
        ),
        (e) => e.code === "23505",
      );
    },
  );
  await check(
    "backup e restauração reais preservam registros e todos os hashes de evidências",
    async () => {
      const credential = await hashPassword("FixtureDatabase2026!");
      await ownerPool.query(
        "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,active) VALUES($1,$2,$3,$4,false)",
        ["apice-demo", "consulta", "fixture-consulta", credential],
      );
      const dir = path.join(root, ".local", "tests");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `restore-${suffix}.dump`);
      const bin =
        process.env.PG_BIN_DIR ?? "C:/Program Files/PostgreSQL/18/bin";
      const env = {
        ...process.env,
        PGPASSWORD: decodeURIComponent(migrationUrl.password),
      };
      const run = (name, args) => {
        const result = spawnSync(
          path.join(
            bin,
            `${name}${process.platform === "win32" ? ".exe" : ""}`,
          ),
          args,
          { windowsHide: true, encoding: "utf8", env },
        );
        assert.equal(result.status, 0, `${name} falhou: ${result.stderr}`);
      };
      run("pg_dump", [
        "-h",
        migrationUrl.hostname,
        "-p",
        migrationUrl.port,
        "-U",
        migrationUrl.username,
        "-d",
        database,
        "-Fc",
        "--no-owner",
        "--no-acl",
        "-f",
        file,
      ]);
      await adminPool.query(
        `CREATE DATABASE ${pg.escapeIdentifier(restoreDatabase)}`,
      );
      created.push(restoreDatabase);
      run("pg_restore", [
        "-h",
        migrationUrl.hostname,
        "-p",
        migrationUrl.port,
        "-U",
        migrationUrl.username,
        "-d",
        restoreDatabase,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        file,
      ]);
      restorePool = new pg.Pool({
        connectionString: dbUrl(migrationUrl, restoreDatabase),
      });
      await migrateDatabase(restorePool, runtimeUrl.username);
      for (const table of [
        "users",
        "companies",
        "templates",
        "tasks",
        "documents",
        "audit",
        "credentials",
      ])
        assert.equal(
          (
            await restorePool.query(
              `SELECT count(*)::integer AS n FROM portal.${table}`,
            )
          ).rows[0].n,
          (
            await ownerPool.query(
              `SELECT count(*)::integer AS n FROM portal.${table}`,
            )
          ).rows[0].n,
        );
      const docs = await restorePool.query(
        "SELECT payload,content FROM portal.documents",
      );
      for (const doc of docs.rows)
        assert.equal(sha(doc.content), doc.payload.hash);
      report.fixtures.restoredDocuments = docs.rowCount;
      report.fixtures.restoredTasks = (
        await restorePool.query(
          "SELECT count(*)::integer AS n FROM portal.tasks",
        )
      ).rows[0].n;
    },
  );
  await check(
    "exportação portátil valida hashes, preserva tenants/IDs repetidos e importa atomicamente",
    async () => {
      await adminPool.query(
        `CREATE DATABASE ${pg.escapeIdentifier(portableDatabase)}`,
      );
      created.push(portableDatabase);
      portablePool = new pg.Pool({
        connectionString: dbUrl(migrationUrl, portableDatabase),
      });
      await migrateDatabase(portablePool, runtimeUrl.username);
      await ownerPool.query(
        "UPDATE portal.tenants SET name='Escritório fictício de teste' WHERE id='tenant-b'",
      );
      await ownerPool.query(
        "INSERT INTO portal.tenants(id,name) VALUES('empty-tenant','Escritório sem usuários')",
      );
      const bundle = await exportData(ownerPool);
      const broken = structuredClone(bundle);
      broken.documents[0].content = Buffer.from(
        "evidência corrompida",
      ).toString("base64");
      await assert.rejects(importData(portablePool, broken), /hash inválido/);
      assert.equal(
        (
          await portablePool.query(
            "SELECT count(*)::integer AS n FROM portal.users",
          )
        ).rows[0].n,
        0,
      );
      const imports = await Promise.allSettled([
        importData(portablePool, bundle),
        importData(portablePool, bundle),
      ]);
      assert.equal(imports.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(imports.filter((r) => r.status === "rejected").length, 1);
      const result = await exportData(portablePool);
      assert.deepEqual(result.tenants, bundle.tenants);
      assert.deepEqual(result.credentials, bundle.credentials);
      for (const key of ["users", "companies", "templates", "tasks", "audit"])
        assert.equal(result.state[key].length, bundle.state[key].length);
      assert.deepEqual(result.documents, bundle.documents);
      report.fixtures.portableDocuments = result.documents.length;
      report.fixtures.portableTasks = result.state.tasks.length;
    },
  );
  await app.close();
  app = undefined;
  await check(
    "rate limit canônico, barra final e caixa alternativa compartilham o mesmo limite",
    async () => {
      app = await createApplication();
      await app.listen(0, "127.0.0.1");
      const http = app.getHttpServer();
      for (let i = 0; i < 30; i++)
        await request(http)
          .post("/api/v1/demo-session")
          .send({ userId: "consulta" })
          .expect(201);
      for (const route of [
        "/api/v1/demo-session",
        "/api/v1/demo-session/",
        "/API/V1/DEMO-SESSION",
      ])
        await request(http)
          .post(route)
          .send({ userId: "consulta" })
          .expect(429);
      const last = (await store.snapshot(adminActor)).audit.filter(
        (e) => e.category === "security",
      );
      assert.ok(last.some((e) => e.ip));
      assert.ok(last.some((e) => e.action === "Sessão demonstrativa iniciada"));
    },
  );
  await check(
    "identidade PostgreSQL: login, senha inicial, concessão a operador, rollback, revogação e último gestor",
    async () => {
      await app.close();
      app = undefined;
      process.env.ENABLE_DEMO_SESSIONS = "false";
      const hash = await hashPassword("IdentityTemporary2026!");
      await ownerPool.query(
        "UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}',$3::jsonb) WHERE tenant_id=$1 AND id=$2",
        ["apice-demo", adminActor.userId, JSON.stringify(PERMISSIONS)],
      );
      await ownerPool.query(
        "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash) VALUES($1,$2,$3,$4)",
        ["apice-demo", adminActor.userId, "identity-admin", hash],
      );
      app = await createApplication();
      await app.listen(0, "127.0.0.1");
      const http = app.getHttpServer();
      await request(http)
        .post("/api/v1/login")
        .send({ username: "identity-admin", password: "wrong" })
        .expect(401);
      const login = await request(http)
        .post("/api/v1/login")
        .send({
          username: "identity-admin",
          password: "IdentityTemporary2026!",
        })
        .expect(201);
      const bearer = `Bearer ${login.body.token}`;
      await request(http)
        .get("/api/v1/snapshot")
        .set("Authorization", bearer)
        .expect(403);
      await request(http)
        .post("/api/v1/password")
        .set("Authorization", bearer)
        .send({
          currentPassword: "IdentityTemporary2026!",
          newPassword: "IdentityUpdated2026!",
        })
        .expect(201);
      const inputs = {
        name: "Operador com acessos concedidos",
        username: "operator-granted",
        password: "OperatorTemporary2026!",
        role: "operator",
        departments: ["Fiscal"],
        permissions: [...PERMISSIONS],
      };
      const created = await request(http)
        .post("/api/v1/users")
        .set("Authorization", bearer)
        .send(inputs)
        .expect(201);
      assert.equal(created.body.role, "operator");
      assert.ok(created.body.permissions.includes("users.manage"));
      const count = (
        await ownerPool.query("SELECT count(*)::integer AS n FROM portal.users")
      ).rows[0].n;
      await request(http)
        .post("/api/v1/users")
        .set("Authorization", bearer)
        .send(inputs)
        .expect(409);
      assert.equal(
        (
          await ownerPool.query(
            "SELECT count(*)::integer AS n FROM portal.users",
          )
        ).rows[0].n,
        count,
      );
      await request(http)
        .post("/api/v1/users")
        .set("Authorization", bearer)
        .send({
          ...inputs,
          username: "invalid-account",
          permissions: ["tasks.execute"],
        })
        .expect(400);
      const opLogin = await request(http)
        .post("/api/v1/login")
        .send({ username: inputs.username, password: inputs.password })
        .expect(201);
      const opBearer = `Bearer ${opLogin.body.token}`;
      await request(http)
        .post("/api/v1/password")
        .set("Authorization", opBearer)
        .send({
          currentPassword: inputs.password,
          newPassword: "OperatorUpdated2026!",
        })
        .expect(201);
      await request(http)
        .get("/api/v1/users")
        .set("Authorization", opBearer)
        .expect(200);
      await request(http)
        .patch(`/api/v1/users/${created.body.userId}`)
        .set("Authorization", bearer)
        .send({ permissions: ["tasks.view"] })
        .expect(200);
      await request(http)
        .get("/api/v1/users")
        .set("Authorization", opBearer)
        .expect(403);
      await request(http)
        .patch(`/api/v1/users/${adminActor.userId}`)
        .set("Authorization", bearer)
        .send({ active: false })
        .expect(409);
      await request(http)
        .patch(`/api/v1/users/${created.body.userId}`)
        .set("Authorization", bearer)
        .send({ password: "ResetTemporary2026!" })
        .expect(200);
      await request(http)
        .get("/api/v1/snapshot")
        .set("Authorization", opBearer)
        .expect(401);
      const reset = await request(http)
        .post("/api/v1/login")
        .send({ username: inputs.username, password: "ResetTemporary2026!" })
        .expect(201);
      await request(http)
        .patch(`/api/v1/users/${created.body.userId}`)
        .set("Authorization", bearer)
        .send({ active: false })
        .expect(200);
      await request(http)
        .get("/api/v1/session")
        .set("Authorization", `Bearer ${reset.body.token}`)
        .expect(401);
      await request(http)
        .post("/api/v1/demo-session")
        .send({ userId: "helena" })
        .expect(403);
    },
  );
  report.finishedAt = new Date().toISOString();
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.message;
  console.error("Teste falhou:", error.message);
  process.exitCode = 1;
} finally {
  await app?.close();
  await store?.close();
  await ownerPool?.end();
  await restorePool?.end();
  await portablePool?.end();
  for (const name of created) {
    assert.ok([database, restoreDatabase, portableDatabase].includes(name));
    await adminPool.query(
      `DROP DATABASE ${pg.escapeIdentifier(name)} WITH (FORCE)`,
    );
  }
  await adminPool.end();
  mkdirSync(path.join(root, "docs", "auditoria"), { recursive: true });
  writeFileSync(
    path.join(root, "docs", "auditoria", "testes-postgres.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Resultado: ${report.status}; ${report.checks.length} cenários PostgreSQL. Instâncias de teste removidas; banco do portal preservado.`,
  );
}
