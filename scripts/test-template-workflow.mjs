import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import {
  createSeed,
  DEMO_NOW,
  demoPdf,
  getTemplateWorkflow,
  PERMISSIONS,
} from "../packages/domain/dist/index.js";
import { createApplication } from "../apps/api/dist/bootstrap.js";
import { migrateDatabase } from "../apps/api/dist/database/migrations.js";
import {
  PostgresPortalStore,
  seedDatabase,
} from "../apps/api/dist/database/postgres-store.js";

// This verifies model workflows, API permissions and persistence with isolated
// synthetic demo sessions. It does not verify password login, email or MFA.
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
const runtimeUrl = new URL(process.env.DATABASE_URL ?? "");
for (const url of [migrationUrl, runtimeUrl]) {
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(
    url.port,
    "55432",
    "Use somente a instância local dedicada do portal.",
  );
}
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const database = `apice_workflow_${suffix}`;
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
function temporaryUrl(original) {
  const value = new URL(original);
  value.pathname = `/${database}`;
  return value.href;
}
process.env.NODE_ENV = "development";
process.env.PORTAL_STORAGE = "postgres";
process.env.DATABASE_URL = temporaryUrl(runtimeUrl);
process.env.PORTAL_TENANT_ID = "apice-demo";
process.env.ENABLE_DEMO_SESSIONS = "true";
process.env.ENABLE_LOCAL_TEST_LOGIN = "false";
process.env.MAIL_DELIVERY = "disabled";

const report = {
  startedAt: new Date().toISOString(),
  scope: "Fluxos de modelos: PostgreSQL/API isolados; não valida login/MFA.",
  checks: [],
};
const adminPool = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
let created = false;
let ownerPool;
let store;
let app;
let http;
let managerToken;
let readerToken;
let adminToken;
let model;
const state = createSeed();
const manager = {
  ...state.users.find((actor) => actor.userId === "julia"),
  permissions: [
    "templates.view",
    "templates.manage",
    "tasks.view",
    "tasks.execute",
    "tasks.attach",
    "tasks.review",
  ],
};
const reader = {
  ...state.users.find((actor) => actor.userId === "marina"),
  permissions: ["templates.view", "tasks.view"],
};
const administrator = {
  ...state.users.find((actor) => actor.userId === "helena"),
  permissions: [...PERMISSIONS],
};
state.users = state.users.map(
  (user) =>
    [manager, reader, administrator].find(
      (actor) => actor.userId === user.userId,
    ) ?? user,
);
const foreign = structuredClone(state);
for (const collection of [
  "users",
  "companies",
  "templates",
  "tasks",
  "audit",
]) {
  for (const record of foreign[collection])
    record.tenantId = "tenant-workflow-b";
  state[collection].push(...foreign[collection]);
}
const firstFlow = [
  { id: "collect", title: "Reunir documentos" },
  { id: "reconcile", title: "Conciliar lançamentos" },
  { id: "report", title: "Preparar relatório" },
];
const input = {
  title: "Conciliação configurável",
  description: "Modelo fictício para verificação isolada.",
  department: "Fiscal",
  regime: "Todos",
  internalDay: 10,
  legalDay: 20,
  requiresReview: true,
  requiredDocument: "Relatório de conciliação",
  workflowSteps: firstFlow,
};
function updateInput(current, patch = {}) {
  return {
    title: current.title,
    description: current.description,
    department: current.department,
    regime: current.regime,
    internalDay: current.internalDay,
    legalDay: current.legalDay,
    requiresReview: current.requiresReview,
    requiredDocument: current.requiredDocument,
    workflowSteps: getTemplateWorkflow(current),
    expectedVersion: current.version,
    ...patch,
  };
}
async function check(name, action) {
  await action();
  report.checks.push({ name, status: "passed" });
  console.log(`✓ ${name}`);
}
function api(method, endpoint, token, body) {
  let call = request(http)
    [method](`/api/v1${endpoint}`)
    .set("Host", "127.0.0.1");
  if (token) call = call.set("Authorization", `Bearer ${token}`);
  if (body) call = call.send(body);
  return call;
}
async function tasksFor(current, competence) {
  const snapshot = await store.snapshot(administrator);
  return snapshot.tasks.filter(
    (task) =>
      task.templateId === current.id &&
      (!competence || task.competence === competence),
  );
}

try {
  await adminPool.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  created = true;
  ownerPool = new pg.Pool({
    connectionString: temporaryUrl(migrationUrl),
    max: 1,
  });
  await check(
    "migrações e seed compatíveis com modelos legados em base temporária",
    async () => {
      await migrateDatabase(ownerPool, runtimeUrl.username);
      await migrateDatabase(ownerPool, runtimeUrl.username);
      await seedDatabase(ownerPool, state);
      await seedDatabase(ownerPool, state);
      store = new PostgresPortalStore(
        new pg.Pool({ connectionString: temporaryUrl(runtimeUrl), max: 4 }),
        () => DEMO_NOW,
      );
      const snapshot = await store.snapshot(administrator);
      const legacy = snapshot.templates.find(
        (template) => template.id === "pgdas",
      );
      assert.equal(legacy.workflowSteps, undefined);
      assert.equal(getTemplateWorkflow(legacy).length, 3);
    },
  );

  app = await createApplication();
  http = app.getHttpServer();
  async function demoSession(userId) {
    const response = await api("post", "/demo-session", undefined, {
      userId,
    }).expect(201);
    assert.equal(response.body.mode, "demo");
    assert.ok(response.body.token);
    return response.body.token;
  }
  managerToken = await demoSession(manager.userId);
  readerToken = await demoSession(reader.userId);
  adminToken = await demoSession(administrator.userId);

  await check(
    "API exige sessão e permite operador com concessão criar e editar fluxo",
    async () => {
      await api("post", "/task-templates", undefined, input).expect(401);
      const createdModel = await api(
        "post",
        "/task-templates",
        managerToken,
        input,
      ).expect(201);
      model = createdModel.body;
      assert.equal(model.version, 1);
      assert.equal(model.tenantId, manager.tenantId);
      assert.deepEqual(model.workflowSteps, firstFlow);
      const saved = await api(
        "patch",
        `/task-templates/${model.id}`,
        managerToken,
        updateInput(model, {
          workflowSteps: [firstFlow[2], firstFlow[0]],
        }),
      ).expect(200);
      model = saved.body;
      assert.equal(model.version, 2);
      assert.deepEqual(model.workflowSteps, [firstFlow[2], firstFlow[0]]);
    },
  );

  await check(
    "API rejeita falta de permissão e dados inválidos sem gravações parciais",
    async () => {
      const before = await store.snapshot(administrator);
      await api("post", "/task-templates", readerToken, input).expect(403);
      await api(
        "patch",
        `/task-templates/${model.id}`,
        readerToken,
        updateInput(model),
      ).expect(403);
      for (const patch of [
        { workflowSteps: [] },
        { workflowSteps: [firstFlow[0], firstFlow[0]] },
        { workflowSteps: [{ ...firstFlow[0], completed: true }] },
        { tenantId: "tenant-workflow-b" },
        { version: 999 },
        { expectedVersion: 0 },
      ])
        await api(
          "patch",
          `/task-templates/${model.id}`,
          managerToken,
          updateInput(model, patch),
        ).expect(400);
      await api(
        "patch",
        `/task-templates/${model.id}`,
        adminToken,
        updateInput(model, { department: "Contábil" }),
      ).expect(422);
      assert.deepEqual(await store.snapshot(administrator), before);
    },
  );

  await check(
    "duas gravações concorrentes retornam um sucesso e um conflito 409",
    async () => {
      const before = await store.snapshot(administrator);
      const responses = await Promise.all([
        api(
          "patch",
          `/task-templates/${model.id}`,
          managerToken,
          updateInput(model, { title: "Versão concorrente A" }),
        ),
        api(
          "patch",
          `/task-templates/${model.id}`,
          adminToken,
          updateInput(model, { title: "Versão concorrente B" }),
        ),
      ]);
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 409],
      );
      model = responses.find((response) => response.status === 200).body;
      const after = await store.snapshot(administrator);
      assert.equal(model.version, 3);
      assert.deepEqual(
        after.templates.find((template) => template.id === model.id),
        model,
      );
      assert.equal(after.audit.length, before.audit.length + 1);
      assert.deepEqual(after.tasks, before.tasks);
      const stale = await api(
        "patch",
        `/task-templates/${model.id}`,
        adminToken,
        updateInput(model, { expectedVersion: 2 }),
      ).expect(409);
      assert.equal(stale.body.code, "CONFLICT");
      assert.deepEqual(await store.snapshot(administrator), after);
    },
  );

  let originalTasks;
  let updateAudit;
  await check(
    "geração congela fluxo e versão; edição aplica-se somente às novas tarefas",
    async () => {
      await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Fiscal",
      }).expect(201);
      originalTasks = await tasksFor(model, "2026-10");
      assert.equal(originalTasks.length, 12);
      assert.ok(
        originalTasks.every(
          (task) =>
            task.templateVersion === model.version &&
            task.steps.every((step) => !step.completed),
        ),
      );
      assert.deepEqual(
        originalTasks[0].steps.map(({ id, title }) => ({ id, title })),
        model.workflowSteps,
      );
      const oldModel = structuredClone(model);
      const changed = await api(
        "patch",
        `/task-templates/${model.id}`,
        adminToken,
        updateInput(model, {
          workflowSteps: [{ id: "validate", title: "Validar conciliação" }],
        }),
      ).expect(200);
      model = changed.body;
      updateAudit = (await store.snapshot(administrator)).audit.find(
        (event) =>
          event.templateId === model.id &&
          event.afterTemplate?.version === model.version,
      );
      assert.deepEqual(updateAudit.beforeTemplate, oldModel);
      assert.deepEqual(updateAudit.afterTemplate, model);
      const repeated = await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Fiscal",
      }).expect(201);
      assert.equal(repeated.body.created, 0);
      assert.deepEqual(await tasksFor(model, "2026-10"), originalTasks);
      await api("post", "/generation", adminToken, {
        competence: "2026-11",
        department: "Fiscal",
      }).expect(201);
      const next = await tasksFor(model, "2026-11");
      assert.equal(next.length, originalTasks.length);
      assert.ok(next.every((task) => task.templateVersion === model.version));
      assert.deepEqual(next[0].steps, [
        { id: "validate", title: "Validar conciliação", completed: false },
      ]);
    },
  );

  await check(
    "isolamento por tenant e departamento preserva modelo de mesmo ID",
    async () => {
      const foreignActor = { ...administrator, tenantId: "tenant-workflow-b" };
      const foreignModel = (await store.snapshot(foreignActor)).templates.find(
        (template) => template.id === "pgdas",
      );
      const originalModel = (
        await store.snapshot(administrator)
      ).templates.find((template) => template.id === "pgdas");
      await store.run(foreignActor, (engine, actor) =>
        engine.updateTemplate(
          actor,
          foreignModel.id,
          updateInput(foreignModel, { workflowSteps: [firstFlow[1]] }),
        ),
      );
      assert.deepEqual(
        (await store.snapshot(administrator)).templates.find(
          (template) => template.id === "pgdas",
        ),
        originalModel,
      );
      await assert.rejects(
        store.run(manager, (engine, actor) =>
          engine.updateTemplate(
            actor,
            "contabil",
            updateInput({ ...model, department: "Contábil" }),
          ),
        ),
        (error) => error.code === "NOT_FOUND" && error.status === 404,
      );
      await api(
        "patch",
        "/task-templates/contabil",
        managerToken,
        updateInput({ ...model, department: "Contábil" }),
      ).expect(404);
      const client = await store.pool.connect();
      try {
        await client.query("BEGIN READ ONLY");
        await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
          administrator.tenantId,
        ]);
        const invisible = await client.query(
          "SELECT id FROM portal.templates WHERE tenant_id=$1",
          [foreignActor.tenantId],
        );
        assert.equal(invisible.rowCount, 0);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    },
  );

  await check(
    "nova conexão recupera workflow, versões, tarefas e auditoria imutáveis",
    async () => {
      await store.close();
      store = new PostgresPortalStore(
        new pg.Pool({ connectionString: temporaryUrl(runtimeUrl), max: 4 }),
        () => DEMO_NOW,
      );
      const snapshot = await store.snapshot(administrator);
      assert.deepEqual(
        snapshot.templates.find((template) => template.id === model.id),
        model,
      );
      assert.deepEqual(await tasksFor(model, "2026-10"), originalTasks);
      assert.deepEqual(
        snapshot.audit.find((event) => event.id === updateAudit.id),
        updateAudit,
      );
    },
  );

  await check(
    "fluxo customizado preserva evidência obrigatória e conferência independente",
    async () => {
      let task = (await tasksFor(model, "2026-11")).find(
        (item) => item.assigneeId === manager.userId,
      );
      const command = async (token, type, fields = {}, status = 201) => {
        const response = await api("post", `/tasks/${task.id}/actions`, token, {
          type,
          expectedRevision: task.revision,
          ...fields,
        }).expect(status);
        if (status === 201) task = response.body;
        return response.body;
      };
      await command(managerToken, "start");
      assert.equal(
        (await command(managerToken, "submit", {}, 422)).code,
        "MISSING_STEPS",
      );
      await command(managerToken, "step", {
        stepId: task.steps[0].id,
        completed: true,
      });
      assert.equal(
        (await command(managerToken, "submit", {}, 422)).code,
        "MISSING_DOCUMENT",
      );
      const attached = await request(http)
        .post(`/api/v1/tasks/${task.id}/evidence`)
        .set("Host", "127.0.0.1")
        .set("Authorization", `Bearer ${managerToken}`)
        .field("expectedRevision", String(task.revision))
        .attach("file", Buffer.from(demoPdf()), "evidencia.pdf")
        .expect(201);
      task = attached.body;
      await command(managerToken, "submit");
      assert.equal(task.status, "in_review");
      assert.equal(
        (await command(managerToken, "approve", {}, 403)).code,
        "SELF_REVIEW",
      );
      await command(adminToken, "approve");
      assert.equal(task.status, "done");
      assert.equal(task.documents.length, 1);
      assert.deepEqual(task.steps, [
        { id: "validate", title: "Validar conciliação", completed: true },
      ]);
      assert.ok(
        (await tasksFor(model, "2026-11"))
          .filter((item) => item.id !== task.id)
          .every((item) => !item.steps[0].completed),
      );
    },
  );
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.message;
  console.error("Verificação falhou:", error.message);
  process.exitCode = 1;
} finally {
  await app?.close();
  await store?.close();
  await ownerPool?.end();
  if (created) {
    assert.ok(/^apice_workflow_[a-f0-9]{12}$/.test(database));
    assert.notEqual(database, migrationUrl.pathname.slice(1));
    assert.notEqual(database, runtimeUrl.pathname.slice(1));
    await adminPool.query(
      `DROP DATABASE ${pg.escapeIdentifier(database)} WITH (FORCE)`,
    );
  }
  await adminPool.end();
  report.finishedAt = new Date().toISOString();
  const directory = path.join(root, ".local", "verification");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "template-workflow.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Resultado: ${report.status}; ${report.checks.length} cenários. Base temporária removida; base do portal preservada.`,
  );
}
