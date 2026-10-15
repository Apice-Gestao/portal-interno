import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AccountUser, Actor, Snapshot, Task } from "@apice/domain";

// Credenciais sintéticas usadas somente no banco temporário criado pelo harness.
const ADMIN_TEMPORARY_PASSWORD = "TemporaryTest2026!";
const ADMIN_PASSWORD = "UpdatedTest2026!";
const OPERATOR_TEMPORARY_PASSWORD = "OperatorTemporary2026!";
const OPERATOR_PASSWORD = "OperatorUpdated2026!";
const SUPERVISOR_TEMPORARY_PASSWORD = "SupervisorTemporary2026!";
const SUPERVISOR_PASSWORD = "SupervisorUpdated2026!";
const OPERATOR_NAME = "Operador de teste";
const SUPERVISOR_NAME = "Supervisor de teste";
type Session = { token: string; actor: Actor; mustChangePassword: boolean };

async function login(page: Page, username: string, password: string) {
  await page.goto("/#/tarefas");
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith("/api/v1/login") &&
      result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(201);
  return (await result.json()) as Session;
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(
    page.getByRole("heading", { name: "Defina sua senha" }),
  ).toBeVisible();
  await page.getByLabel("Senha atual", { exact: true }).fill(current);
  await page.getByLabel("Nova senha", { exact: true }).fill(next);
  await page.getByLabel("Confirme a nova senha", { exact: true }).fill(next);
  await page
    .getByRole("button", { name: "Salvar nova senha", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Defina sua senha" }),
  ).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
}

async function createAccount(
  page: Page,
  name: string,
  username: string,
  password: string,
  role: "operator" | "supervisor",
) {
  await page.getByRole("button", { name: "Novo usuário", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Novo usuário",
    exact: true,
  });
  await dialog.getByLabel("Nome completo", { exact: true }).fill(name);
  await dialog.getByLabel("Usuário de acesso", { exact: true }).fill(username);
  await dialog
    .getByLabel("Tipo de usuário", { exact: true })
    .selectOption(role);
  await dialog.getByLabel("Senha temporária", { exact: true }).fill(password);
  await dialog.getByRole("checkbox", { name: "Fiscal", exact: true }).check();
  await dialog
    .getByRole("checkbox", { name: "Acessar tarefas", exact: true })
    .check();
  if (role === "operator") {
    for (const label of [
      "Executar e marcar andamento",
      "Anexar evidências",
      "Baixar evidências das tarefas",
    ])
      await dialog.getByRole("checkbox", { name: label, exact: true }).check();
    for (const label of [
      "Criar tarefas",
      "Acessar configurações",
      "Gerenciar usuários e permissões",
    ])
      await expect(
        dialog.getByRole("checkbox", { name: label, exact: true }),
      ).toBeVisible();
  } else {
    for (const label of [
      "Acessar visão geral",
      "Criar tarefas",
      "Redistribuir, dispensar e reabrir",
      "Executar e marcar andamento",
    ])
      await dialog.getByRole("checkbox", { name: label, exact: true }).check();
    await expect(
      dialog.getByRole("checkbox", {
        name: "Gerenciar usuários e permissões",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("checkbox", {
        name: "Ver tarefas de toda a equipe",
        exact: true,
      })
      .check();
  }
  await dialog
    .getByRole("button", { name: "Criar usuário", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("table")).toContainText(name);
}

test("sem sessão o portal exige login e não exibe ações internas; erro de senha é genérico", async ({
  page,
}) => {
  await page.goto("/#/tarefas");
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nova tarefa", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Usuário", { exact: true }).fill("conta-inexistente");
  await page.getByLabel("Senha", { exact: true }).fill("SenhaInvalida2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Usuário ou senha inválidos.",
  );
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("administrador configura abas e ações; operador executa apenas suas tarefas; revogação vale na API e interface", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const admin = await login(page, "teste-admin", ADMIN_TEMPORARY_PASSWORD);
  expect(admin.mustChangePassword).toBe(true);
  const adminHeaders = { Authorization: `Bearer ${admin.token}` };
  expect(
    (
      await page.request.get("/api/v1/snapshot", { headers: adminHeaders })
    ).status(),
  ).toBe(403);
  await changePassword(page, ADMIN_TEMPORARY_PASSWORD, ADMIN_PASSWORD);
  await page
    .getByRole("link", { name: "Usuários e permissões", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Usuários e permissões",
  );
  await createAccount(
    page,
    OPERATOR_NAME,
    "teste-operador",
    OPERATOR_TEMPORARY_PASSWORD,
    "operator",
  );
  await createAccount(
    page,
    SUPERVISOR_NAME,
    "teste-supervisor",
    SUPERVISOR_TEMPORARY_PASSWORD,
    "supervisor",
  );
  const accountsResponse = await page.request.get("/api/v1/users", {
    headers: adminHeaders,
  });
  expect(accountsResponse.status()).toBe(200);
  const accounts = (await accountsResponse.json()) as AccountUser[];
  const operator = accounts.find(
    (account) => account.username === "teste-operador",
  )!;
  const supervisor = accounts.find(
    (account) => account.username === "teste-supervisor",
  )!;
  expect(operator.permissions).toEqual(
    expect.arrayContaining([
      "tasks.view",
      "tasks.execute",
      "tasks.attach",
      "tasks.download",
    ]),
  );
  expect(operator.permissions).toHaveLength(4);
  const snapshotResponse = await page.request.get("/api/v1/snapshot", {
    headers: adminHeaders,
  });
  expect(snapshotResponse.status()).toBe(200);
  const snapshot = (await snapshotResponse.json()) as Snapshot;
  const company = snapshot.companies.find((item) => item.active)!;
  const month = snapshot.now.slice(0, 7);
  const taskInput = {
    title: "Execução do operador de teste",
    description: "Fixture isolada para autorização e andamento.",
    companyId: company.id,
    department: "Fiscal",
    internalDue: `${month}-20`,
    legalDue: `${month}-25`,
    assigneeId: operator.userId,
    requiresReview: false,
  };
  const taskResponse = await page.request.post("/api/v1/tasks", {
    headers: adminHeaders,
    data: taskInput,
  });
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()) as Task;
  const unrelatedResponse = await page.request.post("/api/v1/tasks", {
    headers: adminHeaders,
    data: {
      ...taskInput,
      title: "Tarefa exclusiva de outro empregado",
      assigneeId: supervisor.userId,
    },
  });
  expect(unrelatedResponse.status()).toBe(201);
  const unrelated = (await unrelatedResponse.json()) as Task;
  const operatorPage = await browser.newPage({
    baseURL: "http://127.0.0.1:5175",
  });
  const supervisorPage = await browser.newPage({
    baseURL: "http://127.0.0.1:5175",
  });
  operatorPage.on("pageerror", (error) => errors.push(error.message));
  supervisorPage.on("pageerror", (error) => errors.push(error.message));
  try {
    const operatorSession = await login(
      operatorPage,
      "teste-operador",
      OPERATOR_TEMPORARY_PASSWORD,
    );
    await changePassword(
      operatorPage,
      OPERATOR_TEMPORARY_PASSWORD,
      OPERATOR_PASSWORD,
    );
    const operatorHeaders = {
      Authorization: `Bearer ${operatorSession.token}`,
    };
    await expect(operatorPage.getByRole("heading", { level: 1 })).toContainText(
      "Minhas tarefas",
    );
    const navigation = operatorPage.getByRole("navigation", {
      name: "Navegação principal",
    });
    await expect(navigation.getByRole("link")).toHaveCount(1);
    await expect(
      navigation.getByRole("link", { name: /Minhas tarefas/ }),
    ).toBeVisible();
    for (const label of [
      "Nova tarefa",
      "Exportar CSV",
      "Alterar perfil de demonstração",
    ])
      await expect(
        operatorPage.getByRole("button", { name: label, exact: true }),
      ).toHaveCount(0);
    for (const label of [
      "Visão geral",
      "Empresas e carteira",
      "Modelos de tarefa",
      "Documentos",
      "Relatórios",
      "Configurações",
      "Usuários e permissões",
    ])
      await expect(
        operatorPage.getByRole("link", { name: label, exact: true }),
      ).toHaveCount(0);
    const operatorSnapshotResponse = await operatorPage.request.get(
      "/api/v1/snapshot",
      { headers: operatorHeaders },
    );
    expect(operatorSnapshotResponse.status()).toBe(200);
    const operatorSnapshot =
      (await operatorSnapshotResponse.json()) as Snapshot;
    expect(operatorSnapshot.tasks.length).toBe(1);
    expect(
      operatorSnapshot.tasks.every(
        (item) => item.assigneeId === operator.userId,
      ),
    ).toBe(true);
    expect(
      operatorSnapshot.tasks.some((item) => item.id === unrelated.id),
    ).toBe(false);
    expect(
      (
        await operatorPage.request.get("/api/v1/users", {
          headers: operatorHeaders,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await operatorPage.request.post("/api/v1/tasks", {
          headers: operatorHeaders,
          data: taskInput,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await operatorPage.request.post(
          `/api/v1/tasks/${unrelated.id}/actions`,
          {
            headers: operatorHeaders,
            data: { type: "start", expectedRevision: unrelated.revision },
          },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await operatorPage.request.post("/api/v1/demo-session", {
          data: { userId: "helena" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await operatorPage.request.get("/api/v1/snapshot", {
          headers: { Authorization: "Bearer invalid-synthetic-token" },
        })
      ).status(),
    ).toBe(401);
    await operatorPage.goto("/#/configuracoes");
    await expect(
      operatorPage.getByRole("heading", { level: 1, name: /^Configurações/ }),
    ).toHaveCount(0);
    await operatorPage.goto("/#/tarefas");
    await operatorPage.getByLabel("Competência", { exact: true }).fill(month);
    await operatorPage
      .getByRole("button", { name: new RegExp(`^Abrir ${task.title}`) })
      .click();
    let drawer = operatorPage.getByRole("dialog", {
      name: task.title,
      exact: true,
    });
    await drawer
      .getByRole("button", { name: "Iniciar execução", exact: true })
      .click();
    await expect(drawer.getByRole("checkbox").first()).toBeEnabled();
    await drawer.getByRole("checkbox").first().click();
    await expect(drawer.getByRole("checkbox").first()).toBeChecked();
    for (const label of [
      "Redistribuir",
      "Dispensar tarefa",
      "Aprovar entrega",
      "Reabrir tarefa",
    ])
      await expect(
        drawer.getByRole("button", { name: label, exact: true }),
      ).toHaveCount(0);
    await drawer
      .getByRole("button", { name: "Fechar tarefa", exact: true })
      .click();

    // Revogue a ação pela gestão de usuários enquanto a sessão do operador permanece aberta.
    await page
      .getByRole("button", {
        name: `Editar usuário ${OPERATOR_NAME}`,
        exact: true,
      })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Editar usuário",
      exact: true,
    });
    await editor
      .getByRole("checkbox", {
        name: "Executar e marcar andamento",
        exact: true,
      })
      .uncheck();
    await editor
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await expect(editor).toBeHidden();
    const updatedSnapshotResponse = await operatorPage.request.get(
      "/api/v1/snapshot",
      { headers: operatorHeaders },
    );
    expect(updatedSnapshotResponse.status()).toBe(200);
    const updatedSnapshot = (await updatedSnapshotResponse.json()) as Snapshot;
    expect(updatedSnapshot.actor.permissions).not.toContain("tasks.execute");
    const started = updatedSnapshot.tasks.find((item) => item.id === task.id)!;
    expect(
      (
        await operatorPage.request.post(`/api/v1/tasks/${task.id}/actions`, {
          headers: operatorHeaders,
          data: {
            type: "step",
            expectedRevision: started.revision,
            stepId: started.steps[1].id,
            completed: true,
          },
        })
      ).status(),
    ).toBe(403);
    await expect
      .poll(
        async () =>
          await operatorPage.request
            .get("/api/v1/session", { headers: operatorHeaders })
            .then((r) => r.json())
            .then((s) => s.actor.permissions.includes("tasks.execute")),
      )
      .toBe(false);
    await operatorPage.getByLabel("Competência", { exact: true }).fill(month);
    await operatorPage
      .getByRole("button", { name: new RegExp(`^Abrir ${task.title}`) })
      .click();
    drawer = operatorPage.getByRole("dialog", {
      name: task.title,
      exact: true,
    });
    await expect(drawer.getByRole("checkbox").first()).toBeDisabled();
    await drawer
      .getByRole("button", { name: "Fechar tarefa", exact: true })
      .click();
    // O cargo não limita concessões: o administrador pode liberar criação e equipe ao operador.
    await page
      .getByRole("button", {
        name: `Editar usuário ${OPERATOR_NAME}`,
        exact: true,
      })
      .click();
    for (const label of [
      "Criar tarefas",
      "Ver tarefas de toda a equipe",
      "Acessar configurações",
      "Gerenciar usuários e permissões",
    ])
      await editor.getByRole("checkbox", { name: label, exact: true }).check();
    await editor
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await expect(editor).toBeHidden();
    await expect(
      operatorPage.getByRole("button", { name: "Nova tarefa", exact: true }),
    ).toBeVisible();
    await expect(
      operatorPage.getByRole("link", {
        name: "Usuários e permissões",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await operatorPage.request.get("/api/v1/users", {
          headers: operatorHeaders,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await operatorPage.request.post("/api/v1/tasks", {
          headers: operatorHeaders,
          data: {
            ...taskInput,
            title: "Criação concedida ao operador",
            assigneeId: supervisor.userId,
          },
        })
      ).status(),
    ).toBe(201);

    const supervisorSession = await login(
      supervisorPage,
      "teste-supervisor",
      SUPERVISOR_TEMPORARY_PASSWORD,
    );
    await changePassword(
      supervisorPage,
      SUPERVISOR_TEMPORARY_PASSWORD,
      SUPERVISOR_PASSWORD,
    );
    await expect(
      supervisorPage.getByRole("link", { name: "Visão geral", exact: true }),
    ).toBeVisible();
    await supervisorPage.goto("/#/tarefas");
    await expect(
      supervisorPage.getByRole("button", { name: "Nova tarefa", exact: true }),
    ).toBeVisible();
    await expect(
      supervisorPage.getByRole("link", {
        name: "Usuários e permissões",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await supervisorPage.request.get("/api/v1/users", {
          headers: { Authorization: `Bearer ${supervisorSession.token}` },
        })
      ).status(),
    ).toBe(403);

    // Desativação invalida a sessão existente e impede qualquer leitura operacional.
    await page
      .getByRole("button", {
        name: `Editar usuário ${OPERATOR_NAME}`,
        exact: true,
      })
      .click();
    await editor
      .getByRole("checkbox", { name: "Usuário ativo", exact: true })
      .uncheck();
    await editor
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await expect(editor).toBeHidden();
    expect(
      (
        await operatorPage.request.get("/api/v1/snapshot", {
          headers: operatorHeaders,
        })
      ).status(),
    ).toBe(401);
    await operatorPage.reload();
    await expect(
      operatorPage.getByRole("heading", { name: "Entrar", exact: true }),
    ).toBeVisible();
    await supervisorPage
      .getByRole("button", { name: "Sair", exact: true })
      .click();
    await expect(
      supervisorPage.getByRole("heading", { name: "Entrar", exact: true }),
    ).toBeVisible();
    expect(
      (
        await supervisorPage.request.get("/api/v1/snapshot", {
          headers: { Authorization: `Bearer ${supervisorSession.token}` },
        })
      ).status(),
    ).toBe(401);
    expect(errors).toEqual([]);
  } finally {
    await operatorPage.close();
    await supervisorPage.close();
  }
});
