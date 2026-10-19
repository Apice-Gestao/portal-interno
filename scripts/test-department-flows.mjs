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
  PERMISSIONS,
  cnpjFromBase,
  companyAtCompetence,
  REPORT_DEFINITIONS,
} from "../packages/domain/dist/index.js";
import { createApplication } from "../apps/api/dist/bootstrap.js";
import { migrateDatabase } from "../apps/api/dist/database/migrations.js";
import {
  PostgresPortalStore,
  seedDatabase,
} from "../apps/api/dist/database/postgres-store.js";
import {
  exportData,
  importData,
} from "../apps/api/dist/database/data-transfer.js";
import { IdentityStore } from "../apps/api/dist/database/identity-store.js";
import { hashPassword } from "../apps/api/dist/security/password.js";

// All writes are confined to two disposable databases in the dedicated local instance.
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
    "Use somente a instância dedicada do portal.",
  );
}
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const databases = [
  `apice_onboarding_${suffix}`,
  `apice_onboarding_restore_${suffix}`,
];
const created = [];
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
const connection = (original, database = databases[0]) => {
  const url = new URL(original);
  url.pathname = `/${database}`;
  return url.href;
};
Object.assign(process.env, {
  NODE_ENV: "development",
  PORTAL_STORAGE: "postgres",
  DATABASE_URL: connection(runtimeUrl),
  PORTAL_TENANT_ID: "apice-demo",
  ENABLE_DEMO_SESSIONS: "true",
  ENABLE_LOCAL_TEST_LOGIN: "false",
  MAIL_DELIVERY: "disabled",
});
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Implantação, configurações, documentos, comentários e mudanças operacionais: API/PostgreSQL em bases temporárias; sem dados reais.",
  checks: [],
};
const adminPool = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
let ownerPool, restorePool, store, app, http;
let flow, run, company, adminToken, operatorToken, reviewerToken, viewerToken;
const state = createSeed();
const admin = {
  ...state.users.find((u) => u.userId === "helena"),
  permissions: [...PERMISSIONS],
  active: true,
};
const operator = {
  ...state.users.find((u) => u.userId === "julia"),
  permissions: [
    "tasks.view",
    "tasks.execute",
    "tasks.attach",
    "tasks.download",
    "tasks.comment",
  ],
  active: true,
};
const nextOperator = {
  ...state.users.find((u) => u.userId === "marina"),
  departments: ["Contábil", "Pessoal"],
  permissions: ["tasks.view", "tasks.execute", "tasks.attach"],
  active: true,
};
const reviewer = {
  ...state.users.find((u) => u.userId === "rafael"),
  departments: ["Fiscal", "Contábil", "Pessoal"],
  permissions: ["tasks.view", "tasks.team.view", "tasks.review"],
  active: true,
};
const viewer = {
  ...state.users.find((u) => u.userId === "consulta"),
  permissions: [
    "templates.view",
    "companies.view",
    "documents.view",
    "documents.manage",
  ],
  active: true,
};
state.users = state.users.map(
  (u) =>
    [admin, operator, nextOperator, reviewer, viewer].find(
      (v) => v.userId === u.userId,
    ) ?? u,
);
const foreign = structuredClone(state);
for (const key of ["users", "companies", "templates", "tasks", "audit"]) {
  for (const row of foreign[key]) row.tenantId = "tenant-onboarding-b";
  state[key].push(...foreign[key]);
}
const stages = [
  {
    id: "fiscal",
    title: "Parametrização fiscal",
    department: "Fiscal",
    internalDays: 2,
    legalDays: 4,
    requiresReview: true,
    requiredDocument: "Evidência de parametrização",
    workflowSteps: [{ id: "config", title: "Conferir parametrização inicial" }],
  },
  {
    id: "contabil",
    title: "Parametrização contábil",
    department: "Contábil",
    internalDays: 2,
    legalDays: 4,
    requiresReview: false,
    requiredDocument: "Evidência de parametrização",
    workflowSteps: [{ id: "config", title: "Conferir saldos iniciais" }],
  },
  {
    id: "pessoal",
    title: "Parametrização de pessoal",
    department: "Pessoal",
    internalDays: 1,
    legalDays: 3,
    requiresReview: false,
    requiredDocument: "Evidência de parametrização",
    workflowSteps: [{ id: "config", title: "Conferir cadastros iniciais" }],
  },
];
const assignments = {
  fiscal: operator.userId,
  contabil: nextOperator.userId,
  pessoal: nextOperator.userId,
};
const flowInput = { title: "Entrada de empresa — teste isolado", stages };
const newCompany = (n, onboarding) => ({
  name: `Empresa de teste de implantação ${n}`,
  cnpj: cnpjFromBase(`990000${String(n).padStart(2, "0")}0001`),
  city: "Cidade de teste / SP",
  regime: "Simples Nacional",
  ownerId: operator.userId,
  ...(onboarding ? { onboarding } : {}),
});
const startInput = (companyId, blocked = true) => ({
  companyId,
  flowId: flow.id,
  expectedFlowVersion: flow.version,
  competence: "2026-10",
  blockRecurring: blocked,
  assignments,
});
const snapshot = () => store.snapshot(admin);
const workspaceBody = (workspace) => ({
  expectedRevision: workspace.revision,
  departments: workspace.departments,
  accessProfiles: workspace.accessProfiles,
  documentTypes: workspace.documentTypes,
  documentRules: workspace.documentRules,
});
const taskOf = async (id) =>
  (await snapshot()).tasks.find((task) => task.id === id);
const companyOf = async (id) =>
  (await snapshot()).companies.find((item) => item.id === id);
async function evidence(
  task,
  token,
  filename,
  metadata = {},
  expectedStatus = 201,
) {
  let call = request(http)
    .post(`/api/v1/tasks/${task.id}/evidence`)
    .set("Host", "127.0.0.1")
    .set("Authorization", `Bearer ${token}`)
    .field("expectedRevision", String(task.revision));
  for (const [name, value] of Object.entries(metadata))
    call = call.field(name, value);
  return (
    await call
      .attach("file", Buffer.from(demoPdf()), filename)
      .expect(expectedStatus)
  ).body;
}
function api(method, endpoint, token, body) {
  let call = request(http)
    [method](`/api/v1${endpoint}`)
    .set("Host", "127.0.0.1");
  if (token) call = call.set("Authorization", `Bearer ${token}`);
  return body ? call.send(body) : call;
}
async function restartTestApi() {
  // Isolate phases from accumulated per-minute buckets; production limits stay intact.
  await app.close();
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  http = app.getHttpServer();
  for (const [actor, assign] of [
    [
      admin,
      (token) => {
        adminToken = token;
      },
    ],
    [
      operator,
      (token) => {
        operatorToken = token;
      },
    ],
    [
      reviewer,
      (token) => {
        reviewerToken = token;
      },
    ],
    [
      viewer,
      (token) => {
        viewerToken = token;
      },
    ],
  ])
    assign(
      (
        await api("post", "/demo-session", undefined, {
          userId: actor.userId,
        }).expect(201)
      ).body.token,
    );
}
async function check(name, operation) {
  await operation();
  report.checks.push({ name, status: "passed" });
  console.log(`✓ ${name}`);
}
async function command(task, token, type, fields = {}, status = 201) {
  const response = await api("post", `/tasks/${task.id}/actions`, token, {
    type,
    expectedRevision: task.revision,
    ...fields,
  }).expect(status);
  return response.body;
}
async function completeStage(task, token, requiresReview) {
  task = await command(task, token, "start");
  for (const step of task.steps)
    task = await command(task, token, "step", {
      stepId: step.id,
      completed: true,
    });
  task = (
    await request(http)
      .post(`/api/v1/tasks/${task.id}/evidence`)
      .set("Host", "127.0.0.1")
      .set("Authorization", `Bearer ${token}`)
      .field("expectedRevision", String(task.revision))
      .attach("file", Buffer.from(demoPdf()), "parametrizacao.pdf")
      .expect(201)
  ).body;
  return command(task, token, requiresReview ? "submit" : "complete");
}
try {
  for (const database of databases) {
    await adminPool.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
    created.push(database);
  }
  ownerPool = new pg.Pool({
    connectionString: connection(migrationUrl),
    max: 1,
  });
  restorePool = new pg.Pool({
    connectionString: connection(migrationUrl, databases[1]),
    max: 1,
  });
  await check(
    "migrações idempotentes e compatibilidade com dados anteriores",
    async () => {
      await migrateDatabase(ownerPool, runtimeUrl.username);
      await migrateDatabase(ownerPool, runtimeUrl.username);
      await migrateDatabase(restorePool, runtimeUrl.username);
      await seedDatabase(ownerPool, state);
      store = new PostgresPortalStore(
        new pg.Pool({ connectionString: connection(runtimeUrl), max: 5 }),
        () => DEMO_NOW,
      );
      assert.deepEqual((await snapshot()).departmentFlows, []);
      assert.deepEqual((await snapshot()).companyOnboardings, []);
      assert.equal((await snapshot()).companies.length, 12);
    },
  );
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  http = app.getHttpServer();
  const login = async (userId) =>
    (await api("post", "/demo-session", undefined, { userId }).expect(201)).body
      .token;
  adminToken = await login(admin.userId);
  operatorToken = await login(operator.userId);
  reviewerToken = await login(reviewer.userId);
  viewerToken = await login(viewer.userId);
  await check(
    "API exige sessão, concessão e corpo estrito para criar fluxos",
    async () => {
      await api("post", "/department-flows", undefined, flowInput).expect(401);
      await api("post", "/department-flows", viewerToken, flowInput).expect(
        403,
      );
      await api("post", "/department-flows", adminToken, {
        ...flowInput,
        tenantId: "tenant-onboarding-b",
      }).expect(400);
      flow = (
        await api("post", "/department-flows", adminToken, flowInput).expect(
          201,
        )
      ).body;
      assert.equal(flow.version, 1);
      assert.equal(flow.tenantId, admin.tenantId);
    },
  );
  await check(
    "cadastro da empresa e início da implantação são atômicos",
    async () => {
      const before = await snapshot();
      const badStart = startInput("unused");
      delete badStart.companyId;
      badStart.assignments = { ...assignments, contabil: operator.userId };
      const denied = await api(
        "post",
        "/companies",
        adminToken,
        newCompany(1, badStart),
      );
      assert.ok([403, 404, 422].includes(denied.status));
      assert.deepEqual((await snapshot()).companies, before.companies);
      const goodStart = startInput("unused");
      delete goodStart.companyId;
      company = (
        await api(
          "post",
          "/companies",
          adminToken,
          newCompany(1, goodStart),
        ).expect(201)
      ).body;
      run = (await snapshot()).companyOnboardings.find(
        (r) => r.companyId === company.id,
      );
      assert.equal(run.blockRecurring, true);
      assert.equal(run.status, "active");
      assert.deepEqual(
        run.stages.map((s) => s.status),
        ["active", "blocked", "blocked"],
      );
      assert.equal(
        (await snapshot()).tasks.filter((t) => t.companyId === company.id)
          .length,
        1,
      );
    },
  );
  await check(
    "implantação ativa bloqueia recorrência, preserva tarefas e impede duplicidade",
    async () => {
      const existing = (await snapshot()).tasks.filter(
        (t) => t.companyId === company.id,
      );
      const generation = await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Fiscal",
      }).expect(201);
      assert.ok(generation.body.blocked >= 1);
      assert.deepEqual(
        (await snapshot()).tasks.filter((t) => t.companyId === company.id),
        existing,
      );
      const duplicate = await api(
        "post",
        "/company-onboardings",
        adminToken,
        startInput(company.id),
      );
      assert.equal(duplicate.status, 409);
    },
  );
  await check(
    "versão concorrente do modelo gera conflito e não altera fluxo iniciado",
    async () => {
      const body = {
        title: flow.title,
        stages: [
          { ...stages[0], title: "Nova parametrização fiscal" },
          ...stages.slice(1),
        ],
        active: true,
        expectedVersion: flow.version,
      };
      const responses = await Promise.all([
        api("patch", `/department-flows/${flow.id}`, adminToken, body),
        api("patch", `/department-flows/${flow.id}`, adminToken, body),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      flow = responses.find((r) => r.status === 200).body;
      const active = (await snapshot()).companyOnboardings.find(
        (r) => r.id === run.id,
      );
      assert.equal(active.flowVersion, 1);
      assert.equal(active.stages[0].title, stages[0].title);
    },
  );
  await check(
    "conferência independente precede liberação do próximo setor",
    async () => {
      let task = (await snapshot()).tasks.find(
        (t) => t.id === run.stages[0].taskId,
      );
      task = await completeStage(task, operatorToken, true);
      assert.equal(task.status, "in_review");
      const waiting = (await snapshot()).companyOnboardings.find(
        (r) => r.id === run.id,
      );
      assert.equal(waiting.stages[1].taskId, undefined);
      task = await command(task, reviewerToken, "approve");
      assert.equal(task.status, "done");
      run = (await snapshot()).companyOnboardings.find((r) => r.id === run.id);
      assert.deepEqual(
        run.stages.map((s) => s.status),
        ["done", "active", "blocked"],
      );
      assert.equal(
        (await snapshot()).tasks.find((t) => t.id === run.stages[1].taskId)
          .assigneeId,
        nextOperator.userId,
      );
      const retry = await api(
        "post",
        `/tasks/${task.id}/actions`,
        reviewerToken,
        { type: "approve", expectedRevision: task.revision - 1 },
      );
      assert.equal(retry.status, 409);
      const reopened = await api(
        "post",
        `/tasks/${task.id}/actions`,
        adminToken,
        {
          type: "reopen",
          expectedRevision: task.revision,
          reason: "Reabertura de teste após passagem",
        },
      );
      assert.equal(reopened.status, 409);
      assert.equal(reopened.body.code, "HANDOFF_LOCKED");
    },
  );
  await check(
    "operador vê somente sua etapa e não altera tarefas de outro setor",
    async () => {
      const personal = (
        await api("get", "/snapshot", operatorToken).expect(200)
      ).body;
      assert.ok(
        personal.tasks.every(
          (t) => t.department === "Fiscal" && t.assigneeId === operator.userId,
        ),
      );
      assert.deepEqual(personal.departmentFlows, []);
      const next = (await snapshot()).tasks.find(
        (t) => t.id === run.stages[1].taskId,
      );
      await api("post", `/tasks/${next.id}/actions`, operatorToken, {
        type: "start",
        expectedRevision: next.revision,
      }).expect(404);
    },
  );
  await check(
    "término da implantação libera geração normal sem duplicar tarefas",
    async () => {
      const nextToken = await login(nextOperator.userId);
      for (const index of [1, 2]) {
        const task = (await snapshot()).tasks.find(
          (t) => t.id === run.stages[index].taskId,
        );
        await completeStage(task, nextToken, false);
        run = (await snapshot()).companyOnboardings.find(
          (r) => r.id === run.id,
        );
      }
      assert.equal(run.status, "completed");
      assert.ok(run.completedAt);
      assert.ok(run.stages.every((s) => s.status === "done"));
      const generated = await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Fiscal",
      }).expect(201);
      assert.ok(generated.body.created > 0);
      const count = (await snapshot()).tasks.filter(
        (t) => t.companyId === company.id,
      ).length;
      await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Fiscal",
      }).expect(201);
      assert.equal(
        (await snapshot()).tasks.filter((t) => t.companyId === company.id)
          .length,
        count,
      );
    },
  );
  await check(
    "gestor pode optar por implantação e recorrência em paralelo no cadastro",
    async () => {
      const parallelStart = startInput("unused", false);
      delete parallelStart.companyId;
      const parallel = (
        await api(
          "post",
          "/companies",
          adminToken,
          newCompany(2, parallelStart),
        ).expect(201)
      ).body;
      await api("post", "/generation", adminToken, {
        competence: "2026-11",
        department: "Fiscal",
      }).expect(201);
      const data = await snapshot();
      assert.equal(
        data.companyOnboardings.find((r) => r.companyId === parallel.id).status,
        "active",
      );
      assert.ok(
        data.tasks.some(
          (t) => t.companyId === parallel.id && t.competence === "2026-11",
        ),
      );
    },
  );
  let settings,
    queueCompany,
    secondCompany,
    evidenceTask,
    firstDocument,
    approvedProposal;
  await check(
    "configuração de grupo valida concessões, isolamento e revisão concorrente",
    async () => {
      settings = (await snapshot()).workspace;
      const update = {
        ...workspaceBody(settings),
        departments: [
          ...settings.departments,
          { id: "Societario", name: "Societário", active: true },
        ],
      };
      await api("patch", "/workspace-settings", undefined, update).expect(401);
      await api("patch", "/workspace-settings", operatorToken, update).expect(
        403,
      );
      await api("patch", "/workspace-settings", viewerToken, update).expect(
        403,
      );
      await api("patch", "/workspace-settings", adminToken, {
        ...update,
        tenantId: "tenant-onboarding-b",
      }).expect(400);
      const results = await Promise.all([
        api("patch", "/workspace-settings", adminToken, update),
        api("patch", "/workspace-settings", adminToken, update),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      settings = results.find((r) => r.status === 200).body;
      assert.equal(settings.revision, 2);
      assert.ok(settings.departments.some((d) => d.id === "Societario"));
      assert.equal(
        (
          await store.snapshot({ ...admin, tenantId: "tenant-onboarding-b" })
        ).workspace.departments.some((d) => d.id === "Societario"),
        false,
      );
      await api("patch", "/workspace-settings", adminToken, {
        ...workspaceBody(settings),
        departments: settings.departments.filter((d) => d.id !== "Fiscal"),
      }).expect(422);
      assert.deepEqual((await snapshot()).workspace, settings);
    },
  );
  await check(
    "regras documentais são declarativas, referenciadas e independentes da gestão de usuários",
    async () => {
      const rule = {
        id: "pgdas-documents",
        name: "Guia e recibo de teste",
        templateIds: ["pgdas"],
        documentTypeIds: ["guide", "receipt"],
        required: true,
        keywords: ["DAS"],
        fields: ["cnpj", "competence"],
        active: true,
      };
      await api("patch", "/workspace-settings", viewerToken, {
        ...workspaceBody(settings),
        documentRules: [{ ...rule, script: "arbitrary-code" }],
      }).expect(400);
      await api("patch", "/workspace-settings", viewerToken, {
        ...workspaceBody(settings),
        documentRules: [{ ...rule, documentTypeIds: ["missing"] }],
      }).expect(422);
      settings = (
        await api("patch", "/workspace-settings", viewerToken, {
          ...workspaceBody(settings),
          documentRules: [rule],
        }).expect(200)
      ).body;
      assert.equal(settings.documentRules[0].id, rule.id);
      const profile = {
        id: "operator-extended",
        name: "Operador com concessões",
        role: "operator",
        departments: ["Fiscal"],
        permissions: [
          "tasks.view",
          "tasks.execute",
          "tasks.assign",
          "tasks.comment",
        ],
        homeView: "team",
      };
      await api("patch", "/workspace-settings", viewerToken, {
        ...workspaceBody(settings),
        accessProfiles: [profile],
      }).expect(403);
      const usersBefore = (await snapshot()).users;
      settings = (
        await api("patch", "/workspace-settings", adminToken, {
          ...workspaceBody(settings),
          accessProfiles: [...settings.accessProfiles, profile],
        }).expect(200)
      ).body;
      assert.deepEqual(
        (await snapshot()).users,
        usersBefore,
        "Salvar modelo não deve alterar contas existentes.",
      );
    },
  );
  await check(
    "cadastro completo preserva código, agrupadores e ausência de obrigações por setor",
    async () => {
      const input = {
        ...newCompany(20),
        code: "000020",
        ownerId: admin.userId,
        responsibilities: {
          Fiscal: { mode: "department" },
          Contábil: { mode: "none" },
          Pessoal: { mode: "none" },
        },
        tags: ["Grupo teste", "Comércio"],
        status: "active",
      };
      queueCompany = (
        await api("post", "/companies", adminToken, input).expect(201)
      ).body;
      assert.equal(queueCompany.code, "000020");
      assert.equal(queueCompany.revision, 1);
      assert.deepEqual(queueCompany.tags, input.tags);
      assert.deepEqual(queueCompany.responsibilities, input.responsibilities);
      await api("post", "/companies", adminToken, {
        ...newCompany(21),
        code: "000020",
      }).expect(409);
      await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Fiscal",
      }).expect(201);
      await api("post", "/generation", adminToken, {
        competence: "2026-10",
        department: "Contábil",
      }).expect(201);
      const own = (await snapshot()).tasks.filter(
        (t) => t.companyId === queueCompany.id,
      );
      assert.ok(own.length > 0);
      assert.ok(
        own.every(
          (t) =>
            t.department === "Fiscal" && t.assigneeId === "department:Fiscal",
        ),
      );
      evidenceTask = own.find((t) => t.templateId === "pgdas");
      assert.ok(evidenceTask);
      assert.deepEqual([...evidenceTask.requiredDocumentTypeIds].sort(), [
        "guide",
        "receipt",
      ]);
    },
  );
  await check(
    "fila departamental permite uma única tomada de responsabilidade com revisão atômica",
    async () => {
      const personal = (
        await api("get", "/snapshot", operatorToken).expect(200)
      ).body;
      assert.ok(
        personal.tasks.some(
          (t) =>
            t.id === evidenceTask.id && t.assigneeId === "department:Fiscal",
        ),
      );
      const results = await Promise.all([
        api("post", `/tasks/${evidenceTask.id}/actions`, operatorToken, {
          type: "start",
          expectedRevision: evidenceTask.revision,
        }),
        api("post", `/tasks/${evidenceTask.id}/actions`, adminToken, {
          type: "start",
          expectedRevision: evidenceTask.revision,
        }),
      ]);
      assert.equal(results.filter((result) => result.status === 201).length, 1);
      assert.ok(
        results
          .filter((result) => result.status !== 201)
          .every((result) => [404, 409].includes(result.status)),
      );
      evidenceTask = results.find((result) => result.status === 201).body;
      if (evidenceTask.assigneeId !== operator.userId)
        evidenceTask = await command(evidenceTask, adminToken, "assign", {
          assigneeId: operator.userId,
        });
      assert.equal(evidenceTask.assigneeId, operator.userId);
      assert.ok(
        (await snapshot()).audit.some(
          (e) =>
            e.taskId === evidenceTask.id &&
            e.action === "Tarefa assumida da fila",
        ),
      );
    },
  );
  await check(
    "comentários preservam autoria, escapam do controle do cliente e rejeitam revisão antiga",
    async () => {
      const comment = {
        expectedRevision: evidenceTask.revision,
        text: "Cliente enviou documentos. Conferência interna pendente.",
      };
      await api(
        "post",
        `/tasks/${evidenceTask.id}/comments`,
        reviewerToken,
        comment,
      ).expect(403);
      await api("post", `/tasks/${evidenceTask.id}/comments`, operatorToken, {
        ...comment,
        authorId: admin.userId,
      }).expect(400);
      evidenceTask = (
        await api(
          "post",
          `/tasks/${evidenceTask.id}/comments`,
          operatorToken,
          comment,
        ).expect(201)
      ).body;
      const saved = evidenceTask.comments.at(-1);
      assert.equal(saved.authorId, operator.userId);
      assert.equal(saved.authorName, operator.name);
      assert.equal(saved.text, comment.text);
      assert.ok(saved.at);
      await api(
        "post",
        `/tasks/${evidenceTask.id}/comments`,
        operatorToken,
        comment,
      ).expect(409);
      assert.deepEqual(
        (await taskOf(evidenceTask.id)).comments,
        evidenceTask.comments,
      );
    },
  );
  await check(
    "anexos independentes e versões lógicas persistem sem perder documentos nem liberar entrega incompleta",
    async () => {
      for (const step of evidenceTask.steps)
        evidenceTask = await command(evidenceTask, operatorToken, "step", {
          stepId: step.id,
          completed: true,
        });
      evidenceTask = await evidence(evidenceTask, operatorToken, "guia.pdf", {
        documentTypeId: "guide",
      });
      firstDocument = evidenceTask.documents.at(-1);
      assert.equal(firstDocument.logicalVersion, 1);
      assert.equal(firstDocument.logicalId, firstDocument.id);
      await api("post", `/tasks/${evidenceTask.id}/actions`, operatorToken, {
        type: "submit",
        expectedRevision: evidenceTask.revision,
      }).expect(422);
      const count = evidenceTask.documents.length;
      await evidence(
        evidenceTask,
        operatorToken,
        "guia-versao-invalida.pdf",
        { logicalId: firstDocument.logicalId, documentTypeId: "receipt" },
        422,
      );
      assert.equal((await taskOf(evidenceTask.id)).documents.length, count);
      evidenceTask = await evidence(evidenceTask, operatorToken, "recibo.pdf", {
        documentTypeId: "receipt",
      });
      const receipt = evidenceTask.documents.at(-1);
      assert.notEqual(receipt.logicalId, firstDocument.logicalId);
      evidenceTask = await evidence(
        evidenceTask,
        operatorToken,
        "guia-corrigida.pdf",
        { logicalId: firstDocument.logicalId, documentTypeId: "guide" },
      );
      assert.equal(evidenceTask.documents.at(-1).logicalVersion, 2);
      assert.equal(
        evidenceTask.documents.at(-1).logicalId,
        firstDocument.logicalId,
      );
      assert.equal(
        new Set(evidenceTask.documents.map((d) => d.logicalId)).size,
        2,
      );
      assert.equal(
        new Set(evidenceTask.documents.map((d) => d.version)).size,
        3,
      );
      evidenceTask = await command(evidenceTask, operatorToken, "submit");
      evidenceTask = await command(evidenceTask, reviewerToken, "approve");
      assert.equal(evidenceTask.status, "done");
      for (const doc of evidenceTask.documents) {
        const download = await api(
          "get",
          `/tasks/${evidenceTask.id}/documents/${doc.id}/download`,
          operatorToken,
        ).expect(200);
        assert.ok(
          download.headers["content-type"].startsWith("application/pdf"),
        );
      }
      await api("patch", "/workspace-settings", adminToken, {
        ...workspaceBody(settings),
        documentTypes: settings.documentTypes.filter(
          (type) => type.id !== "guide",
        ),
      }).expect(422);
    },
  );
  await check(
    "importação completa é atômica e rejeita conflito de código sem inserir linhas anteriores",
    async () => {
      const valid = {
        ...newCompany(30),
        code: "000030",
        ownerId: admin.userId,
        responsibilities: {
          Fiscal: { mode: "person", userId: operator.userId },
          Contábil: { mode: "person", userId: nextOperator.userId },
          Pessoal: { mode: "none" },
        },
        tags: ["Importação completa"],
        status: "closing",
        serviceEndCompetence: "2027-03",
      };
      const before = (await snapshot()).companies;
      await api("post", "/companies/import", adminToken, {
        companies: [valid, { ...newCompany(31), code: "000020" }],
      }).expect(409);
      assert.deepEqual((await snapshot()).companies, before);
      await api("post", "/companies/import", adminToken, {
        companies: [
          valid,
          {
            ...newCompany(31),
            code: "000031",
            responsibilities: {
              Fiscal: { mode: "person", userId: "unavailable" },
            },
          },
        ],
      }).expect(422);
      assert.deepEqual((await snapshot()).companies, before);
      const imported = (
        await api("post", "/companies/import", adminToken, {
          companies: [valid],
        }).expect(201)
      ).body;
      assert.equal(imported.created, 1);
      secondCompany = (await snapshot()).companies.find(
        (c) => c.cnpj === valid.cnpj,
      );
      assert.deepEqual(secondCompany.responsibilities, valid.responsibilities);
      assert.equal(secondCompany.status, "closing");
      assert.equal(
        secondCompany.serviceEndCompetence,
        valid.serviceEndCompetence,
      );
      assert.deepEqual(secondCompany.tags, valid.tags);
      assert.equal(
        (
          await api("post", "/companies/import", adminToken, {
            companies: [valid],
          }).expect(201)
        ).body.existing,
        1,
      );
    },
  );
  await check(
    "edições da empresa usam CAS e preservam códigos e situação existentes",
    async () => {
      const body = {
        expectedRevision: queueCompany.revision,
        city: "Cidade atualizada / SP",
        tags: ["Revisada"],
      };
      const results = await Promise.all([
        api("patch", `/companies/${queueCompany.id}`, adminToken, body),
        api("patch", `/companies/${queueCompany.id}`, adminToken, body),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      queueCompany = results.find((r) => r.status === 200).body;
      assert.equal(queueCompany.revision, 2);
      assert.equal(queueCompany.code, "000020");
      assert.equal(queueCompany.city, body.city);
      await api("patch", `/companies/${queueCompany.id}`, adminToken, {
        expectedRevision: queueCompany.revision,
        code: secondCompany.code,
      }).expect(409);
      assert.deepEqual(await companyOf(queueCompany.id), queueCompany);
    },
  );
  await check(
    "transferência em lote é atômica, altera abertas e mantém autoria e documentos das concluídas",
    async () => {
      await api("post", "/generation", adminToken, {
        competence: "2026-11",
        department: "Fiscal",
      }).expect(201);
      const ids = [queueCompany.id, secondCompany.id];
      const before = await snapshot();
      const complete = before.tasks.find((t) => t.id === evidenceTask.id);
      const payload = {
        companyIds: ids,
        department: "Fiscal",
        target: { mode: "person", userId: admin.userId },
        transferOpenTasks: true,
        expectedRevisions: Object.fromEntries(
          before.companies
            .filter((c) => ids.includes(c.id))
            .map((c) => [c.id, c.revision ?? 1]),
        ),
      };
      await api("post", "/companies/transfer", operatorToken, payload).expect(
        403,
      );
      const stale = {
        ...payload,
        expectedRevisions: {
          ...payload.expectedRevisions,
          [secondCompany.id]: 999,
        },
      };
      await api("post", "/companies/transfer", adminToken, stale).expect(409);
      assert.deepEqual((await snapshot()).companies, before.companies);
      assert.deepEqual((await snapshot()).tasks, before.tasks);
      const result = (
        await api("post", "/companies/transfer", adminToken, payload).expect(
          201,
        )
      ).body;
      assert.equal(result.companies, 2);
      assert.ok(result.tasks > 0);
      const after = await snapshot();
      assert.deepEqual(
        after.tasks.find((t) => t.id === evidenceTask.id),
        complete,
      );
      assert.ok(
        after.tasks
          .filter(
            (t) =>
              ids.includes(t.companyId) &&
              t.department === "Fiscal" &&
              !["done", "dispensed"].includes(t.status) &&
              !t.onboardingId,
          )
          .every((t) => t.assigneeId === admin.userId),
      );
      assert.ok(
        after.companies
          .filter((c) => ids.includes(c.id))
          .every((c) => c.responsibilities.Fiscal.userId === admin.userId),
      );
      queueCompany = after.companies.find((c) => c.id === queueCompany.id);
      secondCompany = after.companies.find((c) => c.id === secondCompany.id);
    },
  );
  await check(
    "propostas preservam vigência, aprovam após edição simples sem sobrescrever e permitem rejeição",
    async () => {
      const input = {
        companyId: queueCompany.id,
        expectedRevision: queueCompany.revision,
        patch: { regime: "Lucro Presumido" },
        effectiveCompetence: "2026-12",
        reason: "Mudança de regime ilustrativa para teste",
      };
      await api(
        "post",
        "/companies/change-proposals",
        operatorToken,
        input,
      ).expect(403);
      const stale = (
        await api(
          "post",
          "/companies/change-proposals",
          adminToken,
          input,
        ).expect(201)
      ).body;
      queueCompany = (
        await api("patch", `/companies/${queueCompany.id}`, adminToken, {
          expectedRevision: queueCompany.revision,
          tags: ["Cadastro alterado após proposta"],
        }).expect(200)
      ).body;
      await api(
        "post",
        `/company-change-proposals/${stale.id}/decision`,
        operatorToken,
        { expectedRevision: stale.revision, decision: "approve" },
      ).expect(403);
      // L07 (19/10/2026): the decision recomputes the impact on the current
      // company, so a simple edit no longer locks the pending proposal.
      const afterEdit = (
        await api(
          "post",
          `/company-change-proposals/${stale.id}/decision`,
          adminToken,
          { expectedRevision: stale.revision, decision: "approve" },
        ).expect(201)
      ).body;
      assert.equal(afterEdit.status, "approved");
      queueCompany = (await snapshot()).companies.find(
        (c) => c.id === queueCompany.id,
      );
      assert.deepEqual(queueCompany.tags, ["Cadastro alterado após proposta"]);
      const toReject = (
        await api("post", "/companies/change-proposals", adminToken, {
          ...input,
          expectedRevision: queueCompany.revision,
          patch: { regime: "Lucro Real" },
        }).expect(201)
      ).body;
      const rejected = (
        await api(
          "post",
          `/company-change-proposals/${toReject.id}/decision`,
          adminToken,
          { expectedRevision: toReject.revision, decision: "reject" },
        ).expect(201)
      ).body;
      assert.equal(rejected.status, "rejected");
      approvedProposal = (
        await api("post", "/companies/change-proposals", adminToken, {
          ...input,
          expectedRevision: queueCompany.revision,
        }).expect(201)
      ).body;
      const oldTasks = (await snapshot()).tasks.filter(
        (t) =>
          t.companyId === queueCompany.id &&
          t.competence < input.effectiveCompetence,
      );
      approvedProposal = (
        await api(
          "post",
          `/company-change-proposals/${approvedProposal.id}/decision`,
          adminToken,
          { expectedRevision: approvedProposal.revision, decision: "approve" },
        ).expect(201)
      ).body;
      assert.equal(approvedProposal.status, "approved");
      assert.equal(approvedProposal.decidedBy, admin.userId);
      assert.ok(approvedProposal.decidedAt);
      assert.deepEqual(
        (await snapshot()).tasks.filter((t) =>
          oldTasks.some((old) => old.id === t.id),
        ),
        oldTasks,
      );
      const raw = (
        await ownerPool.query(
          "SELECT payload FROM portal.companies WHERE tenant_id=$1 AND id=$2",
          [admin.tenantId, queueCompany.id],
        )
      ).rows[0].payload;
      assert.equal(
        companyAtCompetence(raw, "2026-11").regime,
        "Simples Nacional",
      );
      assert.equal(
        companyAtCompetence(raw, "2026-12").regime,
        "Lucro Presumido",
      );
      // L06: a future competence is created by the generation, once.
      await api("post", "/generation", adminToken, {
        competence: "2026-12",
        department: "Fiscal",
      }).expect(201);
      const count = (await snapshot()).tasks.filter(
        (t) => t.companyId === queueCompany.id && t.competence === "2026-12",
      ).length;
      await api("post", "/generation", adminToken, {
        competence: "2026-12",
        department: "Fiscal",
      }).expect(201);
      assert.equal(
        (await snapshot()).tasks.filter(
          (t) => t.companyId === queueCompany.id && t.competence === "2026-12",
        ).length,
        count,
      );
      await api(
        "post",
        `/company-change-proposals/${approvedProposal.id}/decision`,
        adminToken,
        { expectedRevision: approvedProposal.revision, decision: "approve" },
      ).expect(409);
    },
  );
  await check(
    "processos gerais podem repetir sem duplicar implantação nem bloquear recorrência",
    async () => {
      const process = (
        await api("post", "/department-flows", adminToken, {
          title: "Revisão recorrente de parametrização",
          kind: "process",
          stages: [
            { ...stages[0], requiresReview: false, requiredDocument: "" },
          ],
        }).expect(201)
      ).body;
      const body = {
        companyId: company.id,
        flowId: process.id,
        expectedFlowVersion: process.version,
        competence: "2026-12",
        blockRecurring: true,
        assignments: { fiscal: operator.userId },
      };
      const first = (
        await api("post", "/company-onboardings", adminToken, body).expect(201)
      ).body;
      const second = (
        await api("post", "/company-onboardings", adminToken, body).expect(201)
      ).body;
      assert.notEqual(first.id, second.id);
      assert.equal(first.kind, "process");
      assert.equal(first.blockRecurring, false);
      assert.equal(
        (await snapshot()).companyOnboardings.filter(
          (item) => item.companyId === company.id && item.kind !== "process",
        ).length,
        1,
      );
    },
  );
  await check(
    "importação de usuários cria senhas individuais, exige gestão e reverte o lote inválido",
    async () => {
      adminToken = await login(admin.userId);
      operatorToken = await login(operator.userId);
      viewerToken = await login(viewer.userId);
      const credential = await hashPassword("SyntheticImportAdmin2026!");
      await ownerPool.query(
        "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,must_change_password,email) VALUES($1,$2,$3,$4,false,$5)",
        [
          admin.tenantId,
          admin.userId,
          "admin.import.fixture",
          credential,
          "admin.import@example.invalid",
        ],
      );
      const identities = app.get(IdentityStore);
      await ownerPool.query(
        "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,must_change_password,email) VALUES($1,$2,$3,$4,false,$5)",
        [
          operator.tenantId,
          operator.userId,
          "operator.import.fixture",
          credential,
          "operator.import@example.invalid",
        ],
      );
      const input = {
        name: "Pessoa importada fictícia",
        username: "import.fixture.one",
        email: "one@example.invalid",
        password: "SyntheticIndividualOne2026!",
        role: "operator",
        departments: ["Fiscal"],
        permissions: ["tasks.view", "tasks.execute"],
        homeView: "personal",
        managerId: admin.userId,
      };
      await api("post", "/users/import", undefined, { users: [input] }).expect(
        401,
      );
      const denied = await api("post", "/users/import", operatorToken, {
        users: [input],
      });
      assert.equal(
        denied.status,
        403,
        JSON.stringify({
          code: denied.body.code,
          message: denied.body.message,
        }),
      );
      const before = (await identities.list(admin)).length;
      await api("post", "/users/import", adminToken, {
        users: [
          input,
          {
            ...input,
            username: "import.fixture.bad",
            email: "bad@example.invalid",
            departments: ["Unregistered"],
          },
        ],
      }).expect(400);
      assert.equal((await identities.list(admin)).length, before);
      await api("post", "/users/import", adminToken, {
        users: [input, input],
      }).expect(400);
      const imported = (
        await api("post", "/users/import", adminToken, {
          users: [
            input,
            {
              ...input,
              name: "Segunda pessoa fictícia",
              username: "import.fixture.two",
              email: "two@example.invalid",
              password: "SyntheticIndividualTwo2026!",
            },
          ],
        }).expect(201)
      ).body;
      assert.equal(imported.length, 2);
      assert.ok(
        imported.every(
          (user) =>
            user.mustChangePassword === true &&
            !user.password &&
            !user.password_hash,
        ),
      );
      assert.equal(
        (await identities.authenticate(input.username, input.password)).actor
          .userId,
        imported[0].userId,
      );
      await assert.rejects(() =>
        identities.authenticate("import.fixture.two", input.password),
      );
      assert.ok(
        !(await identities.list(admin)).some(
          (user) => user.username === "import.fixture.bad",
        ),
      );
    },
  );
  await check(
    "organização por cargos livres preserva permissões, oculta colegas e rejeita ciclos",
    async () => {
      const current = (await snapshot()).workspace;
      const usersBefore = (await snapshot()).users;
      const departments = current.departments.map((department) =>
        department.id !== "Fiscal"
          ? department
          : {
              ...department,
              name: "Fiscal e consultoria",
              positions: [
                { id: "director", name: "Diretor técnico" },
                { id: "analyst", name: "Analista tributário" },
              ],
              members: [
                { userId: admin.userId, positionId: "director" },
                {
                  userId: operator.userId,
                  positionId: "analyst",
                  reportsTo: admin.userId,
                },
              ],
            },
      );
      const saved = (
        await api("patch", "/workspace-settings", adminToken, {
          expectedRevision: current.revision,
          departments,
        }).expect(200)
      ).body;
      assert.deepEqual((await snapshot()).users, usersBefore);
      const personal = (
        await api("get", "/snapshot", operatorToken).expect(200)
      ).body;
      assert.deepEqual(
        personal.workspace.departments.find((item) => item.id === "Fiscal")
          .members,
        [{ userId: operator.userId, positionId: "analyst" }],
      );
      await api("patch", "/workspace-settings", operatorToken, {
        expectedRevision: saved.revision,
        departments,
      }).expect(403);
      const cyclic = departments.map((department) =>
        department.id !== "Fiscal"
          ? department
          : {
              ...department,
              members: department.members.map((member) =>
                member.userId === admin.userId
                  ? { ...member, reportsTo: operator.userId }
                  : member,
              ),
            },
      );
      await api("patch", "/workspace-settings", adminToken, {
        expectedRevision: saved.revision,
        departments: cyclic,
      }).expect(422);
      const documentResponse = (
        await api("patch", "/workspace-settings", viewerToken, {
          expectedRevision: saved.revision,
          documentRules: saved.documentRules,
        }).expect(200)
      ).body;
      assert.deepEqual(
        documentResponse.departments.find((item) => item.id === "Fiscal")
          .members,
        [],
      );
      assert.deepEqual((await snapshot()).workspace.departments, departments);
    },
  );
  await check(
    "relatórios consultam cadastro, execução e documentos sem gravar e revalidam concessões",
    async () => {
      const filters = {
        id: "reconciliation",
        scope: "all",
        dateBasis: "competence",
        competence: evidenceTask.competence,
        companyId: evidenceTask.companyId,
      };
      const before = await snapshot();
      await api("post", "/reports/query", undefined, filters).expect(401);
      await api("post", "/reports/query", operatorToken, filters).expect(403);
      await api("post", "/reports/query", adminToken, {
        ...filters,
        tenantId: "tenant-onboarding-b",
      }).expect(400);
      const result = (
        await api("post", "/reports/query", adminToken, filters).expect(201)
      ).body;
      const row = result.rows.find((entry) => entry.taskId === evidenceTask.id);
      assert.ok(row);
      assert.equal(row.cells.documents, 2);
      assert.equal(row.companyId, evidenceTask.companyId);
      assert.ok(
        result.rows.every(
          (entry) => entry.companyId === evidenceTask.companyId,
        ),
      );
      const registration = (
        await api("post", "/reports/query", adminToken, {
          id: "new-companies",
          scope: "all",
          dateBasis: "recordedAt",
          companyId: evidenceTask.companyId,
        }).expect(201)
      ).body;
      assert.equal(registration.total, 1);
      assert.equal(registration.rows[0].companyId, evidenceTask.companyId);
      const after = await snapshot();
      assert.deepEqual(after.tasks, before.tasks);
      assert.deepEqual(after.companies, before.companies);
      assert.deepEqual(after.audit, before.audit);
      const current = (
        await ownerPool.query(
          "SELECT payload FROM portal.users WHERE tenant_id=$1 AND id=$2",
          [operator.tenantId, operator.userId],
        )
      ).rows[0].payload;
      const original = current.permissions;
      try {
        await api("patch", `/users/${operator.userId}`, adminToken, {
          permissions: [...original, "reports.view"],
        }).expect(200);
        const own = (
          await api("post", "/reports/query", operatorToken, {
            id: "pending",
            scope: "all",
            dateBasis: "competence",
          }).expect(201)
        ).body;
        const allowed = (await store.snapshot(operator)).tasks;
        assert.ok(
          own.rows.every((entry) =>
            allowed.some((task) => task.id === entry.taskId),
          ),
        );
        await api("post", "/reports/query", operatorToken, {
          id: "productivity",
          scope: "all",
          dateBasis: "competence",
        }).expect(403);
        await api("post", "/reports/query", operatorToken, {
          id: "pending",
          scope: "department",
          department: "Contábil",
          dateBasis: "competence",
        }).expect(403);
        await api("patch", `/users/${operator.userId}`, adminToken, {
          permissions: original,
        }).expect(200);
        await api("post", "/reports/query", operatorToken, filters).expect(403);
      } finally {
        await api("patch", `/users/${operator.userId}`, adminToken, {
          permissions: original,
        }).expect(200);
      }
    },
  );
  for (const [index, status] of [
    "in_progress",
    "waiting",
    "in_review",
  ].entries()) {
    await restartTestApi();
    await check(
      `proposta aprovada e 12 tomadas concorrentes preservam tarefa ${status}, documentos e autoria`,
      async () => {
        const fixture = (
          await api("post", "/companies", adminToken, {
            ...newCompany(60 + index),
            responsibilities: {
              Fiscal: { mode: "person", userId: operator.userId },
              Contábil: { mode: "none" },
              Pessoal: { mode: "none" },
            },
          }).expect(201)
        ).body;
        let task = (
          await api("post", "/tasks", adminToken, {
            title: `Conferência da fila ${status}`,
            description: "Verificação isolada de transferência concorrente",
            companyId: fixture.id,
            department: "Fiscal",
            internalDue: "2026-10-25",
            legalDue: "2026-10-30",
            assigneeId: operator.userId,
            requiresReview: true,
          }).expect(201)
        ).body;
        task = await command(task, operatorToken, "start");
        const steps =
          status === "in_review" ? task.steps : task.steps.slice(0, 1);
        for (const step of steps)
          task = await command(task, operatorToken, "step", {
            stepId: step.id,
            completed: true,
          });
        task = await evidence(task, operatorToken, `fila-${status}.pdf`);
        task = (
          await api("post", `/tasks/${task.id}/comments`, operatorToken, {
            expectedRevision: task.revision,
            text: "Execução e documentos devem acompanhar a mudança de responsável.",
          }).expect(201)
        ).body;
        if (status === "waiting")
          task = await command(task, operatorToken, "wait", {
            reason: "Aguardando retorno fictício do cliente",
          });
        if (status === "in_review")
          task = await command(task, operatorToken, "submit");
        assert.equal(task.status, status);
        const before = structuredClone(task);
        const currentCompany = await companyOf(fixture.id);
        const proposal = (
          await api("post", "/companies/change-proposals", adminToken, {
            companyId: fixture.id,
            expectedRevision: currentCompany.revision,
            patch: { responsibilities: { Fiscal: { mode: "department" } } },
            effectiveCompetence: task.competence,
            transferOpenTasks: true,
            reason: "Devolver a execução à fila sem perder histórico",
          }).expect(201)
        ).body;
        const decisions = await Promise.all(
          Array.from({ length: 8 }, () =>
            api(
              "post",
              `/company-change-proposals/${proposal.id}/decision`,
              adminToken,
              {
                expectedRevision: proposal.revision,
                decision: "approve",
              },
            ),
          ),
        );
        assert.equal(
          decisions.filter((result) => result.status === 201).length,
          1,
        );
        assert.equal(
          decisions.filter((result) => result.status === 409).length,
          7,
        );
        task = await taskOf(task.id);
        assert.equal(task.assigneeId, "department:Fiscal");
        assert.equal(task.status, before.status);
        assert.deepEqual(task.steps, before.steps);
        assert.deepEqual(task.documents, before.documents);
        assert.deepEqual(task.comments, before.comments);
        assert.deepEqual(task.executionActorIds, before.executionActorIds);
        assert.equal(task.startedAt, before.startedAt);
        const claimRevision = task.revision;
        const claimAuditBefore = (await snapshot()).audit.filter(
          (entry) =>
            entry.taskId === task.id &&
            entry.action === "Tarefa assumida da fila",
        ).length;
        const claims = await Promise.all(
          Array.from({ length: 12 }, (_, claimant) =>
            api(
              "post",
              `/tasks/${task.id}/actions`,
              claimant % 2 ? adminToken : operatorToken,
              {
                type: "start",
                expectedRevision: claimRevision,
              },
            ),
          ),
        );
        const winners = claims.filter((result) => result.status === 201);
        assert.equal(winners.length, 1);
        assert.ok(
          claims
            .filter((result) => result.status !== 201)
            .every((result) => [404, 409].includes(result.status)),
        );
        task = await taskOf(task.id);
        assert.equal(task.revision, claimRevision + 1);
        assert.equal(task.assigneeId, winners[0].body.assigneeId);
        assert.equal(task.status, before.status);
        assert.deepEqual(task.steps, before.steps);
        assert.deepEqual(task.documents, before.documents);
        assert.deepEqual(task.comments, before.comments);
        assert.deepEqual(task.executionActorIds, before.executionActorIds);
        assert.equal(task.executorId, before.executorId);
        assert.equal(task.startedAt, before.startedAt);
        assert.equal(
          (await snapshot()).audit.filter(
            (entry) =>
              entry.taskId === task.id &&
              entry.action === "Tarefa assumida da fila",
          ).length,
          claimAuditBefore + 1,
        );
        const download = await api(
          "get",
          `/tasks/${task.id}/documents/${task.documents[0].id}/download`,
          adminToken,
        ).expect(200);
        assert.deepEqual(download.body, Buffer.from(demoPdf()));
        const ownerToken =
          task.assigneeId === admin.userId ? adminToken : operatorToken;
        if (task.status === "waiting")
          task = await command(task, ownerToken, "resume");
        if (task.status !== "in_review") {
          for (const step of task.steps.filter((item) => !item.completed))
            task = await command(task, ownerToken, "step", {
              stepId: step.id,
              completed: true,
            });
          task = await command(task, ownerToken, "submit");
        }
        task = await command(task, reviewerToken, "approve");
        assert.equal(task.status, "done");
        assert.deepEqual(task.documents, before.documents);
        const delivered = (
          await api("post", "/reports/query", adminToken, {
            id: "deliveries",
            scope: "all",
            dateBasis: "competence",
            competence: task.competence,
            companyId: fixture.id,
          }).expect(201)
        ).body;
        assert.equal(delivered.total, 1);
        assert.equal(delivered.rows[0].taskId, task.id);
        assert.equal(delivered.rows[0].companyId, fixture.id);
      },
    );
  }
  await check(
    "todos os 32 relatórios consultam dados conectados sem gravar e negam departamento externo",
    async () => {
      await restartTestApi();
      const before = await snapshot();
      assert.equal(REPORT_DEFINITIONS.length, 32);
      const companyIds = new Set(before.companies.map((item) => item.id));
      const taskIds = new Set(before.tasks.map((item) => item.id));
      for (const definition of REPORT_DEFINITIONS) {
        const filters = {
          id: definition.id,
          scope: "all",
          dateBasis: definition.dateBasis,
        };
        const result = (
          await api("post", "/reports/query", adminToken, filters).expect(201)
        ).body;
        assert.equal(result.id, definition.id);
        assert.equal(result.total, result.rows.length);
        assert.ok(result.columns.length > 0);
        assert.equal(
          new Set(result.columns.map((column) => column.key)).size,
          result.columns.length,
        );
        for (const row of result.rows) {
          if (row.companyId) assert.ok(companyIds.has(row.companyId));
          if (row.taskId) assert.ok(taskIds.has(row.taskId));
          assert.ok(
            Object.values(row.cells).every(
              (cell) =>
                typeof cell === "string" ||
                (typeof cell === "number" && Number.isFinite(cell)),
            ),
          );
        }
        await api("post", "/reports/query", adminToken, {
          ...filters,
          scope: "department",
          department: "Outside-report-scope",
        }).expect(403);
        if (definition.supports.company) {
          const empty = (
            await api("post", "/reports/query", adminToken, {
              ...filters,
              companyId: "company-does-not-exist",
            }).expect(201)
          ).body;
          assert.ok(empty.rows.every((row) => !row.companyId));
        }
      }
      const after = await snapshot();
      assert.deepEqual(after, before);
    },
  );
  await check(
    "RLS isola os novos registros e nova conexão preserva progresso",
    async () => {
      const before = await snapshot();
      const foreignActor = { ...admin, tenantId: "tenant-onboarding-b" };
      assert.deepEqual(
        (await store.snapshot(foreignActor)).departmentFlows,
        [],
      );
      const connection = await store.pool.connect();
      try {
        await connection.query("BEGIN READ ONLY");
        await connection.query(
          "SELECT set_config('portal.tenant_id',$1,true)",
          [foreignActor.tenantId],
        );
        for (const table of [
          "department_flows",
          "company_onboardings",
          "workspace_settings",
          "company_change_proposals",
        ])
          assert.equal(
            (
              await connection.query(
                `SELECT id FROM portal.${table} WHERE tenant_id=$1`,
                [admin.tenantId],
              )
            ).rowCount,
            0,
          );
        await connection.query("ROLLBACK");
      } finally {
        connection.release();
      }
      await store.close();
      store = new PostgresPortalStore(
        new pg.Pool({ connectionString: connectionUrl(), max: 4 }),
        () => DEMO_NOW,
      );
      assert.deepEqual(
        (await snapshot()).companyOnboardings,
        before.companyOnboardings,
      );
      assert.deepEqual(
        (await snapshot()).departmentFlows,
        before.departmentFlows,
      );
      assert.deepEqual((await snapshot()).workspace, before.workspace);
      assert.deepEqual(
        (await snapshot()).changeProposals,
        before.changeProposals,
      );
      assert.deepEqual(
        (await taskOf(evidenceTask.id)).comments,
        evidenceTask.comments,
      );
      assert.deepEqual(
        (await taskOf(evidenceTask.id)).documents,
        evidenceTask.documents,
      );
    },
  );
  await check(
    "exportação e restauração preservam modelos, implantação e vínculos de tarefa",
    async () => {
      const bundle = await exportData(ownerPool);
      assert.ok(bundle.state.departmentFlows.length);
      assert.ok(bundle.state.companyOnboardings.length);
      await importData(restorePool, bundle);
      const restored = new PostgresPortalStore(
        new pg.Pool({
          connectionString: connection(runtimeUrl, databases[1]),
          max: 1,
        }),
        () => DEMO_NOW,
      );
      try {
        const data = await restored.snapshot(admin);
        const original = await snapshot();
        assert.deepEqual(data.departmentFlows, original.departmentFlows);
        assert.deepEqual(data.companyOnboardings, original.companyOnboardings);
        assert.deepEqual(data.workspace, original.workspace);
        assert.deepEqual(data.changeProposals, original.changeProposals);
        assert.deepEqual(data.companies, original.companies);
        assert.deepEqual(
          data.tasks.find((t) => t.id === evidenceTask.id),
          original.tasks.find((t) => t.id === evidenceTask.id),
        );
        assert.deepEqual(
          new Set(data.tasks.map((t) => t.id)),
          new Set(original.tasks.map((t) => t.id)),
        );
      } finally {
        await restored.close();
      }
    },
  );
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = String(error.message).replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    "[conexão privada]",
  );
  console.error("Verificação falhou:", report.failure);
  process.exitCode = 1;
} finally {
  await app?.close();
  await store?.close();
  await ownerPool?.end();
  await restorePool?.end();
  for (const database of [...created].reverse()) {
    assert.ok(/^apice_onboarding_(?:restore_)?[a-f0-9]{12}$/.test(database));
    assert.notEqual(database, migrationUrl.pathname.slice(1));
    assert.notEqual(database, runtimeUrl.pathname.slice(1));
    await adminPool.query(
      `DROP DATABASE ${pg.escapeIdentifier(database)} WITH (FORCE)`,
    );
  }
  await adminPool.end();
  report.finishedAt = new Date().toISOString();
  mkdirSync(path.join(root, ".local", "verification"), { recursive: true });
  writeFileSync(
    path.join(root, ".local", "verification", "department-flows.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Resultado: ${report.status}; ${report.checks.length} cenários; bases temporárias removidas.`,
  );
}
function connectionUrl() {
  return connection(runtimeUrl);
}
