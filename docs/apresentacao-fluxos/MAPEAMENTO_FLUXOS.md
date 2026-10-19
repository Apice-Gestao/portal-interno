# Mapeamento das jornadas

Preparado em 15/10/2026. Base de código: commit `b4d060a`. A direção final do usuário prioriza prints reais, resumos breves abaixo das telas e funcionamento esperado. Não há matriz de implementação, prioridades inferidas ou estimativa de conclusão.

## Origem e leitura

As capturas vêm do protótipo local executado em `http://127.0.0.1:5173`, usando Playwright pelo navegador da sessão. Viewport de origem: 1280 × 720, JPEG, dados fictícios do tenant de testes. Nenhuma captura recebeu botões, campos ou textos inseridos para fingir uma interface. Os textos explicativos ficam como objetos separados no PowerPoint.

Os slides 2, 12 e 13 são diagramas de funcionamento, e não screenshots. A troca de regime aparece como regra funcional: validar vigência oficial, revisar impacto, confirmar e aplicar às competências afetadas. A data da edição não determina a data legal de efeito, que depende do motivo e da regra vigente.

## Fontes principais

- PRD Portal Interno Apice.pdf, fornecido pelo usuário.
- Visão, Prioridades e Especificações - Projeto Interno.pdf, fornecido pelo usuário.
- Decisões do usuário nesta conversa e registros em AGENTS.md e docs/CONTEXTO.md.
- Código das páginas e do domínio, referenciado abaixo e nas notas dos slides.
- Fontes oficiais de vigência e obrigações indicadas nos slides sobre regime. Regras por UF, hipóteses de dispensa e periodicidade precisam integrar a análise de aplicabilidade de cada empresa.

## Sequência das jornadas

### Slide 2 — MAP-01: O caminho do trabalho

O gestor organiza empresas e modelos. As tarefas seguem para execução e conferência, e as entregas alimentam os documentos, os relatórios e o painel de TV.

Diagrama nativo editável de funcionamento esperado. Não representa uma tela.

Fontes:

- Visão, Prioridades e Especificações, pp. 4, 10–14
- PRD Portal Interno Apice, pp. 6–13

### Slide 3 — A01: Login individual

Cada pessoa entra com seu usuário e senha. O fluxo normal inclui código por e-mail para todos e troca da senha temporária no primeiro acesso.

Captura: `screenshots/A01-login.jpg`. Rota: `/`. SHA-256: `35f478fe96f47e863df77166372536741747ff36643f043486fdc52cf82095b4`.

Fontes:

- apps/web/src/modules/auth/LoginPage.tsx:151
- apps/web/src/modules/auth/EmailCodePage.tsx:107
- apps/api/src/security/session.service.ts:62
- Decisão do usuário: segundo fator por e-mail para todos

### Slide 4 — A02: Recuperação de senha

Em Esqueci minha senha, a pessoa informa o e-mail cadastrado e recebe instruções para definir uma nova senha. O administrador também pode atribuir uma senha temporária.

Captura: `screenshots/A02-recuperar.jpg`. Rota: `/`. SHA-256: `44b299af0b9e3c24529b28ac122dfec89fb5dfc1f82dfbd5614976bba4e21de5`.

Fontes:

- apps/web/src/modules/auth/LoginPage.tsx:68
- apps/api/src/security/recovery.service.ts:149
- apps/web/src/modules/users/UsersPage.tsx:205

### Slide 5 — U02: Cadastro de usuários

O administrador cadastra nome, e-mail, usuário e senha temporária. Também define o cargo e os departamentos em que a pessoa poderá trabalhar.

Captura: `screenshots/U02-novo-usuario.jpg`. Rota: `/#/usuarios`. SHA-256: `696f4902eb921eb1d6d975c6b0251518da0a269dbeb00e87135487daeeecd36c`.

Fontes:

- apps/web/src/modules/users/UsersPage.tsx:140
- apps/api/src/security/identity.schemas.ts:55

### Slide 6 — U03: Abas e ações por pessoa

O administrador escolhe quais abas e ações cada pessoa pode usar. Pode ampliar os acessos de um operador: o cargo identifica a função, sem limitar as concessões.

Captura: `screenshots/U03-permissoes.jpg`. Rota: `/#/usuarios`. SHA-256: `325c86e50a19845c5341282a373cf9a0b94a879e0e3387d2c2173705c97e8a23`.

Fontes:

- apps/web/src/modules/users/UsersPage.tsx:246
- packages/domain/src/access.ts:33
- apps/api/src/security/identity.schemas.ts:77
- AGENTS.md: permissões por pessoa

### Slide 7 — V01: Visão geral da operação

A pessoa escolhe o departamento e a competência para acompanhar prazos e entregas. Ao clicar em um indicador, abre as tarefas que formam aquele resultado.

Captura: `screenshots/V01-visao-geral.jpg`. Rota: `/#/visao-geral`. SHA-256: `4242f3558618822a63c5cd62d25161c572521c0f1e8aaa7ea949fdf197dbb84b`.

Fontes:

- apps/web/src/modules/overview/OverviewPage.tsx
- apps/web/src/app/App.tsx:43
- packages/domain/src/selectors.ts:26

### Slide 8 — E01: Empresas e carteira

A carteira reúne empresas, regimes e responsáveis. A busca e o filtro de regime ajudam a localizar uma empresa e abrir suas informações ou tarefas.

Captura: `screenshots/E01-empresas.jpg`. Rota: `/#/empresas`. SHA-256: `e895386e8f8d19d48f942bde850b50bbccf1c779b716d2470234c2b780b365c1`.

Fontes:

- apps/web/src/modules/companies/CompaniesPage.tsx
- packages/domain/src/types.ts:23

### Slide 9 — E02: Cadastro de empresa

O cadastro informa razão social, CNPJ, regime, localização e responsável pela carteira. O sistema deve validar os dados e evitar empresas duplicadas antes de salvar.

Captura: `screenshots/E02-cadastro-empresa.jpg`. Rota: `/#/empresas`. SHA-256: `3a454de5e798029a6a882906bbb2fb6dab12b4c3f7912d541193775fb5ad92da`.

Fontes:

- apps/web/src/modules/companies/CompaniesPage.tsx
- packages/domain/src/schemas.ts
- packages/domain/src/engine.ts

### Slide 10 — E03: Importação da carteira

O gestor seleciona o CSV, revisa os registros e confirma a importação. Empresas que já existem devem manter seus dados e histórico.

Captura: `screenshots/E03-importar.jpg`. Rota: `/#/empresas`. SHA-256: `6251029873ef5ce8395ebb7c2f66d3b96a9c992267eb01619067b3d7425cb943`.

Fontes:

- apps/web/src/modules/companies/CompaniesPage.tsx
- apps/web/src/modules/companies/CompaniesPage.tsx:72

### Slide 11 — E04: Tarefas conforme o perfil da empresa

O sistema deve combinar regime, vigência, UF e condições da empresa para definir suas obrigações. Ser contribuinte de ICMS exige avaliar a regra da UF antes de vincular a EFD ICMS/IPI.

Captura: `screenshots/E04-detalhe-regime.jpg`. Rota: `/#/empresas`. SHA-256: `5d6f9dcf27a7032eed38cedd1ba28b0bf29a09b5caced850c6f9f4e2e572ed00`.

Fontes:

- Visão, Prioridades e Especificações, pp. 10–11 e 21
- PRD Portal Interno Apice, pp. 5–7
- Decisão do usuário: tarefas conforme regime e condições fiscais
- https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi

### Slide 12 — REG-01: Mudança de regime e adaptação das tarefas

Após validar a vigência oficial, o sistema deve mostrar o impacto e pedir confirmação. Aplica a mudança às competências afetadas, preserva o histórico e evita tarefas duplicadas.

Diagrama nativo editável de funcionamento esperado. Não representa uma tela.

Fontes:

- Visão, Prioridades e Especificações, RN04 e RN20, pp. 10 e 12
- PRD Portal Interno Apice, CA02, p. 17
- Decisão do usuário: mudança de regime com confirmação e vigência oficial
- https://www.gov.br/pt-br/servicos/comunicar-exclusao-do-simples-nacional

### Slide 13 — REG-02: Obrigações que entram, permanecem ou saem

No Lucro Presumido, o plano deve considerar IRPJ e CSLL trimestrais e EFD-Contribuições conforme as regras aplicáveis. Tarefas iniciadas ou entregues exigem revisão antes de qualquer ajuste.

Diagrama nativo editável de funcionamento esperado. Não representa uma tela.

Fontes:

- Decisão do usuário: exemplos fiscais e adaptação por competência
- Visão, Prioridades e Especificações, pp. 10–13
- https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=81268
- https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/ecf/perguntas-e-respostas-pessoa-juridica-2018-arquivos/perguntas-e-respostas-pessoa-juridica-2018.pdf
- https://sped.rfb.gov.br/estatico/A6/44AEB1BBD8AB6403004C3DA1F7F8B1C27E8DE8/Perguntas%20e%20Respostas%20EFD%20Contribui%C3%A7%C3%B5es.pdf

### Slide 14 — M01: Modelos de tarefa

O gestor mantém os modelos de obrigações, com regime, prazos, etapas e necessidade de conferência. Cada modelo orienta a criação das tarefas recorrentes.

Captura: `screenshots/M01-modelos.jpg`. Rota: `/#/modelos`. SHA-256: `38385c441b88b6d62ba9a08501ca36625c0d44f5d91a2ac1b1444e36b22fafee`.

Fontes:

- apps/web/src/modules/templates/TemplatesPage.tsx
- packages/domain/src/types.ts
- Visão, Prioridades e Especificações, RN29 e RN30, p. 13

### Slide 15 — M04: Criação e edição dos fluxos

O gestor cria, copia, reordena e salva as etapas do trabalho. Define a evidência e a conferência exigidas, preservando nas tarefas já geradas a versão do fluxo e o andamento.

Captura: `screenshots/M04-fluxo-etapas.jpg`. Rota: `/#/modelos`. SHA-256: `0b34d17ed1fea8a14a2d4710498abce8ce9dacc6b06d792b3b2138bb10607f0a`.

Fontes:

- apps/web/src/modules/templates/WorkflowEditor.tsx
- apps/web/src/modules/templates/TemplatesPage.tsx
- packages/domain/src/engine.ts:568
- Decisão do usuário: fluxos livres e reutilizáveis

### Slide 16 — M05: Geração por competência

O gestor escolhe a competência e gera as rotinas das empresas elegíveis. Cada tarefa recebe responsável, prazos e fluxo, e uma nova geração preserva as tarefas que já existem.

Captura: `screenshots/M05-gerar-competencia.jpg`. Rota: `/#/modelos`. SHA-256: `a3b499762dadaf145e62f54934b0544b9d5306078e7367062fcef0c78b3569d4`.

Fontes:

- apps/web/src/modules/templates/TemplatesPage.tsx
- packages/domain/src/engine.ts:737
- Visão, Prioridades e Especificações, RN01–RN04, p. 10

### Slide 17 — T01: Tarefas da equipe

Quem tem acesso à equipe acompanha obrigações, responsáveis e prazos. Status, busca e filtros ajudam a localizar o trabalho, e as cores destacam a situação de cada prazo.

Captura: `screenshots/T01-tarefas.jpg`. Rota: `/#/tarefas`. SHA-256: `b35de6c540352ba431ee08c6d2c0e690335be9bb38b7ab6eddcb63333df95521`.

Fontes:

- apps/web/src/modules/tasks/TasksPage.tsx:149
- apps/web/src/shared/ui/TaskStatus.tsx:17
- packages/domain/src/selectors.ts:26

### Slide 18 — O01: A rotina do operador

O operador acompanha suas tarefas e atualiza a execução. Recebe outras abas, relatórios ou ações somente quando o administrador conceder esses acessos.

Captura: `screenshots/O01-minhas-tarefas.jpg`. Rota: `/#/tarefas`. SHA-256: `76b416e6b3085f9710a518832ae00d9b4ed9889589cab20b6b3de9bd389c90cc`.

Fontes:

- apps/web/src/app/App.tsx:203
- packages/domain/src/selectors.ts:26
- Decisão do usuário: operador executa suas tarefas e pode receber outras concessões

### Slide 19 — O03: Execução e checklist

Ao abrir uma tarefa, o responsável inicia o trabalho e marca as etapas realizadas. Para concluir ou enviar à conferência, precisa cumprir as etapas e anexar a evidência exigida.

Captura: `screenshots/O03-checklist.jpg`. Rota: `/#/tarefas`. SHA-256: `2eead646896584343604cc35e88c6faccbf2051fd80e951970fa28b070f187b2`.

Fontes:

- apps/web/src/modules/tasks/TaskDrawer.tsx:309
- packages/domain/src/engine.ts:228
- packages/domain/src/engine.ts:240

### Slide 20 — T03: Evidências da entrega

Os documentos ficam vinculados à tarefa, à empresa e à competência. Novos envios preservam as versões anteriores, e o download depende da autorização da pessoa.

Captura: `screenshots/T03-evidencias.jpg`. Rota: `/#/tarefas`. SHA-256: `5dc0ee1f56dd15dde21a805b38c27a083c216cb86de7110cb47c9beaa9ba52cc`.

Fontes:

- apps/web/src/modules/tasks/TaskDrawer.tsx
- packages/domain/src/engine.ts:455
- packages/domain/src/files.ts

### Slide 21 — T02: Conferência e conclusão

Quando o modelo exige conferência, outra pessoa autorizada aprova a entrega ou devolve com o motivo do ajuste. O responsável corrige e encaminha novamente para análise.

Captura: `screenshots/T02-detalhe-conferencia.jpg`. Rota: `/#/tarefas`. SHA-256: `8bcf8287fc14ca95c45483e9034c6c8c4af4901061732e788266b51555cec534`.

Fontes:

- apps/web/src/modules/tasks/TaskDrawer.tsx:581
- packages/domain/src/engine.ts:240
- Visão, Prioridades e Especificações, RN09–RN12, p. 11

### Slide 22 — T05: Tarefas avulsas e exceções

Uma demanda pontual recebe empresa, descrição, responsável e prazos próprios. Redistribuição, espera pelo cliente, dispensa e reabertura devem seguir as permissões e registrar seus motivos.

Captura: `screenshots/T05-nova-tarefa.jpg`. Rota: `/#/tarefas`. SHA-256: `e61ec10e3be8bac6dc07c489e9230faffc3cafb167ec1e01b506f3a1908afccc`.

Fontes:

- apps/web/src/modules/tasks/TaskForms.tsx:18
- packages/domain/src/engine.ts:618
- Visão, Prioridades e Especificações, RN13–RN16, p. 11
- Decisão do usuário: fluxo funcional esperado

### Slide 23 — D01: Consulta de documentos

A pessoa escolhe a competência e pesquisa os arquivos do seu escopo. Pode consultar versões, abrir a tarefa de origem e baixar as evidências quando tiver permissão.

Captura: `screenshots/D01-documentos.jpg`. Rota: `/#/documentos`. SHA-256: `57300575e4a41a243b63526aad2431f80a5e6a9f477655e449960492fa442f0a`.

Fontes:

- apps/web/src/modules/documents/DocumentsPage.tsx
- packages/domain/src/selectors.ts:26

### Slide 24 — R01: Relatórios operacionais

A pessoa seleciona o relatório e a competência para consultar ou exportar os resultados. Operadores podem emitir relatórios operacionais e de conciliação quando autorizados.

Captura: `screenshots/R01-relatorios.jpg`. Rota: `/#/relatorios`. SHA-256: `5888bf6d527b23e2bab7eda080a521120d5b67f6dc9d2344d15373edcc863ae6`.

Fontes:

- apps/web/src/modules/reports/ReportsPage.tsx
- Decisão do usuário: relatórios operacionais e de conciliação por concessão

### Slide 25 — R02: Acompanhamento de desempenho

Relatórios de desempenho individual devem exigir autorização específica. Administradores e supervisores acompanham esses dados conforme as concessões definidas para a gestão.

Captura: `screenshots/R02-desempenho.jpg`. Rota: `/#/relatorios`. SHA-256: `45cae60b53e68a79db0c12ae6e69acae97dc398b68802ac8867cd49d9c338210`.

Fontes:

- apps/web/src/modules/reports/ReportsPage.tsx
- Decisão do usuário: separar relatórios operacionais de desempenho individual
- Visão, Prioridades e Especificações, pp. 18–19

### Slide 26 — P03: Visão consolidada da equipe

O painel reúne os departamentos autorizados, com prazos, entregas e tarefas vinculadas ao nome do colaborador. As listas alternam automaticamente para acompanhar toda a equipe.

Captura: `screenshots/P03-tv-exibicao.jpg`. Rota: `/#/painel-tv/exibir`. SHA-256: `f491ea9e12b80f38885ad5b1782fd5512c59a567521fa183cb102ce1c9474f30`.

Fontes:

- apps/web/src/modules/tv/TvPage.tsx
- packages/domain/src/tv.ts
- docs/PAINEL-TV.md
- Decisão do usuário: TV branca, contraste azul e vínculo nominal das tarefas

### Slide 27 — P02: Cadastro e conexão da TV

A pessoa autorizada cadastra o dispositivo e define departamentos, competência e blocos. Depois vincula a TV por código de uso único, com acesso de consulta que pode ser revogado.

Captura: `screenshots/P02-dispositivo.jpg`. Rota: `/#/painel-tv`. SHA-256: `9fbed7b76e149987b099c1d567ea7c8231db7da1c570519ebb58bc02e6865a08`.

Fontes:

- apps/web/src/modules/tv/TvPage.tsx
- apps/api/src/tv/tv.service.ts
- apps/api/src/tv/tv.controller.ts
- docs/PAINEL-TV.md

### Slide 28 — C02: Configurações e rastreabilidade

A gestão consulta a equipe, os acessos e os registros das ações realizadas. O histórico permite identificar quem alterou, executou, conferiu ou reabriu uma tarefa.

Captura: `screenshots/C02-auditoria.jpg`. Rota: `/#/configuracoes`. SHA-256: `ddc368442fba85d0a76323f252238e0e31e82f2e5bf4b70e39ee70a6ed9b3bab`.

Fontes:

- apps/web/src/modules/settings/SettingsPage.tsx
- packages/domain/src/engine.ts
- Visão, Prioridades e Especificações, RN20, p. 12

## Caminhos principais

- Acesso: login, confirmação por e-mail, troca de senha temporária quando exigida e entrada nas abas autorizadas. Recuperação volta ao login com nova senha.
- Gestão: cadastrar usuário, definir departamentos, escolher abas e ações, revisar e salvar. Cargo não cria teto de permissões.
- Rotina: cadastrar/importar empresa, definir modelo e fluxo, selecionar competência, gerar tarefas sem duplicidade, executar etapas, anexar evidência e conferir quando exigido.
- Mudança de regime: registrar motivo/data de efeito, validar fonte e vigência, comparar obrigações que entram/permanecem/saem, confirmar e atualizar os períodos afetados. Manter histórico e tratar tarefas iniciadas ou entregues por revisão explícita.
- Consulta: localizar documentos e relatórios no escopo autorizado. Relatórios operacionais/conciliação e desempenho de pessoas seguem concessões distintas conforme a regra funcional do usuário.
- TV: cadastrar dispositivo, configurar escopo/blocos, vincular por código de uso único, acompanhar dados de consulta e revogar quando necessário.

## Captura e dados

Foram abertas telas, filtros, modais e detalhes, com cancelamento dos formulários. Nenhuma empresa, conta, tarefa, modelo ou TV foi criada ou editada para obter as imagens. Usaram-se os logins locais já autorizados pelo usuário e uma solicitação de recuperação com endereço fictício sem conta. Não foram incluídos credenciais, tokens, senhas, códigos de pareamento, e-mails reais ou dados de produção. Os nomes e CNPJs de exemplo das imagens pertencem às fixtures fictícias do protótipo.

## Atualização do material

Edite `conteudo.json` para os textos e fontes, e substitua os prints em `screenshots/` com capturas reais. `gerar-apresentacao.mjs` recria os objetos nativos e os renders. `exportar-pdf.py` cria a prévia PDF. Consulte README.md para as dependências e os passos. O PPTX pode ser editado sem executar o projeto.
