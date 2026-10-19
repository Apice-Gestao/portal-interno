# Revisão dos ajustes e da arquitetura — 17/10/2026

Autor: Codex, com três revisões independentes em leitura. Estado examinado: sete commits após `416f104`, até `906da48`, e alterações ainda não commitadas em `PortalContext.tsx`, `main.tsx` e `portal-client.ts`.

**Esta é uma auditoria, não uma entrega de correções.** Os comportamentos abaixo continuam presentes na revisão analisada. Os arquivos funcionais do usuário foram preservados. O parecer anterior permanece como histórico; este documento registra o que mudou e o que precisa ser corrigido ou avaliado pelo Claude.

## Conclusão

Os ajustes ampliaram a demonstração: fluxos unificados, etapas por empresa, situações editáveis, relatórios combinados/agrupados e geração mensal automática. A stack e a direção de monólito modular continuam adequadas. A arquitetura de acesso aos dados ainda é a mesma do parecer anterior, e os relatórios combinados aumentam seu custo.

Foram encontrados **14 achados reproduzidos**, incluindo bloqueio de tipagem em trabalho não commitado, inconsistências de autorização, geração e filtros. Há também duas limitações da rotina automática que exigem uma política operacional. Testes existentes aprovados não significam que esses novos caminhos estejam cobertos.

Prioridade P1 indica correção prioritária para validar/pilotar; P2 indica erro relevante em um cenário específico. Não foi constatado bypass do login operacional nesta revisão. Os problemas exclusivos da prévia estão identificados separadamente.

## Verificações realizadas

| Verificação | Resultado desta revisão |
| --- | --- |
| `npm run check` | **Falhou** na tipagem web: `PortalState` usado sem import em quatro posições do cliente não commitado; etapas seguintes do comando não rodaram |
| `npm test`, executado separadamente | **304 testes em 21 arquivos aprovados**, com builds de domínio/API |
| `npm run lint`, separadamente | Sem erros; dois avisos de Fast Refresh nos componentes auxiliares de `main.tsx` |
| `npm run build:preview` | Aprovado; alerta de chunk acima de 500 kB |
| Cenários PostgreSQL existentes | **74 aprovados**: 24 banco/carga/identidade/recuperação + 8 modelos/fluxos + 29 jornadas/relatórios + 13 TV |
| Preservação | Impressão digital da principal igual antes/depois; zero novas bases temporárias restantes |
| Reproduções adicionais | Em memória, doubles de banco, consulta real de privilégio runtime e interação amostral no navegador |
| Navegador | Prévia fictícia local na porta 4174, sem API; entrada, navegação, filtros e amostra do relatório em 375 px |

Logs/relatórios privados: `.local/verification/architecture-review-20261017/`. A automação foi desativada **somente nos processos dos testes** com `AUTO_GENERATION=off`, para que os cenários existentes não disparassem geração horária fora do recorte. A geração nova foi examinada separadamente; os 74 cenários não a validam integralmente.

O portal/API estavam desligados no início. O PostgreSQL exclusivo foi iniciado para executar testes em bases descartáveis; não foi executado seed, migração ou preparação da principal. Não houve envio de e-mail, publicação ou uso de dados reais. A prévia temporária foi encerrada após a conferência.

## Achados prioritários

### R01 — P1 — A validação oficial falha nas alterações não commitadas

**Local:** `apps/web/src/services/portal-client.ts:192–228`, bloco de imports de tipos em `:32–70`.

`DemoRepository.replace`, `freshDemoState` e a restauração de JSON usam `PortalState`, mas esse tipo não foi importado. `npm run check` encerrou com quatro erros TS2304. Isso está no trabalho não commitado, não no último commit publicado no Git local.

**Solução:** incluir o import de tipo e repetir a verificação completa após concluir esse trabalho. O build Vite isolado não substitui o typecheck, pois pode apagar anotações de tipos e gerar o bundle mesmo com esse erro. Nenhuma alteração foi feita no arquivo durante a auditoria.

### R02 — P1 — A rotina automática não descobre todos os grupos com o papel normal do banco

**Local:** `apps/api/src/database/postgres-store.ts:371–384`; `apps/api/src/database/migrations.ts:40–62`; `scripts/local-db.mjs:152`.

`tenantIds()` consulta `portal.tenants`, mas o papel runtime provisionado não recebe SELECT nessa tabela. O erro é capturado e a rotina usa somente `PORTAL_TENANT_ID`. O agendamento promete percorrer todos os grupos, porém ignora silenciosamente os demais após o aviso genérico.

**Prova real em leitura:** o papel runtime retornou `has_table_privilege(...,'portal.tenants','SELECT') = false`; a base tinha quatro tenants, e `store.tenantIds()` retornou apenas um. Reproduzido também com doubles do migrador/pool. Não foi chamada geração contra a principal.

**Solução:** definir uma descoberta de tenants autorizada para o job — configuração explícita ou acesso restrito apropriado — e tornar falha de descoberta observável. Não usar credencial de proprietário para contornar o problema. Acrescentar teste com o papel runtime e mais de um tenant; a geração automática em memória não cobre esse caso.

### R03 — P1 — Personalizações de outro departamento entram no snapshot e na resposta de empresa

**Local:** `packages/domain/src/engine.ts:195–216,1643–1696`; `apps/api/src/portal/portal.controller.ts:383–398`.

O novo `Company.workflowOverrides` guarda etapas de modelos de vários departamentos. A projeção de empresa copia o campo inteiro; o filtro de templates por departamento não o remove. Um operador apenas do Fiscal recebe no snapshot etapas personalizadas de um modelo do Pessoal, embora o próprio template do Pessoal esteja oculto.

**Prova em memória:** `companyVisible=true`, `foreignTemplateVisible=false`, `foreignWorkflowVisible=true`, usando tarefa própria e um override sintético do Pessoal. Não é vazamento entre tenants; é extrapolação do recorte de departamento no mesmo tenant.

Há um segundo caminho no mesmo limite: com apenas `templates.view/templates.manage`, sem consulta de empresas/tarefas, o snapshot contém zero empresas; `setCompanyWorkflow` aceita um ID do mesmo tenant e retorna a empresa inteira, incluindo CNPJ e demais overrides. O grant `templates.manage` foi escolhido para autorizar a personalização, mas a resposta não é uma projeção restrita a essa ação.

**Solução:** definir DTOs de leitura por finalidade e filtrar overrides pelos templates/departamentos autorizados. Retornar somente o resultado necessário da personalização. Preservar a permissão aprovada para editar etapas, sem conceder implicitamente consulta integral de empresa ou dos outros setores. Testar também resposta direta do endpoint e relatórios/exportações que consumam a projeção.

### R04 — P1 — Agrupar por colaborador entrega indicador de desempenho sem sua concessão específica

**Local:** `packages/domain/src/reports.ts:492–505,764–819`.

O catálogo bloqueia `productivity` sem `reports.performance.view`, mas o agrupamento `owner` em relatórios operacionais acrescenta `% concluídas na meta` nominal por colaborador sem validar essa concessão. O texto “não avaliam pessoas” não altera os dados transmitidos.

**Prova em memória:** conta com `reports.view`, `tasks.view` e `tasks.team.view`, sem grant de desempenho: `productivity` recusado com 403; `reconciliation` agrupado por responsável retorna o percentual de cada pessoa, além dos totais. Não se está propondo bloquear simples nomes ou contagens operacionais, que outros painéis já permitem.

**Solução:** revalidar o contrato das métricas individuais e condicionar os indicadores de desempenho à concessão própria no domínio/API. O agrupamento operacional pode continuar disponível com as colunas permitidas. Testar requisição direta e revogação, além de esconder opções na tela. A orientação de validar autorização também no recurso/resposta está alinhada à [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### R05 — P1 — Empresa suspensa pode continuar recebendo tarefas após ter estado em encerramento

**Local:** `packages/domain/src/engine.ts:2461–2467`; `packages/domain/src/workspace.ts:131–157,194–197`.

**Gatilho:** aprovar encerramento a partir de outubro com término em dezembro; depois suspender em novembro. A projeção fica `suspended`, `active=false`, mas mantém o término. A geração ignora `active=false` enquanto a competência não ultrapassar esse término — condição anterior que não distingue suspensão.

**Prova em memória:** cinco tarefas novas em novembro para a empresa suspensa. A regra nova de situações declara que suspensão pausa a recorrência.

**Solução:** centralizar a decisão de elegibilidade por situação/base e competência. Encerramento, suspensão e inativação precisam ter seus efeitos próprios, preservando a vigência e o histórico. Testar a sequência completa, não apenas cada situação isoladamente.

## Outros erros confirmados

### R06 — P2 — Reativar com situação personalizada pode conservar um término vencido

**Local:** `packages/domain/src/workspace.ts:152–153`; `engine.ts:2463–2467`.

Empresa com término em outubro, reativada em novembro pela situação cadastrada `active:retomada`, fica ativa, mas conserva o término e gera zero tarefas em novembro. O código limpa o campo apenas quando o status é exatamente `active`.

**Solução:** usar a base semântica da situação para transições de reativação e definir como limpar o término conforme o histórico. Cobrir `active` e `active:*`, inclusive sequência de encerramento/retomada.

### R07 — P2 — Proposta pendente pode aprovar uma situação removida do catálogo

**Local:** `packages/domain/src/engine.ts:832–848,1428–1436`.

Criar proposta de suspensão personalizada, remover a definição ainda não aplicada a empresa/histórico e depois aprovar a proposta funciona. O estado aprovado passa a referenciar uma situação órfã. A remoção considera empresas e histórico, mas não propostas pendentes; a aprovação não revalida o catálogo de situações.

**Solução:** revalidar referências no momento da decisão e bloquear remoção em uso pendente ou exigir revisão/rejeição explícita da proposta. A base `suspended` ainda é interpretada, mas o cadastro perde sua definição e o nome configurado.

### R08 — P2 — Editor por empresa não detecta mudança concorrente do modelo geral

**Local:** `packages/domain/src/schemas.ts:389–400`; `engine.ts:1651–1684`; `CompanyWorkflows.tsx:190–209`.

O pedido carrega a revisão da empresa, mas não a versão do modelo vista pelo gestor. Abrir o editor na v2, atualizar o modelo geral para v3 em outra sessão e salvar as etapas antigas funciona; o servidor grava `baseVersion=3`. A personalização parece atual e o aviso de modelo desatualizado não aparece, embora o gestor nunca tenha revisado a v3. O mesmo cuidado vale para “Manter minha versão”.

**Prova em memória:** versão aberta 2, servidor 3, base gravada 3, passos antigos preservados, `isWorkflowOverrideOutdated=false`.

**Solução:** validar também a versão esperada do modelo e registrar a versão efetivamente revisada. Distinguir conflito da empresa de conflito do modelo, preservando o rascunho para revisão.

### R09 — P2 — Quadro do gestor esconde tarefas de responsáveis desativados ou sem execução

**Local:** `apps/web/src/modules/changes/TeamTasks.tsx:34–79`.

As colunas incluem somente pessoas ativas com `canExecute`, mas tarefas abertas continuam atribuídas a pessoas desativadas ou que perderam a concessão. Essas atividades entram nos indicadores, porém não têm coluna/cartão e não há grupo de regularização.

**Prova em memória:** ao desativar a responsável com 24 tarefas, o resumo mostra 35 abertas, mas o quadro apresenta somente 11. A lacuna anterior de desativação sem transferência automática não justifica ocultar as pendências.

**Solução:** incluir qualquer responsável que ainda tenha tarefas no recorte, sinalizando sua condição, ou agrupá-las para regularização/transferência. Não conceder execução ao responsável inativo; trata-se de visibilidade para o gestor autorizado.

### R10 — P2 — Troca de formato permite esconder a última coluna de um relatório

**Local:** `ReportResultView.tsx:71,105`; `ReportsPage.tsx:133–140,284–288,308–313`.

O número visível é `columns.length - hidden.length`, incluindo IDs ocultos que não existem mais no formato atual. As preferências são por relatório, enquanto colunas mudam por agrupamento/escopo.

**Reprodução:** Pendências em todos os setores tem nove colunas; esconder oito e manter Empresa. Mudar para um setor remove Departamento, mas conserva seu ID em `hidden`. A contagem calculada vira zero, embora haja uma coluna real; a proteção `visible===1` falha e permite esconder Empresa. Tela, CSV e impressão podem ficar sem colunas.

**Solução:** intersectar IDs ocultos com as colunas atuais, normalizar a preferência e garantir pelo menos uma coluna válida a cada mudança de formato, inclusive após carregar preferências antigas.

### R11 — P2 — Limpar data remove o filtro, mas mantém a data na apresentação

**Local:** `apps/web/src/shared/ui/CompetencePicker.tsx:544–560`; uso em `ReportFiltersForm.tsx:127–140` e `DocumentsPage.tsx:381–398`.

`value ?? local` mistura o estado recebido com o interno. Escolher data a partir de vazio preenche ambos; Limpar com `value` definido só limpa o pai. Quando o pai volta a `undefined`, o campo ressuscita o estado interno anterior.

**Prova no navegador:** em Conciliação, base Prazo legal, escolher início 17/10/2026 e Limpar. O campo continua “17/10/2026”; gerar apresenta “Prazo legal: início do histórico até fim do histórico”, com 51 registros. Também reproduzido por harness do componente real. O usuário pode interpretar um recorte que não está aplicado.

**Solução:** contrato explícito de componente controlado ou não controlado, com vazio representado sem fallback indevido. Regressão de escolher/limpar/restaurar e mudança de período. A distinção de controle de campos está documentada pelo [React](https://react.dev/reference/react-dom/components/input); neste caso, a comprovação do erro é do componente customizado do projeto.

### R12 — P2 — Prévia não commitada restaura o anexo sem restaurar seu conteúdo

**Escopo:** somente demonstração no navegador, não o PostgreSQL operacional.

**Local:** `portal-client.ts:191–194,424,493–494,510–515`.

O novo `DemoRepository` persiste metadados no `localStorage`, enquanto os bytes continuam em um `Map` volátil. Anexar um PDF e recarregar restaura o registro, mas o download responde `MISSING_CONTENT/503`.

**Prova:** PDF sintético de 661 bytes, duas instâncias isoladas do módulo com o mesmo armazenamento. Metadado presente, conteúdo ausente. Não significa perda dos anexos do backend.

**Solução:** persistir blobs de demonstração em armazenamento apropriado, como IndexedDB, ou marcar/remover explicitamente anexos não recuperáveis na restauração. Não anunciar persistência integral sem cobrir os bytes; definir versão e limpeza do estado de demonstração.

### R13 — P2 — Selecionar o grupo pode apagar a sessão que a prévia acabou de restaurar

**Escopo:** alterações não commitadas, somente demonstração.

**Local:** `App.tsx:588`; `OrganizationProvider.tsx:6`; `PortalContext.tsx:23–30`; `portal-client.ts:611–615`.

O grupo não é restaurado. Depois de recarregar aparece o ecossistema; selecionar um grupo remonta o provider pela sua `key`. O cleanup do cliente anterior chama `logout()`, que agora apaga sessão e rota persistidas. O novo cliente continua conectado em memória, mas a próxima recarga já perdeu essa restauração.

**Prova por ciclo dos clientes em VM:** primeira restauração verdadeira; após remount/cleanup, próxima restauração falsa. Não afeta a sessão HTTP normal, que não implementa `restoreSession`.

**Solução:** coordenar grupo e sessão e separar descarte de cliente de logout explícito. O [React documenta](https://react.dev/reference/react/useEffect) que cleanups também acompanham encerramento/reexecução do efeito; não representar todo descarte como intenção do usuário de sair.

### R14 — P2 — Falta normalizar referências do estado persistido da demonstração

**Local:** `portal-client.ts:225–232`; `main.tsx:22–43`; função `resetDemo` em `portal-client.ts:244–247`.

O estado salvo é aceito por cast após `JSON.parse`; somente erro de sintaxe é tratado. JSON válido e incompatível com `PortalState` pode ser restaurado e quebrar o motor/entrada. Recarregar pelo ErrorBoundary volta ao mesmo estado persistido, e `resetDemo()` não tem uma ação acessível na interface examinada.

**Cenário comprovável pelo caminho de restauração:** JSON sintaticamente válido sem as coleções obrigatórias passa pelo cast; operações que usam `users`/`tasks` falham. A persistência nova precisa de contrato de versão, e não apenas de nome de chave. Não é evidência de exploração ou vazamento de dados reais.

**Solução:** validar versão/estrutura antes de construir o repositório, migrar formatos suportados e oferecer restauração da demonstração com dados fictícios íntegros. Preservar o aviso sobre dados somente locais.

## Limitações da nova automação que precisam de decisão operacional

### A01 — Um cadastro inválido impede gerar tarefas para todo o grupo

`autoGenerate` gera todos os setores em um estado e só o publica ao final (`engine.ts:2398–2412`). Um responsável explícito desativado dispara `NO_OWNER` (`:2531–2535`). Foi reproduzido: uma empresa com esse problema impede novas tarefas dos outros clientes/setores no mesmo grupo. A atomicidade atual funciona, mas sua unidade é ampla.

Definir geração por empresa/setor com atomicidade e resultado por unidade, registro da falha e tentativa idempotente. Preservar a alternativa manual e evidenciar ao gestor o que não gerou. Não implementar gravações parciais silenciosas nem atribuir trabalho automaticamente a alguém sem regra aprovada.

### A02 — Não há recuperação automática de competências perdidas

A rotina sempre calcula só o mês que acabou de fechar (`auto-generation.service.ts:60`, `engine.ts:2384`). Execução em 17/10 e a seguinte em 01/12 gera setembro e novembro, deixando outubro sem geração. Não há marco persistido/varredura dos períodos faltantes.

Definir competência inicial, último processamento e recuperação limitada/confirmável. Não presumir geração retroativa fiscal irrestrita. O agendamento em memória e o bloqueio local `running` não substituem checkpoint durável, observabilidade e recuperação após indisponibilidade.

## Arquitetura reavaliada

| Tema | Estado atual e implicação |
| --- | --- |
| Limites dos módulos | Pastas por domínio, mas `AppModule` e `PortalEngine` ainda concentram composição e casos de uso. A nova automação entra nesse motor global |
| Consultas | Snapshot integral do tenant e polling humano de 5 s continuam. Inclui auditoria e metadados; não lê todos os bytes de anexos |
| Relatórios combinados | `useQueries` em `ReportsPage.tsx:195–207` pode iniciar até 31 requisições; cada `store.report` faz `loadState` completo. Cada seção pode representar um instante diferente |
| Escritas | Lock por tenant, cópias do estado e persistência de diferenças/CAS preservados. Leituras de relatório não usam esse lock de escrita |
| Personalização | Overrides no JSON da empresa compartilham a revisão da empresa com regime/carteira/situação. Isso amplia acoplamento entre mudanças de setores diferentes |
| Jobs | Timer de 20 s e intervalo de uma hora no processo HTTP, sem fila/checkpoint persistido. `AUTO_GENERATION=off` existe; não há governança operacional completa do agendamento |
| Identidade de sistema | Uso interno por ID reservado; não há emissão de sessão de sistema no fluxo revisado. Recomenda-se porta específica para o job, com capacidade delimitada, em vez de ampliar o caminho genérico de ator |
| Sessões e conexões | Continuam em memória, teto de 100 sessões por processo; até 24 conexões somadas por processo. Sem mudança estrutural que permita replicar transparentemente |
| Prévia | Mesmo arquivo reúne cliente HTTP, fixtures, motor, demonstração, armazenamento e TV fictícia. A persistência local nova não muda a persistência real PostgreSQL |
| Estilos | `clean-list.css` sobrepõe módulos com seletores de alta especificidade; ajuda no refino atual, mas acumular camadas dificulta prever efeitos globais. Consolidar tokens/componentes quando a apresentação estabilizar |
| Produção | Trava de desenvolvimento/origem local/loopback permanece. VPS, SMTP corporativo, remoções temporárias e recuperação operacional continuam pendentes |

Nova carga local desta revisão: **3.381.491 bytes** por snapshot de 4.000 tarefas, 40 leitores, p50 **2.416 ms** e p95 **4.023 ms**. Comparação apenas indicativa com a execução anterior de 3.524 ms no p95; variabilidade da máquina e do teste impede atribuir a diferença às funcionalidades novas. Não é benchmark HTTP, navegador ou VPS. O campo de tempo do lote de geração também inclui consulta de conferência.

Continua recomendável manter o monólito e especializar consultas/transações. Concordo com o ajuste de momento registrado pelo Claude: preservar a fase de demonstração e executar a primeira fatia estrutural antes do piloto com dados reais/VPS. Contudo, correções de comportamento/permissão acima não dependem de esperar por essa refatoração.

Para relatórios combinados, um passo intermediário é limitar a combinação e executar as seções sobre um recorte de leitura coerente reutilizado; depois consultas SQL por família e paginação real. Para overrides, avaliar um agregado próprio por empresa/modelo com versão específica e DTO autorizado, sem reescrever o banco inteiro.

## Confirmações e limites da avaliação

- Não foi identificada duplicação de tarefas nas disputas já cobertas: unicidade e CAS continuaram aprovados.
- Relatórios revalidam tipo, tenant e departamentos no domínio; cache inclui identidade/concessões/filtros. A exceção encontrada é a nova métrica individual por agrupamento.
- Filtros incompatíveis em relatórios combinados são informados por seção. Exportação/impressão usam as linhas completas e são bloqueadas com filtro pendente/erro/carregamento; a regressão de colunas precisa ser corrigida.
- Personalização por empresa mantém tarefas existentes intactas; o problema de versão concorrente afeta a versão declarada como revisada.
- `closedCompetence` considera São Paulo, inclusive mudança de ano e madrugada UTC antes da virada local.
- Rotas unificadas validam concessões na navegação e no guard. Não foi constatado que remover o item “Modelos” tenha removido os controles de acesso.
- A amostra móvel de Relatórios estabilizou em largura de página 375 px para viewport 375 px. Não foi repetida a varredura anterior de todas as telas/cinco larguras nem a cadeia inteira do tutorial nesta revisão.
- Não houve pentest externo, validação fiscal oficial ou teste na VPS. O PRD integral não passou a estar concluído por estas alterações.

## Encaminhamento para o Claude

1. Concluir a alteração não commitada e restaurar `npm run check` aprovado; não incorporar o parecer como se os achados estivessem corrigidos.
2. Corrigir R02–R05 com testes de papel runtime/múltiplos tenants, autorização de DTO/métrica e transições reais de situação.
3. Corrigir R06–R11 com testes de sequência, concorrência do modelo, responsáveis inativos, formatos de relatório e controle do campo de data.
4. Concluir a persistência da prévia (R12–R14) antes de prometer que alterações/anexos/login sobrevivem à recarga. Manter os avisos de demonstração.
5. Definir A01/A02 e registrar a política da geração. Planejar consultas específicas, módulos e jobs duráveis no marco anterior ao piloto, conforme o [parecer anterior](PARECER-ARQUITETURA-ESCALABILIDADE-2026-10-17.md).

Referências de linha correspondem ao estado examinado e podem se deslocar. Todas as provas usaram fixtures, repositórios em memória, bases descartáveis ou leituras autorizadas; nenhum segredo foi incluído neste documento. Não foi enviado conteúdo ao Claude ou a outro chat: o registro está no repositório para avaliação conjunta.
