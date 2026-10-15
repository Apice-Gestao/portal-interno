import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import {
  createSeed,
  PERMISSIONS,
  TV_BLOCKS,
  TV_DEFAULT_BLOCKS,
} from "../packages/domain/dist/index.js";
import { createApplication } from "../apps/api/dist/bootstrap.js";
import { seedDatabase } from "../apps/api/dist/database/postgres-store.js";
import { migrateDatabase } from "../apps/api/dist/database/migrations.js";
import {
  exportData,
  importData,
} from "../apps/api/dist/database/data-transfer.js";
import { hashPassword } from "../apps/api/dist/security/password.js";

// Synthetic identities in disposable databases; this suite does not verify MFA.
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const migration = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
const runtime = new URL(process.env.DATABASE_URL ?? "");
for (const url of [migration, runtime]) {
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.port, "55432");
}
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const database = `apice_tv_${suffix}`,
  restored = `apice_tv_restore_${suffix}`;
const dbUrl = (url, name) => {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.href;
};
const adminPool = new pg.Pool({
  connectionString: dbUrl(migration, "postgres"),
  max: 1,
});
const created = [],
  report = {
    scope: "TV: PostgreSQL/API isolados; não valida login/MFA.",
    checks: [],
  };
let ownerPool, restoredPool, app, http, device, cookie, firstCode;
let adminToken, managerToken, readerToken, configToken;
process.env.NODE_ENV = "development";
process.env.PORTAL_STORAGE = "postgres";
process.env.DATABASE_URL = dbUrl(runtime, database);
process.env.PORTAL_TENANT_ID = "apice-demo";
process.env.ENABLE_DEMO_SESSIONS = "true";
process.env.ENABLE_LOCAL_TEST_LOGIN = "false";
process.env.MAIL_DELIVERY = "disabled";
const state = createSeed();
state.users = state.users.map((u) => ({
  ...u,
  active: true,
  permissions:
    u.userId === "helena"
      ? [...PERMISSIONS]
      : u.userId === "julia"
        ? ["tv.view", "tv.manage", "tv.configure", "tv.team.view"]
        : u.userId === "marina"
          ? ["tv.view"]
          : u.userId === "rafael"
            ? ["tv.view", "tv.configure"]
            : [],
}));
const foreign = structuredClone(state);
state.users.push(
  {
    ...state.users[0],
    userId: "tv-contabil",
    name: "Colaborador Contábil Teste",
    departments: ["Contábil"],
    permissions: [],
    active: true,
  },
  {
    ...state.users[0],
    userId: "tv-pessoal",
    name: "Colaborador Pessoal Teste",
    departments: ["Pessoal"],
    permissions: [],
    active: true,
  },
  {
    ...state.users[0],
    userId: "tv-inactive",
    name: "Conta Inativa Teste",
    permissions: [],
    active: false,
  },
  {
    ...state.users[0],
    userId: "tv-disabled-credential",
    name: "Credencial Inativa Teste",
    permissions: [],
    active: true,
  },
);
foreign.users.forEach((user) => {
  user.name = `Outro tenant ${user.name}`;
});
for (const key of ["users", "companies", "templates", "tasks", "audit"]) {
  foreign[key].forEach((row) => {
    row.tenantId = "tv-foreign";
  });
  state[key].push(...foreign[key]);
}
function api(method, endpoint, token, body, credential) {
  let call = request(http)
    [method](`/api/v1${endpoint}`)
    .set("Host", "127.0.0.1");
  if (token) call = call.set("Authorization", `Bearer ${token}`);
  if (body) call = call.send(body);
  if (credential) call = call.set("Cookie", credential);
  return call;
}
async function check(name, action) {
  await action();
  report.checks.push(name);
  console.log(`✓ ${name}`);
}
async function sql(tenant, action) {
  const client = await ownerPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
      tenant,
    ]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function issueCode() {
  const result = await api(
    "post",
    `/tv-devices/${device.id}/pair-code`,
    adminToken,
  ).expect(201);
  device = (await api("get", "/tv-devices", adminToken).expect(200)).body.find(
    (row) => row.id === device.id,
  );
  return result.body.code;
}
async function pair(code) {
  const result = await api("post", "/tv/pair", undefined, { code }).expect(201);
  assert.deepEqual(result.body, { paired: true });
  const header = result.headers["set-cookie"][0];
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Path=\/api\/v1\/tv/);
  return header.split(";")[0];
}
try {
  await adminPool.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  created.push(database);
  ownerPool = new pg.Pool({
    connectionString: dbUrl(migration, database),
    max: 2,
  });
  await migrateDatabase(ownerPool, runtime.username);
  const passwordHash = await hashPassword("SyntheticTvFixtureOnly123!");
  await seedDatabase(ownerPool, state, new Map(), {
    credentials: state.users.map((u) => ({
      tenant_id: u.tenantId,
      user_id: u.userId,
      login: `fixture-${u.userId}`,
      email: null,
      email_verified: false,
      password_hash: passwordHash,
      active: u.userId !== "tv-disabled-credential",
      must_change_password: false,
      password_version: "1",
      updated_at: new Date().toISOString(),
    })),
  });
  app = await createApplication();
  http = app.getHttpServer();
  const login = async (id) =>
    (await api("post", "/demo-session", undefined, { userId: id }).expect(201))
      .body.token;
  adminToken = await login("helena");
  managerToken = await login("julia");
  readerToken = await login("marina");
  configToken = await login("rafael");
  await check(
    "cadastro verifica concessões, departamento e campos confiáveis",
    async () => {
      const input = {
        name: "TV Fiscal de teste",
        departments: ["Fiscal"],
        competence: "2026-09",
      };
      await api("post", "/tv-devices", undefined, input).expect(401);
      await api("post", "/tv-devices", readerToken, input).expect(403);
      await api("post", "/tv-devices", managerToken, {
        ...input,
        departments: ["Contábil"],
      }).expect(403);
      await api("post", "/tv-devices", managerToken, {
        ...input,
        tenantId: "tv-foreign",
      }).expect(400);
      device = (
        await api("post", "/tv-devices", managerToken, input).expect(201)
      ).body;
      assert.equal(device.showNames, false);
      assert.equal(device.active, true);
      assert.equal(device.version, 1);
      assert.equal(device.tenantId, "apice-demo");
      assert.deepEqual(device.blocks, TV_DEFAULT_BLOCKS);
      assert.ok(
        !JSON.stringify(device).match(
          /pair_hash|token_hash|password|credential/,
        ),
      );
    },
  );
  await check(
    "prévia consolida os três departamentos e toda a equipe ativa, sem ampliar escopos restritos",
    async () => {
      const consolidated = (
        await api("get", "/tv/preview?competence=2026-09", adminToken).expect(
          200,
        )
      ).body;
      assert.deepEqual(consolidated.device.departments, [
        "Fiscal",
        "Contábil",
        "Pessoal",
      ]);
      assert.equal(
        consolidated.total,
        state.tasks.filter(
          (task) =>
            task.tenantId === "apice-demo" && task.competence === "2026-09",
        ).length,
      );
      assert.equal(consolidated.collaborators.length, 7);
      for (const name of [
        "Colaborador Contábil Teste",
        "Colaborador Pessoal Teste",
      ]) {
        const person = consolidated.collaborators.find(
          (row) => row.name === name,
        );
        assert.ok(person);
        assert.equal(person.total, 0);
        assert.equal(person.percent, 0);
      }
      const text = JSON.stringify(consolidated);
      for (const hidden of [
        "Outro tenant",
        "Conta Inativa Teste",
        "Credencial Inativa Teste",
        '"email"',
        '"userId"',
        '"permissions"',
      ])
        assert.ok(!text.includes(hidden), hidden);
      const restricted = (
        await api("get", "/tv/preview?competence=2026-09", managerToken).expect(
          200,
        )
      ).body;
      assert.deepEqual(restricted.device.departments, ["Fiscal"]);
      assert.equal(
        restricted.total,
        state.tasks.filter(
          (task) =>
            task.tenantId === "apice-demo" &&
            task.competence === "2026-09" &&
            task.department === "Fiscal",
        ).length,
      );
      assert.equal(restricted.collaborators.length, 5);
      assert.ok(
        restricted.collaborators.every(
          (person) =>
            person.departments.length === 1 &&
            person.departments[0] === "Fiscal",
        ),
      );
      assert.ok(
        !JSON.stringify(restricted).includes("Colaborador Contábil Teste"),
      );
      const anonymous = (
        await api("get", "/tv/preview?competence=2026-09", readerToken).expect(
          200,
        )
      ).body;
      assert.deepEqual(anonymous.collaborators, []);
      assert.ok(
        anonymous.upcoming.every((row) => row.responsibleLabel === "Equipe"),
      );
      assert.ok(!JSON.stringify(anonymous).includes("Júlia Martins"));
      await sql("apice-demo", (c) =>
        c.query(
          "UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}',(payload->'permissions')-'tv.team.view') WHERE id='julia'",
        ),
      );
      await api(
        "post",
        `/tv-devices/${device.id}/pair-code`,
        managerToken,
      ).expect(403);
      await sql("apice-demo", (c) =>
        c.query(
          "UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}',(payload->'permissions') || '[\"tv.team.view\"]'::jsonb) WHERE id='julia'",
        ),
      );
    },
  );
  await check(
    "configuração e ativação têm capacidades distintas; concorrência retorna 200/409",
    async () => {
      await api("patch", `/tv-devices/${device.id}`, readerToken, {
        expectedVersion: device.version,
        showNames: true,
      }).expect(403);
      await api("patch", `/tv-devices/${device.id}`, configToken, {
        expectedVersion: device.version,
        active: false,
      }).expect(403);
      const changes = await Promise.all([
        api("patch", `/tv-devices/${device.id}`, managerToken, {
          expectedVersion: device.version,
          rotationSeconds: 8,
        }),
        api("patch", `/tv-devices/${device.id}`, adminToken, {
          expectedVersion: device.version,
          rotationSeconds: 9,
        }),
      ]);
      assert.deepEqual(changes.map((row) => row.status).sort(), [200, 409]);
      device = changes.find((row) => row.status === 200).body;
      await api("patch", `/tv-devices/${device.id}`, adminToken, {
        expectedVersion: 1,
        rotationSeconds: 10,
      }).expect(409);
      await api("patch", `/tv-devices/${device.id}`, adminToken, {
        expectedVersion: device.version,
        blocks: [],
      }).expect(400);
    },
  );
  await check(
    "pareamento tem hash e uso único; credencial fica apenas em cookie protegido",
    async () => {
      firstCode = await issueCode();
      assert.match(firstCode, /^[A-Z0-9]{10}$/);
      const row = await sql(
        "apice-demo",
        async (c) =>
          (
            await c.query(
              "SELECT pair_hash FROM portal.tv_devices WHERE id=$1",
              [device.id],
            )
          ).rows[0],
      );
      assert.notEqual(row.pair_hash, firstCode);
      assert.equal(row.pair_hash.length, 64);
      cookie = await pair(firstCode);
      await api("post", "/tv/pair", undefined, { code: firstCode }).expect(401);
      await api("get", "/tv/watch").expect(401);
    },
  );
  await check(
    "TV recebe somente DTO sanitizado e não acessa APIs pessoais",
    async () => {
      const feed = (
        await api("get", "/tv/watch", undefined, undefined, cookie)
          .set("X-Tenant-Id", "tv-foreign")
          .expect(200)
      ).body;
      const serialized = JSON.stringify(feed);
      assert.ok(feed.total > 0);
      assert.equal(feed.device.competence, "2026-09");
      for (const field of [
        "cnpj",
        "assigneeId",
        "tenantId",
        "companyId",
        "executionActorIds",
        "documents",
        "audit",
        "password",
        "token_hash",
      ])
        assert.ok(!serialized.includes(`"${field}"`), field);
      for (const item of [...feed.upcoming, ...feed.deliveries])
        assert.match(item.companyLabel, /^Empresa /);
      assert.equal(
        Object.values(feed.deadlines).reduce((sum, count) => sum + count, 0),
        feed.total,
      );
      await api("get", "/snapshot", undefined, undefined, cookie).expect(401);
      await api(
        "post",
        "/tasks",
        undefined,
        { title: "Unauthorized" },
        cookie,
      ).expect(401);
      await api("get", "/tv/watch", undefined, undefined, cookie)
        .set("Origin", "https://evil.example")
        .expect(403);
    },
  );
  await check(
    "bloco de equipe é configurável e nomes de empresas continuam opcionais",
    async () => {
      const feed = (
        await api("get", "/tv/watch", undefined, undefined, cookie).expect(200)
      ).body;
      assert.equal(feed.collaborators.length, 5);
      assert.ok(
        feed.upcoming.every(
          (item) =>
            item.department === "Fiscal" &&
            typeof item.responsibleLabel === "string",
        ),
      );
      device = (
        await api("patch", `/tv-devices/${device.id}`, adminToken, {
          expectedVersion: device.version,
          blocks: ["progress"],
        }).expect(200)
      ).body;
      const hidden = (
        await api("get", "/tv/watch", undefined, undefined, cookie).expect(200)
      ).body;
      assert.deepEqual(hidden.collaborators, []);
      assert.deepEqual(hidden.upcoming, []);
      assert.deepEqual(hidden.deliveries, []);
      assert.ok(!JSON.stringify(hidden).includes("Júlia Martins"));
      await api("patch", `/tv-devices/${device.id}`, configToken, {
        expectedVersion: device.version,
        blocks: ["progress", "collaborators"],
      }).expect(403);
      device = (
        await api("patch", `/tv-devices/${device.id}`, adminToken, {
          expectedVersion: device.version,
          blocks: [...TV_BLOCKS],
        }).expect(200)
      ).body;
      assert.equal(device.blocks.length, 6);
    },
  );
  await check(
    "nomes de empresas exigem configuração e acesso humano é revalidado no banco",
    async () => {
      device = (
        await api("patch", `/tv-devices/${device.id}`, configToken, {
          expectedVersion: device.version,
          showNames: true,
        }).expect(200)
      ).body;
      const feed = (
        await api("get", "/tv/watch", undefined, undefined, cookie).expect(200)
      ).body;
      assert.ok(
        feed.upcoming.some((item) => !item.companyLabel.startsWith("Empresa ")),
      );
      assert.equal(
        (
          await api(
            "get",
            "/tv/preview?competence=2026-09&department=Fiscal",
            readerToken,
          ).expect(200)
        ).body.device.showNames,
        false,
      );
      await api(
        "get",
        "/tv/preview?competence=2026-09&department=Cont%C3%A1bil",
        readerToken,
      ).expect(403);
      await sql("apice-demo", (c) =>
        c.query(
          "UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}','[]') WHERE id='marina'",
        ),
      );
      await api("get", "/tv-devices", readerToken).expect(403);
    },
  );
  await check(
    "novo código, expiração e desativação revogam a identidade anterior",
    async () => {
      const expired = await issueCode();
      await api("get", "/tv/watch", undefined, undefined, cookie).expect(401);
      await sql("apice-demo", (c) =>
        c.query(
          "UPDATE portal.tv_devices SET pair_expires_at=now()-interval '1 minute' WHERE id=$1",
          [device.id],
        ),
      );
      await api("post", "/tv/pair", undefined, { code: expired }).expect(401);
      cookie = await pair(await issueCode());
      device = (
        await api("patch", `/tv-devices/${device.id}`, adminToken, {
          expectedVersion: device.version,
          active: false,
        }).expect(200)
      ).body;
      await api("get", "/tv/watch", undefined, undefined, cookie).expect(401);
      await api(
        "post",
        `/tv-devices/${device.id}/pair-code`,
        adminToken,
      ).expect(409);
      device = (
        await api("patch", `/tv-devices/${device.id}`, adminToken, {
          expectedVersion: device.version,
          active: true,
        }).expect(200)
      ).body;
      await api("get", "/tv/watch", undefined, undefined, cookie).expect(401);
    },
  );
  await check(
    "RLS isola tenants e auditoria não contém códigos ou credenciais",
    async () => {
      const pool = new pg.Pool({
          connectionString: dbUrl(runtime, database),
          max: 1,
        }),
        c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          "SELECT set_config('portal.tenant_id','tv-foreign',true)",
        );
        assert.equal(
          (
            await c.query("SELECT id FROM portal.tv_devices WHERE id=$1", [
              device.id,
            ])
          ).rowCount,
          0,
        );
        await c.query("ROLLBACK");
      } finally {
        c.release();
        await pool.end();
      }
      const audit = JSON.stringify(
        await sql(
          "apice-demo",
          async (c) =>
            (
              await c.query(
                "SELECT payload FROM portal.audit WHERE tenant_id='apice-demo'",
              )
            ).rows,
        ),
      );
      assert.ok(!audit.includes(firstCode));
      assert.ok(!audit.includes(cookie));
      assert.ok(!audit.includes("pair_hash"));
    },
  );
  await check(
    "configurações são migráveis; exportação não transporta credenciais da TV",
    async () => {
      const bundle = await exportData(ownerPool);
      assert.equal(bundle.tvDevices.length, 1);
      assert.ok(!JSON.stringify(bundle.tvDevices).includes("hash"));
      await adminPool.query(`CREATE DATABASE ${pg.escapeIdentifier(restored)}`);
      created.push(restored);
      restoredPool = new pg.Pool({
        connectionString: dbUrl(migration, restored),
        max: 1,
      });
      await migrateDatabase(restoredPool, runtime.username);
      const invalidBundle = structuredClone(bundle);
      invalidBundle.tvDevices[0].id = "not-a-database-uuid";
      await assert.rejects(
        importData(restoredPool, invalidBundle),
        /Identificador de dispositivo/,
      );
      assert.equal(
        (
          await restoredPool.query(
            "SELECT count(*)::integer AS total FROM portal.tenants",
          )
        ).rows[0].total,
        0,
      );
      await importData(restoredPool, bundle);
      const saved = (
        await restoredPool.query(
          "SELECT payload,pair_hash,token_hash FROM portal.tv_devices",
        )
      ).rows[0];
      assert.deepEqual(saved.payload, device);
      assert.equal(saved.token_hash, null);
      assert.equal(saved.pair_hash, null);
    },
  );
  await check("desconexão revoga a sessão do dispositivo", async () => {
    cookie = await pair(await issueCode());
    await api("post", "/tv/disconnect", undefined, undefined, cookie).expect(
      201,
    );
    await api("get", "/tv/watch", undefined, undefined, cookie).expect(401);
  });
  await check(
    "limite de tentativas inclui códigos malformados antes de validar o corpo",
    async () => {
      const rateApp = await createApplication();
      try {
        for (let i = 1; i <= 11; i++)
          await request(rateApp.getHttpServer())
            .post("/api/v1/tv/pair")
            .set("Host", "127.0.0.1")
            .send({ code: "?" })
            .expect(i <= 10 ? 400 : 429);
      } finally {
        await rateApp.close();
      }
    },
  );
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.message;
  console.error("Verificação TV falhou:", error.message);
  process.exitCode = 1;
} finally {
  await app?.close();
  await ownerPool?.end();
  await restoredPool?.end();
  for (const name of created.reverse()) {
    assert.ok(/^apice_tv_(restore_)?[a-f0-9]{12}$/.test(name));
    assert.notEqual(name, migration.pathname.slice(1));
    await adminPool.query(
      `DROP DATABASE ${pg.escapeIdentifier(name)} WITH (FORCE)`,
    );
  }
  await adminPool.end();
  mkdirSync(path.join(root, ".local", "verification"), { recursive: true });
  writeFileSync(
    path.join(root, ".local", "verification", "tv.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `TV: ${report.status}; ${report.checks.length} cenários. Bases temporárias removidas.`,
  );
}
