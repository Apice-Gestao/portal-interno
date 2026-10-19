import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID, createHash, randomBytes } from "node:crypto";
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
import { RecoveryService } from "../apps/api/dist/security/recovery.service.js";
import { PERMISSIONS } from "../packages/domain/dist/index.js";
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL);
const runtimeUrl = new URL(process.env.DATABASE_URL);
for (const url of [migrationUrl, runtimeUrl]) {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(url.hostname),
    "Testes de destruição de fixtures só podem executar em PostgreSQL local.",
  );
  assert.equal(url.port, "55432", "Use somente a instância local dedicada.");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
}
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const database = `apice_test_${suffix}`;
const restoreDatabase = `apice_test_restore_${suffix}`;
const portableDatabase = `apice_test_portable_${suffix}`;
const privateDirectory = path.join(
  root,
  ".local",
  "verification",
  `database-${suffix}`,
);
const reportFile = path.join(
  root,
  ".local",
  "verification",
  "database-massive.json",
);
Object.assign(process.env, {
  NODE_ENV: "development",
  PORTAL_STORAGE: "postgres",
  PORTAL_TENANT_ID: "apice-demo",
  ENABLE_DEMO_SESSIONS: "true",
  ENABLE_LOCAL_TEST_LOGIN: "false",
  MAIL_DELIVERY: "local",
  MAIL_OUTBOX_DIR: path.join(privateDirectory, "mail"),
  PORTAL_PUBLIC_URL: "http://127.0.0.1:5173",
  MFA_SECRET: randomBytes(32).toString("hex"),
});
const created = [];
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
const adminPool = new pg.Pool({ connectionString: adminUrl.href });
let ownerPool, store, app, restorePool, portablePool;
const report = {
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  databaseEngine: "PostgreSQL",
  scope:
    "API, autorização, documentos, carga, RLS, identidade com MFA local e recuperação em bases descartáveis na instância dedicada; sem acesso à base principal.",
  checks: [],
  load: {},
  fixtures: {},
  cleanup: {},
};
async function check(name, fn) {
  const start = performance.now();
  try {
    await fn();
    report.checks.push({
      name,
      status: "passed",
      ms: Math.round(performance.now() - start),
    });
  } catch (error) {
    report.checks.push({
      name,
      status: "failed",
      ms: Math.round(performance.now() - start),
      failure: safeError(error),
    });
    throw error;
  }
  console.log(`✓ ${name}`);
}
function safeError(error) {
  let message = String(error?.message ?? error).split("\n")[0];
  for (const secret of [
    migrationUrl.href,
    runtimeUrl.href,
    decodeURIComponent(migrationUrl.password),
    decodeURIComponent(runtimeUrl.password),
    process.env.MFA_SECRET,
  ])
    if (secret) message = message.replaceAll(secret, "[redacted]");
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database URL]")
    .slice(0, 500);
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
const disposableName = (name) => {
  assert.ok([database, restoreDatabase, portableDatabase].includes(name));
  assert.match(name, /^apice_test_(?:(?:restore|portable)_)?[a-f0-9]{12}$/);
  return pg.escapeIdentifier(name);
};
const mailFiles = () =>
  existsSync(process.env.MAIL_OUTBOX_DIR)
    ? readdirSync(process.env.MAIL_OUTBOX_DIR)
    : [];
function newMail(before, email, field) {
  const messages = mailFiles()
    .filter((file) => !before.has(file))
    .map((file) =>
      JSON.parse(
        readFileSync(path.join(process.env.MAIL_OUTBOX_DIR, file), "utf8"),
      ),
    )
    .filter(
      (message) => message.to === email && typeof message[field] === "string",
    );
  assert.equal(
    messages.length,
    1,
    "Entrega local deve produzir exatamente uma mensagem para a conta de fixture.",
  );
  return messages[0][field];
}
async function beginLogin(http, username, password, email) {
  const before = new Set(mailFiles());
  const login = await request(http)
    .post("/api/v1/login")
    .send({ username, password })
    .expect(201);
  assert.equal(login.body.requiresSecondFactor, true);
  assert.equal("token" in login.body, false, "Senha isolada não emite sessão.");
  assert.equal(login.body.needsEmail, false);
  assert.match(login.body.challengeId, /^[A-Za-z0-9_-]{43}$/);
  return {
    challengeId: login.body.challengeId,
    code: newMail(before, email, "code"),
  };
}
async function finishLogin(
  http,
  username,
  password,
  email,
  rejectWrongCode = false,
) {
  const factor = await beginLogin(http, username, password, email);
  if (rejectWrongCode) {
    await request(http)
      .get("/api/v1/snapshot")
      .set("Authorization", `Bearer ${factor.challengeId}`)
      .expect(401);
    await request(http)
      .post("/api/v1/login/verify")
      .send({ ...factor, code: factor.code === "000000" ? "000001" : "000000" })
      .expect(401);
  }
  const verified = await request(http)
    .post("/api/v1/login/verify")
    .send(factor)
    .expect(201);
  assert.equal(verified.body.mode, "password");
  assert.ok(verified.body.token);
  await request(http).post("/api/v1/login/verify").send(factor).expect(401);
  report.fixtures.verifiedMfaLogins =
    (report.fixtures.verifiedMfaLogins ?? 0) + 1;
  return verified;
}
try {
  await adminPool.query(`CREATE DATABASE ${disposableName(database)}`);
  created.push(database);
  ownerPool = new pg.Pool({ connectionString: dbUrl(migrationUrl, database) });
  await check(
    "migrações repetidas preservam checksum e não duplicam estrutura",
    async () => {
      await migrateDatabase(ownerPool, runtimeUrl.username);
      await migrateDatabase(ownerPool, runtimeUrl.username);
      const applied = (
        await ownerPool.query(
          "SELECT name,checksum FROM portal_meta.migrations ORDER BY name",
        )
      ).rows;
      const expected = readdirSync(path.join(root, "supabase", "migrations"))
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .map((name) => ({
          name,
          checksum: sha(
            readFileSync(path.join(root, "supabase", "migrations", name)),
          ),
        }));
      assert.ok(
        expected.length >= 12,
        "A suíte exige as migrações atuais do projeto.",
      );
      assert.deepEqual(applied, expected);
      report.fixtures.migrations = applied.length;
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
    "geração automática enxerga todos os grupos com o papel de execução, só pelo ID",
    async () => {
      assert.deepEqual(await store.tenantIds(), ["apice-demo", "tenant-b"]);
      await assert.rejects(
        store.pool.query("SELECT name FROM portal.tenants"),
        /permission denied/,
      );
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
    "backend usa concessões persistidas: cargo não remove acessos e revogação vale na sessão antiga",
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
        "UPDATE portal.users SET payload=jsonb_set(jsonb_set(payload,'{role}','\"viewer\"'),'{permissions}',$1::jsonb) WHERE tenant_id='apice-demo' AND id='julia'",
        [JSON.stringify(["tasks.view", "tasks.create", "tasks.execute"])],
      );
      try {
        // O usuário autorizou qualquer cargo a receber qualquer concessão.
        await auth("post", "/api/v1/tasks")
          .send({ ...body, title: "Cargo de consulta com concessão explícita" })
          .expect(201);
        await ownerPool.query(
          "UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}',$1::jsonb) WHERE tenant_id='apice-demo' AND id='julia'",
          [JSON.stringify(["tasks.view"])],
        );
        await auth("post", "/api/v1/tasks").send(body).expect(403);
        const result = await auth("get", "/api/v1/snapshot").expect(200);
        assert.equal(result.body.actor.role, "viewer");
      } finally {
        await ownerPool.query(
          "UPDATE portal.users SET payload=$1::jsonb WHERE tenant_id='apice-demo' AND id='julia'",
          [
            JSON.stringify(
              state.users.find(
                (user) =>
                  user.tenantId === "apice-demo" && user.userId === "julia",
              ),
            ),
          ],
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
      mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
      const file = path.join(privateDirectory, "restore.dump");
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
        `CREATE DATABASE ${disposableName(restoreDatabase)}`,
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
        "password_reset_tokens",
        "email_mfa_challenges",
        "tv_devices",
        "workspace_settings",
        "company_change_proposals",
        "department_flows",
        "company_onboardings",
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
        `CREATE DATABASE ${disposableName(portableDatabase)}`,
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
        "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,email,email_verified) VALUES($1,$2,$3,$4,$5,true)",
        [
          "apice-demo",
          adminActor.userId,
          "identity-admin",
          hash,
          "admin.database@example.invalid",
        ],
      );
      app = await createApplication();
      await app.listen(0, "127.0.0.1");
      const http = app.getHttpServer();
      await request(http)
        .post("/api/v1/login")
        .send({ username: "identity-admin", password: "wrong" })
        .expect(401);
      const login = await finishLogin(
        http,
        "identity-admin",
        "IdentityTemporary2026!",
        "admin.database@example.invalid",
        true,
      );
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
        email: "operator.database@example.invalid",
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
      const opLogin = await finishLogin(
        http,
        inputs.username,
        inputs.password,
        inputs.email,
      );
      const opBearer = `Bearer ${opLogin.body.token}`;
      await request(http)
        .post("/api/v1/password")
        .set("Authorization", opBearer)
        .send({
          currentPassword: inputs.password,
          newPassword: "OperatorUpdated2026!",
        })
        .expect(201);
      const verifiedEmail = await ownerPool.query(
        "SELECT email_verified FROM portal.credentials WHERE tenant_id=$1 AND user_id=$2",
        ["apice-demo", created.body.userId],
      );
      assert.equal(verifiedEmail.rows[0].email_verified, true);
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
      const reset = await finishLogin(
        http,
        inputs.username,
        "ResetTemporary2026!",
        inputs.email,
      );
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
  await check(
    "MFA PostgreSQL: código errado, cinco tentativas, reenvio antecipado e ausência de segredos em claro no banco",
    async () => {
      const http = app.getHttpServer();
      const factor = await beginLogin(
        http,
        "identity-admin",
        "IdentityUpdated2026!",
        "admin.database@example.invalid",
      );
      const row = (
        await ownerPool.query(
          "SELECT token_hash,code_hash FROM portal.email_mfa_challenges WHERE token_hash=$1",
          [sha(factor.challengeId)],
        )
      ).rows[0];
      assert.match(row.token_hash, /^[a-f0-9]{64}$/);
      assert.match(row.code_hash, /^[a-f0-9]{64}$/);
      assert.notEqual(row.token_hash, factor.challengeId);
      assert.notEqual(row.code_hash, factor.code);
      await request(http)
        .post("/api/v1/login/resend")
        .send({ challengeId: factor.challengeId })
        .expect(429);
      const wrongCode = factor.code === "000000" ? "000001" : "000000";
      for (let attempt = 0; attempt < 5; attempt++)
        await request(http)
          .post("/api/v1/login/verify")
          .send({ ...factor, code: wrongCode })
          .expect(401);
      await request(http).post("/api/v1/login/verify").send(factor).expect(401);
      const consumed = (
        await ownerPool.query(
          "SELECT attempts,consumed_at FROM portal.email_mfa_challenges WHERE token_hash=$1",
          [sha(factor.challengeId)],
        )
      ).rows[0];
      assert.equal(consumed.attempts, 5);
      assert.ok(consumed.consumed_at);
    },
  );
  await check(
    "recuperação PostgreSQL: resposta neutra, link de uso único concorrente, sessão revogada e expiração",
    async () => {
      const http = app.getHttpServer();
      const email = "admin.database@example.invalid";
      const beforeLogin = await finishLogin(
        http,
        "identity-admin",
        "IdentityUpdated2026!",
        email,
      );
      const emptyOutbox = new Set(mailFiles());
      const absent = await request(http)
        .post("/api/v1/password/forgot")
        .send({ email: "absent.database@example.invalid" })
        .expect(201);
      await app.get(RecoveryService).waitForDeliveries();
      assert.deepEqual(new Set(mailFiles()), emptyOutbox);
      const before = new Set(mailFiles());
      const known = await request(http)
        .post("/api/v1/password/forgot")
        .send({ email })
        .expect(201);
      assert.deepEqual(known.body, absent.body);
      assert.deepEqual(known.body, { accepted: true });
      await app.get(RecoveryService).waitForDeliveries();
      const link = new URL(newMail(before, email, "link"));
      const token = new URLSearchParams(link.hash.split("?")[1]).get("token");
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      const resets = await Promise.all(
        Array.from({ length: 2 }, () =>
          request(http)
            .post("/api/v1/password/reset")
            .send({ token, newPassword: "RecoveryDatabaseUpdated2026!" }),
        ),
      );
      assert.equal(resets.filter((result) => result.status === 201).length, 1);
      assert.equal(resets.filter((result) => result.status === 400).length, 1);
      await request(http)
        .get("/api/v1/session")
        .set("Authorization", `Bearer ${beforeLogin.body.token}`)
        .expect(401);
      const recovered = await finishLogin(
        http,
        "identity-admin",
        "RecoveryDatabaseUpdated2026!",
        email,
      );
      assert.equal(recovered.body.mustChangePassword, false);
      const expiresBefore = new Set(mailFiles());
      await request(http)
        .post("/api/v1/password/forgot")
        .send({ email })
        .expect(201);
      await app.get(RecoveryService).waitForDeliveries();
      const expiredLink = new URL(newMail(expiresBefore, email, "link"));
      const expiredToken = new URLSearchParams(
        expiredLink.hash.split("?")[1],
      ).get("token");
      await ownerPool.query(
        "UPDATE portal.password_reset_tokens SET created_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute' WHERE token_hash=$1",
        [sha(expiredToken)],
      );
      await request(http)
        .post("/api/v1/password/reset")
        .send({ token: expiredToken, newPassword: "MustNotApplyDatabase2026!" })
        .expect(429);
      // Expiry is a separate assertion from the intentionally reached recovery rate limit.
      const expiryApp = await createApplication();
      try {
        await expiryApp.listen(0, "127.0.0.1");
        await request(expiryApp.getHttpServer())
          .post("/api/v1/password/reset")
          .send({
            token: expiredToken,
            newPassword: "MustNotApplyDatabase2026!",
          })
          .expect(400);
      } finally {
        await expiryApp.close();
      }
      await request(http)
        .get("/api/v1/session")
        .set("Authorization", `Bearer ${recovered.body.token}`)
        .expect(200);
    },
  );
  await check(
    "oito verificações MFA concorrentes em uma instância nova emitem uma única sessão",
    async () => {
      // Reinitializar o processo é outro cenário de ciclo de vida, sem modificar limites reais.
      await app.close();
      app = undefined;
      app = await createApplication();
      await app.listen(0, "127.0.0.1");
      const http = app.getHttpServer();
      const factor = await beginLogin(
        http,
        "identity-admin",
        "RecoveryDatabaseUpdated2026!",
        "admin.database@example.invalid",
      );
      const verified = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(http).post("/api/v1/login/verify").send(factor),
        ),
      );
      assert.equal(
        verified.filter((result) => result.status === 201).length,
        1,
      );
      assert.equal(
        verified.filter((result) => result.status === 401).length,
        7,
      );
      report.load.concurrentMfaVerifications = 8;
    },
  );
  report.finishedAt = new Date().toISOString();
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = safeError(error);
  console.error("Teste falhou:", safeError(error));
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  async function cleanup(name, operation) {
    try {
      await operation();
    } catch (error) {
      cleanupErrors.push({ name, failure: safeError(error) });
    }
  }
  await cleanup("API", async () => app?.close());
  await cleanup("adaptador", async () => store?.close());
  await cleanup("conexão proprietária", async () => ownerPool?.end());
  await cleanup("conexão de restauração", async () => restorePool?.end());
  await cleanup("conexão portátil", async () => portablePool?.end());
  for (const name of created) {
    await cleanup("base descartável", async () =>
      adminPool.query(`DROP DATABASE ${disposableName(name)} WITH (FORCE)`),
    );
  }
  await cleanup("verificação das bases descartáveis", async () => {
    const remaining = await adminPool.query(
      "SELECT count(*)::integer AS n FROM pg_database WHERE datname=ANY($1::text[])",
      [[database, restoreDatabase, portableDatabase]],
    );
    assert.equal(remaining.rows[0].n, 0);
    report.cleanup.temporaryDatabasesRemoved = created.length;
  });
  await cleanup("conexão administrativa", async () => adminPool.end());
  await cleanup("arquivos privados temporários", async () => {
    const resolved = path.resolve(privateDirectory);
    const expected = path.resolve(
      root,
      ".local",
      "verification",
      `database-${suffix}`,
    );
    assert.equal(resolved, expected);
    assert.equal(
      path.dirname(resolved),
      path.resolve(root, ".local", "verification"),
    );
    rmSync(resolved, { force: true, recursive: true });
    report.cleanup.privateFixturesRemoved = true;
  });
  report.cleanup.errors = cleanupErrors;
  if (cleanupErrors.length) {
    report.status = "failed";
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - new Date(report.startedAt).getTime();
  mkdirSync(path.dirname(reportFile), { recursive: true, mode: 0o700 });
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    `Resultado: ${report.status}; ${report.checks.filter((item) => item.status === "passed").length}/${report.checks.length} cenários PostgreSQL. Limpeza ${cleanupErrors.length ? "com falhas" : "confirmada"}; banco do portal preservado.`,
  );
}
