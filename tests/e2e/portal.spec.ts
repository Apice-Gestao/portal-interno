import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { cnpjFromBase } from "@apice/domain";
import { readFile } from "node:fs/promises";

async function profile(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Alterar perfil de demonstração" })
    .click();
  await page
    .getByRole("dialog", { name: "Visualizar como" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await expect(
    page.getByRole("button", { name: "Alterar perfil de demonstração" }),
  ).toContainText(name);
}

test("execução, evidência, conferência independente e reabertura pela interface/API", async ({
  page,
}) => {
  await page.goto("/#/tarefas");
  const title = `Revisão fictícia ${Date.now()}`;
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Nova tarefa avulsa" });
  await form.getByLabel("Título", { exact: true }).fill(title);
  await form
    .getByLabel("Descrição", { exact: true })
    .fill("Validação fictícia do fluxo completo.");
  await form
    .getByRole("combobox", { name: "Empresa", exact: true })
    .selectOption({ label: "Aurora Comércio" });
  await form.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(form).toBeHidden();
  await page
    .getByRole("button", { name: new RegExp(`Abrir ${title}`) })
    .click();
  let drawer = page.getByRole("dialog", { name: title, exact: true });
  await expect(
    drawer.getByRole("button", { name: "Enviar para conferência" }),
  ).toHaveCount(0);
  await drawer.getByRole("button", { name: "Iniciar execução" }).click();
  await expect(
    drawer.getByRole("button", { name: "Enviar para conferência" }),
  ).toBeDisabled();
  for (const checkbox of await drawer.getByRole("checkbox").all()) {
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeEnabled();
  }
  await drawer
    .getByRole("button", { name: "Usar PDF fictício de exemplo" })
    .click();
  await expect(
    drawer.getByRole("button", { name: "Enviar para conferência" }),
  ).toBeEnabled();
  await drawer.getByRole("button", { name: "Enviar para conferência" }).click();
  await expect(
    drawer.getByText("Aguardando conferência de outra pessoa."),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Aprovar entrega" }),
  ).toHaveCount(0);
  const taskUrl = page.url();
  await drawer.getByRole("button", { name: "Fechar", exact: true }).click();
  await profile(page, "Marina");
  await page.goto(taskUrl);
  drawer = page.getByRole("dialog", { name: title, exact: true });
  await drawer.getByRole("button", { name: "Aprovar entrega" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Entrega aprovada e registrada.",
  );
  await expect(drawer).toBeHidden();
  await profile(page, "Júlia");
  await page.goto(taskUrl);
  drawer = page.getByRole("dialog", { name: title, exact: true });
  await expect(
    drawer.getByText("Entrega concluída e registrada"),
  ).toBeVisible();
  await drawer.getByRole("button", { name: /Documentos \(/ }).click();
  const downloadEvent = page.waitForEvent("download");
  await drawer
    .getByRole("button", { name: "Baixar evidencia-demonstracao.pdf" })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("evidencia-demonstracao.pdf");
  await drawer.getByRole("button", { name: "Fechar", exact: true }).click();
  await profile(page, "Rafael");
  await page.goto(taskUrl);
  drawer = page.getByRole("dialog", { name: title, exact: true });
  await drawer.getByRole("button", { name: "Reabrir tarefa" }).click();
  const reason = page.getByRole("dialog", {
    name: "Reabrir tarefa",
    exact: true,
  });
  await reason
    .getByLabel("Justificativa")
    .fill("Revisar os valores fictícios da entrega.");
  await reason.getByRole("button", { name: "Confirmar e registrar" }).click();
  await expect(
    drawer.getByRole("button", { name: "Enviar para conferência" }),
  ).toBeDisabled();
  await expect(drawer.getByRole("checkbox").first()).not.toBeChecked();
  await drawer.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(drawer.getByText(/Primeira conclusão preservada/)).toBeVisible();
});

test("consulta não altera dados; filtros vazios e navegação permanecem funcionais", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/tarefas");
  await profile(page, "Consulta");
  await expect(
    page.getByRole("button", { name: "Nova tarefa", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Buscar tarefas").fill("empresa inexistente fictícia");
  await expect(page.getByText("Nenhuma tarefa nesta seleção")).toBeVisible();
  await page.getByRole("button", { name: "Ver setembro" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  for (const [route, heading] of [
    ["visao-geral", "Visão geral"],
    ["empresas", "Empresas e carteira"],
    ["modelos", "Modelos de tarefa"],
    ["documentos", "Documentos"],
    ["relatorios", "Relatórios"],
    ["configuracoes", "Configurações"],
  ]) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      heading,
    );
  }
  expect(errors).toEqual([]);
});

test("importação com prévia e geração mensal sem duplicação", async ({
  page,
}) => {
  await page.goto("/#/empresas");
  await profile(page, "Rafael");
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  const importer = page.getByRole("dialog", { name: "Importar empresas" });
  const cnpj = cnpjFromBase(`${String(Date.now()).slice(-8)}0001`);
  const buffer = Buffer.from(
    `nome;cnpj;regime;cidade;responsavel\nEmpresa Teste Fictício;${cnpj};Simples Nacional;São Paulo / SP;julia`,
  );
  await importer
    .getByLabel("Selecionar CSV")
    .setInputFiles({ name: "ficticio.csv", mimeType: "text/csv", buffer });
  await expect(importer.getByText("Prévia da importação")).toBeVisible();
  await importer.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  await expect(
    importer.getByRole("button", { name: "Confirmar importação" }),
  ).toBeDisabled();
  await importer
    .getByLabel("Selecionar CSV")
    .setInputFiles({ name: "ficticio.csv", mimeType: "text/csv", buffer });
  await importer.getByRole("button", { name: "Confirmar importação" }).click();
  await expect(importer).toBeHidden();
  await page.getByLabel("Buscar empresas").fill("Empresa Teste Fictício");
  await expect(page.getByRole("table")).toContainText(cnpj);
  await page.goto("/#/modelos");
  await page
    .getByRole("button", { name: "Gerar competência", exact: true })
    .click();
  const generator = page.getByRole("dialog", {
    name: "Gerar tarefas da competência",
  });
  await generator.getByLabel("Competência").fill("2026-10");
  await generator
    .getByRole("button", { name: "Gerar tarefas", exact: true })
    .click();
  await expect(generator.getByText(/novas tarefas geradas/)).toBeVisible();
  await generator.getByRole("button", { name: "Verificar novamente" }).click();
  await expect(
    generator.getByText("0 novas tarefas geradas", { exact: true }),
  ).toBeVisible();
});

test("navegação móvel, formulário e janela de tarefa cabem na tela", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/tarefas");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Minhas tarefas",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Empresas e carteira", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Empresas e carteira",
  );
  await expect(
    page.getByRole("button", { name: "Fechar menu" }),
  ).not.toBeInViewport();
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("link", { name: /Minhas tarefas/ }).click();
  await page
    .getByRole("button", { name: /^Abrir .+ de / })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  expect(Math.round(bounds?.width ?? Infinity)).toBeLessThanOrEqual(390);
  await drawer.getByRole("button", { name: "Fechar tarefa" }).click();
  await expect(drawer).toBeHidden();
});

async function taskCount(page: Page) {
  if (await page.getByText("Nenhuma tarefa nesta seleção").isVisible())
    return 0;
  const text = await page.locator(".table-footer").first().innerText();
  return Number(text.match(/de\s+(\d+)\s+tarefas/)?.[1]);
}
test("indicadores abrem numeradores e populações equivalentes", async ({
  page,
}) => {
  await page.goto("/#/visao-geral");
  await profile(page, "Rafael");
  const completed = page.getByRole("link", { name: /^Concluídas\s+\d+/ });
  const done = Number((await completed.innerText()).match(/\d+/)?.[0]);
  const punctual = page.getByRole("link", { name: /% entregues na meta/ });
  const percent = Number((await punctual.innerText()).match(/\d+/)?.[0]);
  await completed.click();
  await expect(page).toHaveURL(/status=done/);
  expect(await taskCount(page)).toBe(done);
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await page.getByRole("link", { name: /% entregues na meta/ }).click();
  await expect(page).toHaveURL(/urgency=on-time/);
  const onTime = await taskCount(page);
  expect(done ? Math.round((onTime / done) * 100) : 0).toBe(percent);
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  const late = page.getByRole("link", { name: /com meta vencida/ });
  const count = Number((await late.innerText()).match(/\d+/)?.[0]);
  await late.click();
  expect(await taskCount(page)).toBe(count);
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  const dispensed = Number(
    (
      await page.getByRole("link", { name: /^\d+ dispensadas/ }).innerText()
    ).match(/\d+/)?.[0],
  );
  await page
    .getByRole("link", {
      name: "Ver tarefas concluídas ou dispensadas",
      exact: true,
    })
    .click();
  expect(await taskCount(page)).toBe(done + dispensed);
});
test("matriz e CSV preservam tarefas avulsas de título repetido", async ({
  page,
}) => {
  await page.goto("/#/tarefas");
  await profile(page, "Rafael");
  const title = `Matriz duplicada ${Date.now()}`;
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Nova tarefa", exact: true })
      .click();
    const form = page.getByRole("dialog", { name: "Nova tarefa avulsa" });
    await form.getByLabel("Título", { exact: true }).fill(title);
    await form
      .getByLabel("Descrição", { exact: true })
      .fill("Tarefa fictícia para reproduzir multiplicidade.");
    await form
      .getByRole("combobox", { name: "Empresa", exact: true })
      .selectOption({ label: "Aurora Comércio" });
    await form
      .getByRole("button", { name: "Criar tarefa", exact: true })
      .click();
    await expect(form).toBeHidden();
  }
  await page.getByRole("link", { name: "Relatórios", exact: true }).click();
  await page.getByRole("button", { name: /Matriz de obrigações/ }).click();
  const cell = page.getByRole("link", {
    name: `${title} de Aurora Comércio: 2 tarefas`,
    exact: true,
  });
  await expect(cell).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toContain(
    "A fazer | A fazer",
  );
  await cell.click();
  expect(await taskCount(page)).toBe(2);
  await expect(page).toHaveURL(/model=avulsa/);
});
