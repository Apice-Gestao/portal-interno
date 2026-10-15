# Portal Interno Ápice

Primeira versão funcional para validar o ciclo operacional do PRD: gerar tarefas, executar etapas, anexar evidências, conferir, registrar movimentações e acompanhar indicadores. Inclui frontend, backend e PostgreSQL local, autorizado em 08/10/2026, com migrações e transferência para outro PostgreSQL. A implantação futura será em uma VPS.

Use apenas dados fictícios. Empresas, pessoas, prazos e documentos iniciais são exemplos. O modo PostgreSQL usa o relógio real em `America/Sao_Paulo`. Login individual e permissões já são persistidos, mas regras fiscais e infraestrutura de produção ainda estão pendentes. Esta versão não está pronta para operar com dados reais.

## Executar localmente

Requisitos: Node.js **22.12 ou superior**, npm, Git e PostgreSQL. A configuração local foi verificada com PostgreSQL **18.4** já instalado no Windows. O script cria uma instância exclusiva na porta 55432; não interfere em instâncias existentes. Na pasta do projeto:

**Para abrir no Windows, dê dois cliques em `Iniciar Sistema.cmd` na pasta do projeto.** O iniciador liga banco, API e interface em segundo plano e abre o navegador quando o portal estiver pronto. Se já estiver ativo, reutiliza os mesmos serviços. A primeira inicialização pode levar até um minuto. Não é necessário manter um terminal aberto. Em caso de falha, a janela informa o motivo; registros privados ficam em `.local/launcher`. Dependências e configuração local precisam existir; essa preparação inicial já está feita neste computador.

```powershell
npm ci
npm run db:setup
npm run dev
```

- Interface: <http://127.0.0.1:5173/#/tarefas>
- API NestJS: <http://127.0.0.1:3001/api/v1>
- Contrato OpenAPI/Swagger: <http://127.0.0.1:3001/api/docs>

`db:setup` gera credenciais aleatórias em `.env`, aplica migrações e insere exemplos somente para tenants novos. Se o banco já está configurado, basta `npm run dev`: inicia banco, API e frontend, preservando os registros. A API aceita conexões locais e recusa o endpoint demonstrativo fora de `development + ENABLE_DEMO_SESSIONS=true`; esse endpoint permanece desabilitado em `npm run dev`. Interrompa a aplicação com `Ctrl+C`; o banco continua ligado até `npm run db:stop`. Consulte [banco local e migração](docs/BANCO-LOCAL.md).

O portal abre na tela de login, sem escolher um usuário automaticamente. A conta inicial normal é provisionada por `scripts/bootstrap-admin.mjs` a partir de configuração externa; não há senha fixa no código. A senha temporária dessa conta deve ser trocada no primeiro acesso. A gestão fica em **Usuários e permissões**: criar contas, definir departamentos, conceder abas/ações, resetar senha temporária e ativar/desativar.

Em 13/10/2026, foram solicitados dois [acessos temporários para testes locais](docs/ACESSO-TEMPORARIO-TESTES.md). Quando habilitados pela configuração privada, entram diretamente como administrador ou operador em um tenant fictício, sem e-mail/código/etapa adicional. Devem ser removidos antes da implantação na VPS; não alteram as credenciais normais.

Cargo é identificação, não um teto de acesso. O administrador pode conceder qualquer permissão a um operador também. Sem `tasks.team.view`, o usuário vê somente suas tarefas; com essa concessão vê a equipe dos seus departamentos. A API revalida os acessos persistidos a cada requisição. Não existe mais troca livre de perfil. Sessão fica na memória do cliente/servidor, expira em uma hora e exige novo login ao recarregar/reiniciar.

## O que está disponível

| Módulo              | Comportamento atual                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visão geral         | Indicadores por departamento e competência, com acesso às tarefas correspondentes.                                                                                                                                                    |
| Tarefas             | Busca, filtros, paginação, tarefas avulsas, execução por etapas e evidências PDF/XML. Conferência por outra pessoa, espera pelo cliente, devolução, solicitação/aprovação de dispensa, redistribuição e reabertura com justificativa. |
| Empresas e carteira | Consulta, cadastro e importação CSV com prévia; preservação de CNPJs já cadastrados.                                                                                                                                                  |
| Modelos             | Criação e edição de rotinas mensais e suas etapas, cópia de fluxos, salvamento versionado e geração manual idempotente por competência. |
| Documentos          | Consulta e download das versões das evidências dentro do escopo autorizado.                                                                                                                                                           |
| Relatórios          | Pendências, entregas, matriz de obrigações, volume por colaborador e dispensas/reaberturas; CSV e impressão pelo navegador.                                                                                                           |
| Configurações       | Consulta da estrutura, histórico e informações do ambiente, conforme a permissão de acesso. |
| Usuários e permissões | Contas individuais, cargos informativos, departamentos, abas/ações por pessoa, ativação/desativação e reset de senha temporária. |
| Painel de TV | Prévia dedicada, progresso, prazos, entregas e rodízio; dispositivos com configuração, vinculação por código e revogação. |

A interface usa a paleta definida: `#16AFC4`, `#0E7F87`, `#15202B`, `#F2F5F6` e branco, com transparências e misturas desses tons. A identificação é textual; não foi criada logomarca.

### Editar um fluxo

Em **Modelos de tarefa**, abra o modelo e escolha **Editar modelo e fluxo**. Usuários com `templates.manage` podem incluir, renomear, remover e ordenar etapas, começar pelo fluxo padrão ou copiar as etapas de outro modelo do mesmo departamento. Evidência e conferência continuam configuradas no modelo. O fluxo salvo é uma sequência de etapas de execução; ramificações e processos entre departamentos ainda estão pendentes.

Ao salvar, o modelo recebe uma nova versão auditada. Novas tarefas geradas recebem uma cópia dessas etapas e exigências. Tarefas já geradas mantêm sua versão, seus documentos e seu andamento; gerar novamente a mesma competência não as substitui. Se outra pessoa editar o modelo enquanto o formulário está aberto, o servidor recusa a versão desatualizada para evitar sobrescrever a alteração.

## Estrutura e persistência

```text
apps/web       React + Vite + TypeScript; módulos e componentes compartilhados
apps/api       NestJS; contratos HTTP, sessões locais e autorização
packages/domain Tipos, validação, regras operacionais e repositório em memória
supabase/migrations SQL versionado para PostgreSQL
scripts        Execução, migração, backup, transferência e testes
```

Na execução local PostgreSQL, tarefas, cadastros, contas, permissões, auditoria e bytes das evidências persistem ao reiniciar. Sessões permanecem em memória e exigem novo login. O build estático demonstrativo anterior não oferece identidade persistente e não deve ser usado como substituto do sistema com backend.

`npm run build:preview` produz essa prévia em `dist`. `npm run build` compila os três pacotes. O adaptador PostgreSQL implementa transações, restrições e RLS; Supabase Auth e configuração da infraestrutura ainda precisam ser integrados. A transferência de dados foi testada entre bases PostgreSQL locais, sem afirmar implantação em Supabase. Consulte [a arquitetura](docs/ARQUITETURA.md).

## Verificações

```powershell
npm run check
npm run test:database
npm run test:workflows
npx playwright install chromium
npm run test:e2e
npm audit
```

`check` executa tipagem, lint, testes de domínio/API e build. Os testes de navegador usam login e contas reais em um banco local temporário, com portas próprias, sem alterar a conta inicial ou a base principal. `test:database` usa outras bases temporárias para regras, SQL, carga e recuperação. `test:massive` reúne essas verificações. A instalação do Chromium é necessária somente na primeira execução. Os testes anteriores do seletor de demonstração ficaram como referência histórica; não validam o fluxo atual. Os controles e limites estão descritos em [segurança](docs/SEGURANCA.md).

`test:workflows` verifica edição, concorrência, autorização, isolamento e geração de fluxos em uma base PostgreSQL temporária. Usa sessões sintéticas isoladas para exercitar a API; não comprova login por senha, recuperação ou MFA. A base temporária é removida ao terminar.

`npm run test:tv` verifica concessões, concorrência, identidade própria da TV, sanitização, RLS, revogação e migração de configurações em bases temporárias. Usa sessões humanas sintéticas; não valida login/MFA normal.

## Painel de TV

Para visualizar movimento com exemplos fictícios, use **Simular operação → Abrir painel**. O modo é temporário, só funciona em desenvolvimento e não altera o banco. **Usar dados reais** encerra a simulação. A remoção está registrada em [simulação temporária da TV](docs/TV-SIMULACAO-TEMPORARIA.md).

Na aba **Painel de TV**, use **Abrir painel** para visualizar a operação em uma tela dedicada com fundo branco e contrastes azuis Ápice. A prévia reúne todos os departamentos autorizados na competência selecionada. Indicadores ficam no topo; tarefas aparecem ligadas ao nome do responsável à esquerda, e todos os colaboradores ativos do escopo à direita, incluindo quem está sem tarefas. `tv.team.view` controla a exposição de nomes e andamento individual, concedível a qualquer cargo. Nomes das empresas continuam opcionais. As listas ajustam sua quantidade de linhas ao espaço e alternam páginas automaticamente.

O menu de status em **Tarefas da equipe** e **Minhas tarefas** usa o componente compartilhado `FilterMenu`: opções distribuídas na largura, contadores legíveis e seleção azul. A apresentação é a mesma para administrador e operador; o conteúdo segue os acessos concedidos.

Para uma TV independente, cadastre o dispositivo, configure seus blocos/departamentos e gere um código de vinculação. Abra `http://127.0.0.1:5173/#/tv` no navegador do dispositivo e informe o código. O acesso da TV é somente consulta e usa uma credencial própria em cookie HttpOnly; nenhuma senha pessoal ou token é colocado no link. O código expira em dez minutos e só funciona uma vez. Novo código ou desativação revogam o vínculo anterior. Consulte [o painel de TV](docs/PAINEL-TV.md) para permissões, configuração e limites da execução local.

Leia [o contexto permanente](docs/CONTEXTO.md) antes de continuar. `AGENTS.md` instrui o Codex a preservar suas decisões e atualizar esse resumo a cada etapa relevante. O painel esquerdo usa o azul Ápice `#16AFC4` e os destaques priorizam os azuis definidos.

## Limites desta entrega

Esta versão cobre a base do ciclo mensal e não todos os requisitos do PRD. Permanecem pendentes: MFA/recuperação de conta e política corporativa, configuração da VPS, retenção e recuperação, calendário oficial e feriados, geração agendada e outras periodicidades, cliente com múltiplas empresas, processos entre departamentos, histórico de regimes e carteira por departamento, edição/versionamento completo dos modelos, integrações e publicação para o Portal do Cliente, perfis por departamento/carteira. O P.O.P. exibido é demonstrativo; não há gestão de procedimentos. O relatório de produtividade mede volume e prazo, sem contabilizar tempo ativo. Consulte [a auditoria do PRD](docs/AUDITORIA-PRD-2026-10-08.md) e [a revisão após as correções](docs/REVISAO-E-VALIDACAO-2026-10-08.md).
