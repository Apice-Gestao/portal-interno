# Ponto de retomada — relatórios ampliados

Data: 17/10/2026. Este documento preserva o checkpoint original e as retomadas. **Estado atual:** 31 relatórios entregues na demonstração pelo Claude Code e auditados pelo Codex. As seções antigas que dizem faltar a interface são históricas; não reiniciar implementação com base nelas. Revisão integrada e pendências atuais em `AUDITORIA-INTEGRADA-2026-10-17.md`.

## Auditoria da retomada pelo Codex — 17/10/2026

Relatórios mantêm os seis principais e 31 opções no total. Corrigidos recorte departamental de propostas em “Todos”, prazo comparado em dia UTC diferente do dia local, exportação/impressão de resultado com filtros não aplicados/erro/carregamento e registro completo do recorte impresso. Datas e versões documentais usam funções compartilhadas do domínio, evitando divergência com conclusão da tarefa. Filtro de regime rotulado como cadastro atual; histórico tributário não é recomposto por ele.

Regressões de relatórios passaram de 18 para 25, cobrindo também carteiras com tarefas de terceiros, autor distinto do responsável, novas empresas sem inventar data, datas de anexos/comentários e processos. Novo cenário HTTP/PostgreSQL confirma consulta de conciliação com duas evidências vigentes, empresa nova, ausência de mutação, grant/revogação, escopo e recusa de desempenho sem autorização. Suíte geral: 282 testes aprovados; integrações: 25 cenários operacionais e 13 de TV aprovados, com bases temporárias removidas. Navegador/Excel/impressão real continuam não verificados nesta auditoria por controle local desativado.

Para continuar, partir do código atual. Restam relatórios salvos, colunas/agrupamentos personalizados, paginação SQL e evolução de volume; catálogo de 31 consultas não representa atendimento completo do PRD. Não publicar nem dar push sem pedido.

## Diário da retomada (Claude Code) — 17/10/2026

O usuário retomou esta tarefa com o **Claude Code** e pediu que todo o trabalho seja registrado continuamente aqui e no `CONTEXTO.md`, para que o Codex entenda o que foi feito. Trabalho na branch `main` atual, por escolha do usuário; nada commitado ainda nesta retomada (ver último item).

**Etapa 1 — revisão do domínio/API (concluída, tipagem do domínio passou):**

- API: a consulta deixou de usar `store.run` (transação de escrita com lock consultivo e `persist`). Novo `PortalStore.report(actor, filters)`: PostgreSQL em transação `REPEATABLE READ READ ONLY`, memória chamando `engine.report`. `PortalService.report` usa esse método. Arquivos: `apps/api/src/database/portal-store.ts`, `memory-store.ts`, `postgres-store.ts`, `apps/api/src/portal/portal.service.ts`.
- **Matriz de obrigações** voltou ao sentido original (empresa × obrigação) usando `obligationGroups/obligationCell`; antes estava como lista de tarefas. Colunas dinâmicas `obligation0..n`; “—” = sem atividade no recorte.
- Relatórios de tarefas ganharam coluna **Situação do prazo** (mesma regra `deadline()` da página antiga), com `tones` por célula (`danger/warning/success/neutral`) para a interface colorir sem recalcular.
- `ReportRow.tones?` e tipo `ReportTone` adicionados ao contrato.
- Documentos aceitos/pendências documentais passam a considerar **somente a versão mais recente de cada documento lógico** (mesma lógica de `documentsReady` do frontend). Antes uma versão antiga aceita mascarava uma nova rejeitada.
- **Entregas por colaborador** recuperou a coluna **% na meta** da página antiga (concluídas até a meta ÷ concluídas).
- **Dispensas e reaberturas** voltou a incluir eventos de correção/devolução (regex da página antiga) e mostra o `actorName` gravado no evento.
- **Histórico de movimentações**: o filtro de responsável representa o autor; corrigido bug em que ele também exigia que a tarefa fosse atribuída à mesma pessoa.
- **Empresas sem tarefas**: corrigido para não aplicar o filtro de responsável sobre as tarefas (só sobre a carteira); considera todas as tarefas visíveis no recorte de datas. Se a conta não tem `tasks.team.view`, nota explícita avisa que empresas de colegas podem aparecer como sem tarefas (não ampliamos o snapshot).
- **Data de cadastro**: `createdAt` ou, para legado, o evento de auditoria “Empresa cadastrada” visível no snapshot. Sem nenhum dos dois = “Não registrado”, fora de intervalos e fora de **Novas empresas** (que agora só lista empresas com data conhecida, mais recentes primeiro).
- **Acessos dos usuários** mostra rótulos de `PERMISSION_LABELS` em vez de chaves técnicas.
- Ordenação útil por relatório (tarefas por prazo legal/empresa; eventos, documentos, comentários, propostas e novas empresas do mais recente; cadastros por nome), em vez de ordenar por ID.
- Resumo ganhou até três contadores extras: tarefas (abertas/concluídas/prazo legal vencido), situação das empresas ou regimes.

**Etapa 2 — testes de domínio (concluída):** `packages/domain/test/reports.test.ts`, 18 testes aprovados: catálogo de 31 relatórios, disponibilidade por grants sem depender de cargo, pedidos adulterados/departamento fora do acesso (403), revogação, validação de datas/filtros não suportados, entregas × dispensas × cancelamentos, intervalo inclusivo no dia de São Paulo, operador sem visão de equipe, prazo vencido, versão vigente do documento, matriz, empresas sem tarefas/novas empresas, isolamento de grupo, histórico por autor sem eventos de segurança, relatório de acessos sem login/e-mail/hash, CSV com BOM único e fórmulas neutralizadas.

**Direção do usuário (17/10/2026, durante a retomada):** “vamos fazer apenas uma demonstração”; o código atual é basicamente o protótipo e **ainda não é fase de validação final de endpoints e domínio**. Por isso **não** foram feitos testes de integração HTTP/PostgreSQL do endpoint nesta etapa; o item 1 da “Próxima implementação” abaixo fica reduzido ao que já foi feito. Prioridade agora: interface demonstrável. Validação final de endpoint/segurança continua pendente para fase futura.

**Etapa 3 — nova interface (escrita; tipagem e lint aprovados, falta conferência no navegador):** `apps/web/src/modules/reports/` foi dividido em:

- `ReportsPage.tsx`: orquestra relatório escolhido (`?tipo=` na URL, compatível com links antigos como `?tipo=productivity`), filtros aplicados × rascunho, consulta `client.report` via React Query (chave inclui tenant, usuário, permissões, departamentos e filtros aplicados), estados de carregamento/erro com “Tentar novamente”/vazio, CSV e impressão.
- `ReportCatalog.tsx`: “Principais” sempre visíveis; demais categorias recolhíveis com contador; busca por título/descrição; em telas até 1000 px vira um seletor compacto único. Só lista `availableReports(actor)`.
- `ReportFiltersForm.tsx`: mostra apenas filtros suportados pelo relatório (abrangência só se a conta tem mais de um departamento; base de datas; competência ou “Todas”; intervalo de datas; empresa; responsável/autor/proposta por; regime; situação; busca). Botão **Gerar relatório**; aviso “Filtros alterados” quando o rascunho difere do aplicado; **Restaurar padrão**.
- `ReportResultView.tsx`: resumo em cartões, tabela genérica com selos coloridos pelas `tones` do domínio (cores semânticas autorizadas), link para a tarefa quando há `taskId` e `tasks.view`, paginação de 25 linhas, notas de interpretação, horário de geração.
- `report-catalog.ts`: rótulos de categorias/bases de data, ícones Phosphor por relatório (só do registro existente) e normalização da busca.
- `reports.css`: estilos próprios com prefixo `report-*`, paleta Ápice, sem barras de rolagem visíveis (regra global), responsivo e regras de impressão.
- CSV: `reportCsv` já tem BOM e `downloadText` acrescenta outro; a página remove o primeiro para não duplicar. Impressão/PDF usa `flushSync` para renderizar **todas** as linhas antes de `window.print()`, não só a página atual; catálogo e filtros ficam ocultos na impressão.
- Os estilos antigos `.report-menu` em `shared/ui/ui.css` ficaram sem uso; não foram removidos nesta etapa.

**Etapa 4 — verificação (Claude Code):** `npm run check` aprovado: tipagem, lint, 266 testes em 15 arquivos (248 anteriores + 18 de relatórios) e build dos três pacotes. Serviços iniciados com `scripts/start-system.ps1 -NoBrowser` (estavam desligados), preservando banco e contas; a API em execução já tem a rota `POST /api/v1/reports/query`. Conferência visual no navegador interno do app aguardando o usuário entrar com o acesso de teste (o Claude não digita a senha privada do `.env`).

**Etapa 5 — conferência no navegador e ajustes (Claude Code):** com o usuário logado como administrador de teste, a página abriu “Pendências e atrasos” com 33 registros reais da base local, filtros, resumo e tabela funcionando. Ajustes feitos depois: campo de busca do catálogo cortado (`min-width: 0`); tabela de tarefas tinha 13 colunas (1461 px numa área de 576 px), então o domínio agora omite Departamento quando o recorte é um só departamento, Competência quando uma competência está fixada, Conclusão fora de entregas/cancelamentos/devoluções/conciliação e Etapas/Documentos fora de conciliação/pendências documentais; cartão “Escopo” removido do resumo (a linha de recorte já informa). Para a API carregar o domínio recompilado foram parados somente os quatro processos Node verificados do portal (dev.mjs, tsx/API, Vite) e religado o iniciador; PostgreSQL preservado. Isso encerrou a sessão do usuário (sessões em memória), então a conferência final ficou para o próximo login.

**Etapa 6 — fechamento desta retomada (Claude Code):** após novo login do usuário, navegador confirmou tabela de tarefas com 8 colunas, resumo sem “Escopo”, busca do catálogo inteira, troca de relatório pela categoria recolhível e “Situação das empresas” com 12 empresas, selos “Ativa” e apenas os filtros suportados. `npm run check` final aprovado (266 testes). Commit local na `main`, sem push. **Estado: entregue como demonstração**, não validação final. Não conferidos visualmente nesta etapa: os 31 relatórios um a um, CSV aberto em planilha, impressão/PDF real, celular. Pendências para fase futura: testes HTTP/PostgreSQL do endpoint, remoção dos estilos antigos `.report-menu` em `shared/ui/ui.css`, paginação/consulta SQL para bases grandes.

Observação técnica para próximos agentes: neste Windows, heredocs do Bash e alguns `sed` alteraram sequências `\u...` (viraram caracteres literais ou foram perdidas). Conferir escapes como `﻿` e `[̀-ͯ]` após edições automatizadas.

**Etapas históricas desta retomada:** implementação e testes listados acima foram concluídos; consultar a auditoria mais recente para o que ainda falta, sem refazer a página.

## Pedido e decisões

Ampliar bastante as opções de relatório para o gestor acompanhar empresas novas, datas e toda a operação, mantendo os seis relatórios existentes como principais. Organizar as opções por assunto, com busca e filtros, sem poluir a tela. Preservar paleta azul Ápice, ícones Phosphor, barras de rolagem invisíveis e modularidade. Cargo não concede nem limita acesso: usar permissões persistidas e escopo da conta.

Catálogo preparado com 31 relatórios: os seis principais (conciliação, entregas, pendências, matriz, entregas por colaborador, dispensas/reaberturas); nove opções de tarefas (agenda, atraso legal, meta vencida, conferência, espera de cliente, devoluções/retrabalho, fila do departamento, pedidos de dispensa, cancelamentos); seis de empresas (cadastro, novas empresas, situação, carteiras, regimes, sem tarefas); três de processos (andamento, etapas, rotinas bloqueadas); três documentais (inventário, pendências, comentários); dois gerenciais (propostas de alteração e histórico operacional); dois de acessos/estrutura.

## Arquivos já escritos neste checkpoint

- `packages/domain/src/reports.ts`: definições e tipos, esquema de filtros, disponibilidade por permissões, gerador dos 31 resultados e CSV. Implementação inicial completa, ainda sem revisão funcional ou testes comportamentais novos.
- `packages/domain/src/index.ts`: exporta o módulo de relatórios.
- `packages/domain/src/engine.ts`: método `report(actor, filters)` usa snapshot e gerador; cadastro de novas empresas registra `createdAt`.
- `packages/domain/src/types.ts`: `Company.createdAt` opcional, para registrar a data real a partir de agora. Sem inventar datas para cadastros antigos. Payload JSON existente permite persistir o campo; não foi aplicada migração nem alterada a base principal.
- `apps/api/src/portal/portal.controller.ts` e `portal.service.ts`: POST `/api/v1/reports/query`, validação e execução pelo store com identidade resolvida.
- `apps/web/src/services/portal-client.ts`: método `report(filters)` no contrato e nos clientes HTTP/demonstração.

**A página `apps/web/src/modules/reports/ReportsPage.tsx` ainda é a antiga.** Não foram criados catálogo visual, filtros novos, consulta nova, paginação ou impressão/exportação nova. O navegador continua mostrando apenas os relatórios anteriores.

## Contrato para o frontend

Importar `REPORT_DEFINITIONS`, `availableReports`, `ReportId`, `ReportFilters`, `ReportResult`, `ReportDateBasis` de `@apice/domain`. Cada definição contém `id/title/caption/category/dateBasis/requiredPermissions` e `supports` (`dateBases/company/owner/regime/status/search/scope`). A interface deve oferecer somente filtros suportados.

Filtros: `id`, `scope` (`department` ou `all`), `department`, `dateBasis`, `competence`, `from/to`, `companyId`, `ownerId`, `regime`, `status`, `search`. Base `competence` usa mês, sem `from/to`; demais bases usam intervalo de datas, sem `competence`. Sem datas = histórico completo. Cadastros de acessos/estrutura não têm recorte de datas. Intervalos devem ser inclusivos e datas inválidas/invertidas rejeitadas. Datas de eventos devem considerar o dia em São Paulo, com testes de borda.

Resultado: `id/title/description/dateLabel`, `columns[{key,label}]`, `rows[{id,cells,taskId?,companyId?,department?,competence?}]`, `summary`, `notes`, `generatedAt`, `total`. Usar a mesma resposta para tela, CSV e impressão. `reportCsv` já inclui BOM; `downloadText` também acrescenta BOM, portanto evitar duplicação na integração.

## Próxima implementação

1. Revisar domínio e permissões antes de afirmar que os relatórios estão corretos. Escrever testes significativos sobre os 31 casos, isolamento de grupos/departamentos, grants de desempenho, consultas adulteradas, CSV/formula injection, datas inclusivas, sem data, empresas sem tarefas, filas de setor e cancelamentos separados de dispensas. Testar endpoint com contas de permissões diferentes, inclusive revogação. Não ampliar snapshot/permissões para tornar um resultado artificialmente completo.
2. Refatorar a página em componentes: catálogo com seis principais sempre destacados; demais categorias recolhíveis e busca. Evitar lista de 31 botões ocupando a tela toda. Mobile deve oferecer seleção compacta. Reutilizar os ícones Phosphor do registro existente.
3. Formulário de filtros com competência ou base/data inicial/final, alcance autorizado, empresa, responsável, regime, situação e busca quando aplicáveis. Botão Gerar relatório; indicar filtros ainda não aplicados. “Todos” representa somente departamentos autorizados. Não oferecer filtros ignorados silenciosamente.
4. Consultar `client.report` pelo React Query com chave incluindo tenant, usuário, permissões e filtros aplicados. Evitar exibir resultado antigo ao trocar filtros/acessos. Estados de carregamento, erro, vazio e nova tentativa claros.
5. Tabela genérica, indicadores e notas de interpretação; links para tarefas com departamento/competência quando houver autorização. Paginação visual e CSV de todas as linhas filtradas. Impressão/PDF deve incluir o resultado completo e o recorte, não só a página atual.
6. Executar `npm run check`, testes novos de API/domínio e verificações apropriadas. Reiniciar API de forma controlada depois da validação para disponibilizar a rota nova, preservando banco/contas e outros serviços. Não fazer deploy nem enviar ao GitHub: não foi solicitado.

## Regras que exigem atenção na revisão

- Não usar `startDate` como data real de cadastro. Cadastros antigos sem `createdAt` podem usar evento confiável de cadastro quando presente; se não houver, informar desconhecida e excluir de intervalo explícito.
- Empresa sem tarefa precisa continuar disponível nos relatórios cadastrais; o filtro de empresa não pode depender da existência de tarefas. “Sem tarefas” deve explicitar competência/escopo e se há filtros adicionais.
- Desempenho individual exige `reports.performance.view`; cadastro de empresas exige `companies.view`; processos exigem `processes.view`; propostas exigem `changes.manage`; histórico amplo exige `settings.view`; acessos/estrutura exigem `users.manage`. Todos exigem `reports.view`. Não expor senhas, tokens, códigos, IP, dispositivo ou detalhes de segurança.
- Preservar o sentido dos seis relatórios anteriores; entregas corresponde a concluídas, cancelamentos não são entregas nem dispensas. Não inferir obrigações fiscais novas.
- As métricas são calculadas dos registros disponíveis, não representam tempo trabalhado, produtividade financeira ou histórico que não foi registrado.

## Verificação e ambiente

Tipagem do domínio, API e web passou no checkpoint. Ainda não há testes comportamentais novos nem validação integral. O controle do navegador foi consultado nesta etapa e retornou desativado nas configurações do Work; não contornar com outra automação nem afirmar conferência visual.

Projeto principal: pasta Portal-Apice na Área de Trabalho. Última entrega concluída anterior: commit `05630bf` (ícones e cartões do ecossistema). Preservar o arquivo de imagem já existente e não versionado em `outputs/Login-Logo-2026-10-16.png`. Não incluir `.env`, `.local` ou credenciais em commits. A demonstração pública continua separada e adiada.
