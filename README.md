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

- Entrada pelo ecossistema, login individual e controle de abas/ações, sem teto por cargo. Os três grupos usam ambientes fictícios separados na demonstração local; autenticação normal de Go/Condomínios ainda exige implantação própria.
- Menu azul Ápice recolhível, logo oficial branca e itens reordenáveis por arraste ou Alt+setas no controle. A ordem é uma preferência por usuário/navegador.
- Departamentos configuráveis: cargos com nome livre, pessoas, liderança por setor e ordem de apresentação. Um vínculo organizacional não altera permissões automaticamente. Configurações → Departamentos gerencia essa estrutura; Usuários e permissões gerencia acessos, cópia/modelos e importação de contas.
- Visão geral com indicadores clicáveis, calendário de meta/prazo legal e visão operacional conforme acesso; tarefas em lista/quadro, execução, espera, conferência independente, cancelamento, dispensa, reabertura e comentários com histórico.
- Empresas com código informado, filtros/agrupadores, carteira por colaborador, responsabilidades individuais/fila/sem obrigações por setor, situação de atendimento e competência de efeito. Mudanças operacionais seguem para a Central do gestor, com impacto, decisão e preservação do histórico.
- Modelos de tarefas com etapas editáveis e versões. Novas tarefas recebem cópia; tarefas existentes preservam andamento, documentos e requisitos. Geração repetida não duplica obrigações.
- Fluxos e Processos: modelos sequenciais entre departamentos, etapas, prazos, responsáveis e kanban. Implantação inicial única por empresa e processos gerais reutilizáveis. O gestor decide se a rotina aguarda todos os setores ou começa em paralelo.
- Múltiplos anexos por tarefa, versões por documento, tipos e regras documentais editáveis. Envio em lote sugere vínculos e exige revisão humana antes de gravar. Verificação de formato não representa validação fiscal oficial.
- Importação/exportação de empresas, modelos, atividades e relatórios; importação de usuários baseada em modelos de acesso; transferências de tarefas e propostas de carteira em lote com validação atômica. A exportação normal de usuários não contém senhas. O resultado da importação permite baixar senhas temporárias individuais uma única vez na janela, exigindo troca no primeiro acesso.
- Catálogo de 31 relatórios com seis principais, filtros por datas/empresa/pessoa/escopo, CSV e impressão completa. Desempenho individual exige permissão própria. Painel de TV com consulta, dispositivos, departamentos configuráveis e simulação temporária identificada.

### Fluxos, tarefas e alterações

Em **Modelos de tarefa**, abra um modelo para editar etapas ou copiar um fluxo. Em **Fluxos e Processos → Modelos e blocos**, crie a sequência dos setores; o exemplo de implantação apenas preenche um rascunho que o gestor revisa antes de salvar. Concluir/conferir a tarefa atual libera a próxima etapa, respeitando documentos e permissões.

Ao editar regime, responsáveis ou situação da empresa, informe competência e motivo e envie para a **Central do gestor**. A aprovação revalida a versão, registra histórico, gera obrigações aplicáveis e sinaliza tarefas incompatíveis para revisão. O gestor deve confirmar se a tarefa permanece necessária ou cancelá-la com justificativa. Entregas anteriores e documentos são preservados. O catálogo fiscal oficial ainda precisa ser validado e configurado; regime sozinho não determina todas as obrigações.

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

Revisão integrada mais recente: [auditoria de 17/10/2026](docs/AUDITORIA-INTEGRADA-2026-10-17.md), com correções nas conexões, verificações realizadas e requisitos ainda parciais. O protótipo não representa PRD integral nem prontidão para VPS.

```powershell
npm run check
npm run test:database
npm run test:workflows
npm run test:onboarding
npm run test:tv
npm run test:massive
npx playwright install chromium
npm run test:e2e
npm audit
```

`check` executa tipagem, lint, testes de domínio/API e build. `test:massive` executa check, carga/recuperação/identidade PostgreSQL, fluxos, jornadas entre módulos e TV em bases temporárias, conferindo preservação da principal e limpeza. Logs privados em `.local/verification/`. Detalhes em [testes massivos](docs/TESTES-MASSIVOS-2026-10-17.md). Testes de navegador são separados: usam banco temporário/portas próprias e dependem do controle de navegador disponível. A instalação do Chromium é necessária somente na primeira execução. Os testes antigos do seletor demo são referência histórica; controles e limites em [segurança](docs/SEGURANCA.md).

`test:workflows` verifica edição, concorrência, autorização, isolamento e geração de fluxos em uma base PostgreSQL temporária. Usa sessões sintéticas isoladas para exercitar a API; não comprova login por senha, recuperação ou MFA. A base temporária é removida ao terminar.

`npm run test:tv` verifica concessões, concorrência, identidade própria da TV, sanitização, RLS, revogação e migração de configurações em bases temporárias. Usa sessões humanas sintéticas; não valida login/MFA normal.

## Painel de TV

Para visualizar movimento com exemplos fictícios, use **Simular operação → Abrir painel**. O modo é temporário, só funciona em desenvolvimento e não altera o banco. **Usar dados reais** encerra a simulação. A remoção está registrada em [simulação temporária da TV](docs/TV-SIMULACAO-TEMPORARIA.md).

Na aba **Painel de TV**, use **Abrir painel** para visualizar a operação em uma tela dedicada com fundo branco e contrastes azuis Ápice. A prévia reúne todos os departamentos autorizados na competência selecionada. Indicadores ficam no topo; tarefas aparecem ligadas ao nome do responsável à esquerda, e todos os colaboradores ativos do escopo à direita, incluindo quem está sem tarefas. `tv.team.view` controla a exposição de nomes e andamento individual, concedível a qualquer cargo. Nomes das empresas continuam opcionais. As listas ajustam sua quantidade de linhas ao espaço e alternam páginas automaticamente.

O menu de status em **Tarefas da equipe** e **Minhas tarefas** usa o componente compartilhado `FilterMenu`: opções distribuídas na largura, contadores legíveis e seleção azul. A apresentação é a mesma para administrador e operador; o conteúdo segue os acessos concedidos.

Para uma TV independente, cadastre o dispositivo, configure seus blocos/departamentos e gere um código de vinculação. Abra `http://127.0.0.1:5173/#/tv` no navegador do dispositivo e informe o código. O acesso da TV é somente consulta e usa uma credencial própria em cookie HttpOnly; nenhuma senha pessoal ou token é colocado no link. O código expira em dez minutos e só funciona uma vez. Novo código ou desativação revogam o vínculo anterior. Consulte [o painel de TV](docs/PAINEL-TV.md) para permissões, configuração e limites da execução local.

Leia [o contexto permanente](docs/CONTEXTO.md) antes de continuar. `AGENTS.md` instrui o Codex a preservar suas decisões e atualizar esse resumo a cada etapa relevante. O painel esquerdo usa o azul Ápice `#16AFC4` e os destaques priorizam os azuis definidos.

## Limites desta entrega

Esta versão ainda não cobre todos os requisitos do PRD. Permanecem pendentes a configuração/validação corporativa de SMTP, recuperação e MFA, implantação da VPS, operação de retenção/recuperação, calendário oficial e feriados, catálogo fiscal validado, geração agendada e outras periodicidades, autenticação normal e regras específicas dos demais grupos, cliente com múltiplas empresas, editor de ramificações, aprovação universal de mudanças, integrações e publicação para o Portal do Cliente. O P.O.P. exibido é demonstrativo; não há gestão de procedimentos. O relatório de produtividade mede volume e prazo, sem contabilizar tempo ativo. Consulte [a auditoria do PRD](docs/AUDITORIA-PRD-2026-10-08.md) e [a revisão após as correções](docs/REVISAO-E-VALIDACAO-2026-10-08.md).
