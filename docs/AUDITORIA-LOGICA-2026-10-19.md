# Auditoria de lógica de negócio e fluxos — 19/10/2026 (relatório consolidado)

**Agentes:** Claude Code — sessão de auditoria paralela (cenários dirigidos, L01–L14, e correções da seção 6) e sessão principal (bateria massiva, teste de navegador, passeio aleatório, L15–L16 e complementos da seção 7). Consolidado no main pela sessão principal a pedido do usuário, trazendo a branch `claude/eloquent-kepler-dec625`.
**Base auditada:** commit `5221a0b` (worktree `eloquent-kepler-dec625`). As alterações em andamento da outra sessão (relógio de Brasília, `error.filter.ts`, exportação `.xlsx/.pdf`, `PortalContext.tsx`, `TaskForms.tsx`, `TasksPage.tsx`, `ReportsPage.tsx`, `automation.ts`) **não** fazem parte desta base.
**Código do produto:** não alterado durante a auditoria. **Atualização:** o usuário pediu “corrija” e os defeitos L01–L14 foram corrigidos na mesma sessão (ver seção 6). As decisões Q1–Q9 continuam abertas.
**Dados:** só as fixtures fictícias de `createSeed()` e empresas/usuários inventados nos cenários. Nenhuma credencial, token ou dado real foi registrado.

Não reporto de novo o que já foi corrigido em `2922e70` (R02–R14, A01). Também não repito as pendências de decisão já conhecidas — A02 (competências perdidas), permissões diferentes por setor, periodicidade trimestral/anual e feriados —, a não ser quando um achado novo depende delas.

## 1. O que foi executado

| Bateria | Resultado |
| --- | --- |
| `npm test` (vitest, domínio + API) | **passou** — 22 arquivos, 311 testes |
| `npm run test:database` (PostgreSQL 55432, bases descartáveis) | **passou** — 25/25 cenários; limpeza confirmada; base principal preservada |
| `npm run test:massive` | **interrompido na 1ª etapa** (`check` → `typecheck` da web): `@vitejs/plugin-react` não está instalado no `node_modules` desta máquina (nem no checkout principal). É um problema de ambiente, não de lógica. A ferramenta confirmou `mainDatabaseUnchanged: true` e nenhuma base temporária sobrando. |
| Etapas restantes da bateria massiva, rodadas uma a uma | `test:workflows` 8/8, `test:onboarding` 29/29 e `test:tv` 13/13 passaram; `lint` passou; `tsc --noEmit` do domínio e da API passou |
| Cenários de auditoria em memória (`MemoryRepository` + `PortalEngine`, usuários com grants explícitos como no banco) | ~150 verificações e sondagens em tarefas, empresas, propostas, carteira, modelos, geração, implantações, documentos, os 31 relatórios, datas, TV e configurações |

Todas as baterias rodaram com `AUTO_GENERATION=off`, e as variáveis do `.env` local foram carregadas só no processo (nenhum valor impresso).

**Pendência de ambiente:** para a bateria massiva completa rodar, instale as dependências da web (`npm install`) e repita `npm run test:massive`. Typecheck e build da web não foram verificados nesta sessão.

**Na sessão principal** (checkout com todas as dependências), a bateria completa também rodou antes das correções:

| Bateria | Resultado |
| --- | --- |
| `npm run test:massive` completo | Aprovado: 315 testes; PostgreSQL 25 + modelos 8 + jornadas 29 + TV 13 cenários; banco principal inalterado, nenhuma base temporária restante |
| `test:e2e` (navegador, login com código por e-mail) | 2/2 aprovados |
| Passeio aleatório no motor (temporário) | 5 sequências × 1.500 ações de tarefas por vários perfis; nenhuma violação das regras verificadas (estado, revisão, auditoria, visibilidade, etapas, conferência no mesmo ciclo, concessões, setor, recusa sem alteração parcial, totais e vazamento). Não cobria devolução + troca de executor, achada como L01 |

### O que foi confirmado e está correto

- **Ciclo da tarefa.**
  - Ordem iniciar → etapas → evidência → enviar para conferência → aprovar/devolver, com `MISSING_STEPS`, `MISSING_DOCUMENT` e `REVIEW_REQUIRED` nos pontos certos.
  - Esperar/retomar, pedir dispensa (sem duplicar o pedido) e aprovar a dispensa.
  - Cancelar → sai de `metric`, da TV e das listas operacionais. Reabrir → volta à operação.
  - Revisão antiga → 409. Transferência em lote atômica: tarefa encerrada → `INVALID_TRANSFER`; revisão errada → 409; em ambos os casos nada muda.
  - Fila do departamento: assumir tarefa em andamento ou em conferência preserva o estado. Importação de tarefas deduplica e é atômica.
- **Escopo e permissões.**
  - Operador sem `tasks.team.view` não vê tarefas alheias (404).
  - Consulta não executa. Coordenador sem `tasks.manage` não mexe em tarefa alheia nem dispensa.
  - Outro tenant → 404. Responsável de outro setor ou sem execução → `INVALID_ASSIGNEE`.
- **Empresas.**
  - Código/CNPJ duplicado → 409. Situação desconhecida → recusada. Importação atômica e deduplicada.
  - Suspensa não gera tarefas; inativa/encerramento geram até a competência final.
  - Situação criada pelo grupo e em uso não pode ser removida.
  - Proposta com vigência: impacto calculado; revisão de aplicabilidade bloqueia a execução até o gestor decidir; o regime anterior continua valendo nas competências passadas.
- **Modelos.**
  - Geração idempotente. Competência de dezembro vence em janeiro do ano seguinte.
  - Tarefa gerada guarda as etapas da empresa e a versão do modelo; uma nova versão do modelo não altera tarefas já geradas.
  - `TEMPLATE_CHANGED` funciona; o setor do modelo não pode ser trocado.
- **Implantações.**
  - Ordem das etapas, entrega ao setor seguinte, `HANDOFF_LOCKED`, troca de responsável só em etapas futuras.
  - Bloqueio das rotinas enquanto a implantação está ativa; processo (`kind=process`) nunca bloqueia.
  - Dispensa de etapa com conferência exige outra pessoa. Etapa de implantação não pode ser cancelada.
- **Relatórios.**
  - Os 31 tipos rodam.
  - Pendências, entregas, prazo legal vencido, meta vencida e conciliação batem com `metric()`.
  - Agrupar por colaborador ou por empresa soma o mesmo total da lista.
  - Canceladas aparecem só no relatório "Tarefas canceladas".
  - O escopo "Todos" respeita os setores da conta. `% na meta` só aparece com `reports.performance.view`.
  - O filtro por data de conclusão usa o dia de Brasília. O CSV sai com BOM e `;`.
- **Datas.**
  - `businessDate` e `closedCompetence` acertam as viradas de mês e de ano na madrugada UTC.
  - Avulsa criada às 22h de Brasília do dia 31 recebe a competência certa; o início do atendimento e os prazos de implantação usam o dia de Brasília.
  - Entrega às 22h no dia da meta conta como no prazo.
- **TV.**
  - Sem o bloco de colaboradores, nenhum nome de pessoa vai para o feed.
  - Sem `showNames`, não vão nome de empresa nem CNPJ; títulos de avulsas ficam ocultos.
  - Canceladas ficam fora; os indicadores somam o total; o feed não leva ids, documentos ou auditoria; outro tenant não entra.
- **Configurações.** `DEPARTMENT_IN_USE`, `DEPARTMENT_CYCLE`, membro de outro tenant, dependência entre aba e ações (`INVALID_PERMISSIONS`) e `DOCUMENT_TYPE_IN_USE` funcionam.

## 2. Defeitos reais

Nenhum P1 encontrado. Gravidade: **P2** = afeta controle, dados ou fluxo e deve ser tratado antes do piloto; **P3** = inconsistência pontual ou robustez.

### L01 — Executora original aprova a própria evidência depois de devolução ou reabertura (P2)

- **Área:** Tarefas / segregação de funções (`engine.ts`, casos `return` e `reopen`).
- **Cenário:**
  1. Júlia e Marina com `tasks.review` + `tasks.team.view`.
  2. Júlia inicia uma DCTFWeb de 2026-10, anexa a evidência e envia.
  3. Rafael devolve; ou aprova e depois Helena reabre.
  4. Helena atribui a tarefa a Marina. Marina refaz as etapas e reenvia (a evidência vigente continua sendo a de Júlia).
  5. Júlia aprova.
- **Esperado:** recusa (`SELF_REVIEW`). O `docs/CONTEXTO.md` registra "conferência bloqueada para qualquer participante da execução após redistribuição/reabertura".
- **Obtido:** **aprovada**, nos dois caminhos. `executionActorIds` é zerado em `return` e `reopen`, e a autoria das evidências que continuam na tarefa não é considerada. Os testes atuais cobrem só o modo legado, em que Júlia nem enxerga a tarefa.
- **Sugestão:** não zerar o histórico de executores (ou guardar `pastExecutionActorIds`) e bloquear também quem é autor de documento vigente. Acrescentar regressão no modo de permissões.

### L02 — Não há como negar um pedido de dispensa (P2)

- **Área:** Tarefas / dispensa.
- **Cenário:** Júlia pede dispensa ("Empresa sem movimento"). O gestor não concorda. Júlia segue, conclui e Rafael aprova.
- **Esperado:** um comando de negar dispensa (com motivo e auditoria) que limpe `dispenseRequested`; ao concluir, o pedido não fica pendente.
- **Obtido:**
  - Não existe comando de negar (`TaskCommand` só tem `dispense`).
  - O pedido continua aparecendo em "Solicitações de dispensa" enquanto a tarefa está aberta.
  - Depois de concluída, `dispenseRequested` continua `true`, e a lista de tarefas mostra "Dispensa solicitada" numa tarefa já entregue (`TasksPage.tsx`, sem checar o status).
- **Sugestão:** comando `deny_dispense` (`tasks.dispense`, motivo obrigatório); limpar a flag em `approve`, `complete`, `cancel` e `reopen`; mostrar o aviso só em tarefa aberta.

### L03 — Desativar uma pessoa deixa tarefas, carteira e etapas sem tratamento (P2)

- **Área:** Tarefas / Empresas / Implantações (`identity-store.update` não toca na operação).
- **Cenário:** desativar Júlia no seed.
- **Obtido:**
  1. **24 tarefas abertas** continuam com ela. Operadores sem `tasks.team.view` não as veem, e a TV mostra "Responsável indisponível". Nenhum aviso ou relatório aponta essas pendências.
  2. A geração manual de um setor em que alguma empresa tem `responsibilities[setor] = pessoa desativada` falha inteira (`NO_OWNER`; 0 tarefas para todas as empresas). A automática pula e registra.
  3. Empresa **sem** responsabilidades explícitas cujo `ownerId` está desativado: a geração entrega as tarefas silenciosamente ao primeiro usuário com `tasks.manage` do setor (Helena), sem registro na auditoria.
  4. Implantação cuja **próxima** etapa é dela: a etapa atual não pode ser concluída (`INVALID_ASSIGNEE`) até alguém trocar o responsável. Dá para recuperar, mas o executor não entende o motivo.
- **Esperado:** ao desativar, a pessoa e o gestor veem as pendências (tarefas abertas, carteiras, etapas) e são levados a redistribuí-las.
- **Sugestão:** na desativação, listar e oferecer a transferência em lote (já existe `transferTasks`/`transferCompanies`); criar o relatório "Pendências de pessoas desativadas"; registrar o fallback para gestor na auditoria da geração.

### L04 — Transferência de carteira vale para o mês do calendário, não para a competência em trabalho (P2)

- **Área:** Empresas / carteira (`transferCompanies` grava `effectiveCompetence = mês atual`).
- **Cenário:**
  1. Em 19/10/2026, transferir o Fiscal da company-1 de Júlia para Marina, com as tarefas abertas.
  2. Criar um modelo novo e gerar a competência **2026-09**, que é a que está sendo trabalhada em outubro.
- **Esperado:** a nova tarefa de 2026-09 vai para Marina.
- **Obtido:** vai para **Júlia**: a projeção de 2026-09 ignora o registro de 2026-10. O mesmo acontece se a carteira for reorganizada no dia 1º antes da primeira geração automática do mês. Se a pessoa antiga estiver desativada, cai no L03.
- **Sugestão:** pedir a competência de vigência na transferência (como nas propostas), com padrão = competência fechada; ou aplicar a competência fechada quando a transferência ocorrer antes da geração dela.

### L05 — Reatribuição individual aceita tarefa encerrada e move o crédito da entrega (P3)

- **Área:** Tarefas / relatórios (`command` → `assign` não valida o estado; `transferTasks` valida).
- **Cenário:** Júlia executa e Rafael aprova uma EFD-Reinf. Depois, Rafael atribui a tarefa concluída a Marina.
- **Obtido:** aceito (`status=done`, `assigneeId=marina`, `executorId=julia`). "Entregas por colaborador" passa a mostrar Marina com 1 entrega e Júlia com 0.
- **Sugestão:** recusar `assign` em tarefas `done`/`dispensed`/canceladas (como o lote), ou contar a produtividade pelo executor.

### L06 — Aprovar uma proposta com vigência futura gera as tarefas da competência futura na hora; e um `NO_OWNER` impede a aprovação (P3)

- **Área:** Propostas (`decideChangeProposal` → `generateInState(effectiveCompetence)`).
- **Cenário A:** proposta de regime para a company-6 com vigência 2027-03, aprovada em 19/10/2026.
  - **Obtido:** 5 tarefas de 2027-03 criadas imediatamente, cinco meses antes. Elas entram em "Pendências", na conciliação e nas listas.
- **Cenário B:** empresa com responsável Fiscal desativado; proposta de regime.
  - **Obtido:** a aprovação inteira falha com `NO_OWNER`, porque a geração faz parte da decisão.
- **Sugestão:** gerar na aprovação só se a competência de efeito já estiver fechada/gerada (senão deixar para a geração normal); na aprovação, pular e registrar como a automática (A01).

### L07 — Segunda proposta pendente da mesma empresa fica impossível de aprovar (P3)

- **Área:** Propostas (`expectedCompanyRevision` fixo).
- **Cenário:** duas propostas pendentes para a company-2 (regime e responsável); aprovar a primeira.
- **Obtido:** a segunda sempre retorna `CONFLICT` "A empresa mudou. Reabra o cadastro atualizado." Recarregar não adianta, só resta rejeitar e propor de novo. Uma edição simples (nome/cidade) via `updateCompany` também invalida todas as propostas pendentes.
- **Sugestão:** marcar a proposta como "desatualizada" e permitir recalcular o impacto e aprovar; ou comparar só os campos operacionais e a vigência.

### L08 — "Em encerramento" sem competência final atende para sempre (P3)

- **Área:** Empresas / situações (`companySchema`, `operationalPatchSchema`).
- **Cenário:** cadastrar uma empresa, ou propor uma alteração, com `status: "closing"` sem `serviceEndCompetence`.
- **Obtido:** aceito; `companyServes` dá `true` até em 2030. `companyStatusNeedsEnd` existe mas não é exigido no servidor. Com "inactive" sem fim, o efeito é o oposto: para na hora.
- **Sugestão:** `refine` exigindo a competência final quando `companyStatusNeedsEnd(status)`, no cadastro e nas propostas.

### L09 — "Entregas por colaborador" conta canceladas na coluna "Atividades" (P3)

- **Área:** Relatórios (`productivity`).
- **Cenário:** cancelar 1 tarefa de 2026-09; gerar o relatório da competência.
- **Obtido:** a soma de "Atividades" é 47, mas a população operacional (`metric().total`) é 46. A diferença é a cancelada, que também aparece na coluna própria. Isso contraria a regra de manter canceladas fora da população operacional.
- **Sugestão:** "Atividades" sem canceladas (a coluna "Canceladas" continua informativa) ou rotular "Atividades (inclui canceladas)".

### L10 — TV chama a fila do departamento de "Responsável indisponível" (P3)

- **Área:** TV (`createTvFeed.responsibleLabel`).
- **Cenário:** tarefa com `assigneeId = department:Fiscal`, bloco de colaboradores ligado.
- **Obtido:** "Responsável indisponível", o mesmo rótulo de pessoa desativada ou fora do escopo.
- **Sugestão:** "Fila · {setor}", como os relatórios já fazem.

### L11 — Snapshot entrega propostas de outros setores (P3)

- **Área:** Empresas / escopo (`snapshot.changeProposals`).
- **Cenário:** gestor só do Contábil com `companies.manage`; proposta que altera apenas o responsável Fiscal da company-9.
- **Obtido:** a proposta, com `userId` do Fiscal, vem no snapshot do gestor do Contábil. O relatório `company-changes` já filtra por setor; o snapshot não.
- **Sugestão:** filtrar as propostas pelos departamentos afetados (responsabilidades do patch, ou tarefas e setores atendidos da empresa), igual ao relatório.

### L12 — Motor aceita tipo de comando desconhecido (P3, robustez)

- **Área:** `engine.command` (o `switch` não tem `default`).
- **Cenário:** chamar o motor direto com `{ type: "qualquer" }`.
- **Obtido:** a revisão sobe (1→2) e a auditoria grava um evento com ação vazia. Pela API o `commandSchema` recusa, então hoje o risco é só de chamadas internas ou de adaptadores futuros.
- **Sugestão:** `default: throw new DomainError("INVALID_COMMAND", …)`.

### L13 — Reabrir uma cancelada que nunca foi iniciada põe "Em andamento" sem início (P3)

- **Área:** Tarefas / reabertura.
- **Cenário:** cancelar uma tarefa "A fazer" e reabrir.
- **Obtido:** `status=in_progress`, sem `startedAt` e sem executor. Relatórios com base em "Início" não a encontram, e a tarefa aparece como em execução sem ninguém executando.
- **Sugestão:** ao reabrir um cancelamento, restaurar o estado anterior (guardado no evento ou na tarefa), ou voltar a `todo`.

### L14 — Regras documentais por palavra-chave/CNPJ/competência valem só no navegador (P3)

- **Área:** Documentos (`DocumentBatch.tsx` confere `keywords`, `cnpjField` e `competenceField`; o servidor confere só tipo e formato).
- **Cenário:** anexar pela API, na tarefa da empresa A, um XML de recibo da empresa B com o tipo exigido.
- **Obtido:** aceito, e a prontidão documental fica satisfeita.
- **Sugestão:** validar no servidor os campos estruturados do XML quando a regra os define, ou deixar claro na interface que essa conferência é só uma ajuda do lote.

### L15 — Tarefa avulsa nasce num mês que o portal não abre (P2)

- **Área:** Tarefas avulsas (`addTask`) e competência inicial da sessão.
- **Obtido:** a avulsa ia sempre para o mês corrente, enquanto o portal abre na competência que acabou de fechar (Brasília); o responsável não a via ao entrar.
- **Sugestão:** escolher a competência no formulário, partindo da que está aberta na tela.

### L16 — Painel de TV preso à competência do cadastro (P2)

- **Área:** TV (`TvDevice.competence`).
- **Obtido:** uma TV cadastrada em outubro continuava mostrando setembro nos meses seguintes, até alguém editar o dispositivo.
- **Sugestão:** acompanhar a competência em andamento por padrão, com opção de fixar.

## 3. Decisões de negócio em aberto (não são defeitos)

| # | Tema | Comportamento atual | Pergunta ao usuário |
| --- | --- | --- | --- |
| Q1 | Implantação que bloqueia rotinas e termina depois da virada do mês (ligado à A02) | Empresa com implantação ativa em 03/11 tem a competência 2026-10 bloqueada; concluída em 02/12, só 2026-11 é gerada e **2026-10 nunca é criada** | Ao concluir a implantação, gerar ou sugerir as competências bloqueadas? A partir de qual? |
| Q2 | Início do atendimento | `startDate` = dia do cadastro ou importação; empresa cadastrada em 19/10 não recebe a competência 2026-09, que ainda é trabalhada em outubro | Para carteiras migradas, informar "competência inicial" no cadastro/importação? |
| Q3 | Encerrar uma obrigação | Não existe desativação de modelo: `updateTemplateSchema` recusa `active` | Como retirar uma obrigação extinta (desativar a partir de uma competência)? |
| Q4 | Nova implantação da mesma empresa | `DUPLICATE_ONBOARDING` mesmo com a anterior concluída (só `kind=process` repete) | Cliente que volta depois de inativo pode ter nova implantação? |
| Q5 | Regras documentais novas | `requiredDocumentTypeIds` é fixado na geração; regra criada depois não alcança tarefas já geradas | Aplicar às tarefas abertas, ou só às próximas competências (como hoje)? |
| Q6 | Gerar competência futura | A geração manual aceita qualquer competência (ex.: 2027-06 criou 33 tarefas) | Limitar à competência fechada/atual ou pedir confirmação? |
| Q7 | Colaboradores na TV | Aparecem perfis ativos sem execução (Consulta, Administração) com 0 tarefas | "Colaboradores ativos" inclui perfis só de consulta e gestão? |
| Q8 | Avulsa em empresa inativa/suspensa | Permitida | Recusar, avisar ou manter? |
| Q9 | "Dispensas e reaberturas" | Não inclui cancelamentos (há relatório próprio) | Juntar as exceções num relatório único? |

Já documentado, apenas lembrando: para um operador com `reports.view` sem `tasks.team.view`, "Empresas sem tarefas" lista empresas de colegas (3 no seed). O próprio relatório traz essa nota.

## 4. Observações menores

- `deadline()`/`matchesSelection()` comparam `legalDue === today` com o valor recebido. Hoje todos os chamadores passam `businessDate(...)`; um chamador futuro que passe um instante ISO quebraria "vence hoje"/"meta vencida". Normalizar dentro da função deixaria isso robusto.
- `tv-simulation.ts` (simulação temporária) usa `generatedAt.slice(0, 10)` (dia UTC). Como é temporária e será removida, não foi tratada como defeito.

## 5. Ordem sugerida de tratamento

1. **L01** (segregação de funções) e **L02** (negar dispensa): regra de controle e fluxo incompleto.
2. **L03** e **L04**: carteira e responsáveis; afetam a geração mensal.
3. **L05–L14**: lote de robustez e coerência.
4. Levar **Q1–Q9** ao usuário junto com a A02.

## 6. Correções aplicadas — Claude Code — 19/10/2026

Pedido do usuário: “corrija”. Corrigidos os defeitos L01–L14; as decisões Q1–Q9 não foram alteradas. Regressões em `packages/domain/test/audit-2026-10-19.test.ts` (19 testes).

| Achado | Correção |
| --- | --- |
| L01 | `return` e `reopen` não zeram mais `executionActorIds`: quem executou ou anexou em qualquer ciclo continua impedido de conferir. |
| L02 | Novo comando `deny_dispense` (“Negar dispensa”, exige `tasks.dispense` e motivo, registrado na auditoria). `approve`, `complete` e `reopen` limpam `dispenseRequested`. O painel da tarefa mostra “Aprovar dispensa” / “Negar dispensa” e só exibe o aviso em tarefa aberta. |
| L03 | Novo relatório “Pendências de pessoas desativadas” (`inactive-owners`, exige `tasks.assign`): tarefas abertas, carteiras e etapas de implantação com responsável desativado, removido ou fora do setor. A geração registra “Responsável substituto na geração” quando cai no gestor. Erro claro quando a próxima etapa da implantação tem responsável sem acesso. |
| L04 | `transferCompanies` aceita `effectiveCompetence` opcional; o padrão é a competência fechada (em trabalho), e competências anteriores são recusadas. O registro guarda só o setor transferido. A tela de carteira em lote já usa propostas com competência escolhida e não mudou. |
| L05 | `assign` recusa tarefas encerradas (`INVALID_STATE`), como o lote. |
| L06 | A aprovação só gera a competência de efeito se ela já estiver fechada; a futura fica para a geração mensal. Empresa sem responsável não bloqueia mais a decisão: é registrada como “Geração da alteração com pendências”. |
| L07 | A aprovação usa o cadastro atual e recalcula o impacto; não exige mais a revisão da empresa no momento da proposta. Uma segunda proposta ou uma edição simples não travam mais as pendentes. |
| L08 | “Em encerramento” exige a última competência, no cadastro (`addCompany`) e nas propostas (considerando a competência final já existente). |
| L09 | “Entregas por colaborador”: “Atividades” sem canceladas. |
| L10 | TV mostra “Fila · {setor}” para tarefas da fila. |
| L11 | Snapshot entrega só as propostas que tocam os setores do ator. |
| L12 | Comando desconhecido → `INVALID_COMMAND`, sem alterar a tarefa. |
| L13 | Reabrir uma cancelada restaura o status anterior ao cancelamento (`cancelledFromStatus`), sem contar como reabertura; tarefas legadas voltam a “A fazer” ou “Em andamento” conforme `startedAt`. |
| L14 | `xmlRuleMismatch` (domínio) confere no servidor, e na prévia, o CNPJ e a competência do XML quando a regra ativa do tipo os exige (`DOCUMENT_MISMATCH`). PDFs não são lidos. |

Testes antigos ajustados por mudança intencional: o catálogo agora tem 32 relatórios; “rejects stale approvals” virou “aprova após edição simples sem sobrescrever o cadastro”; a aprovação com vigência futura não gera mais as tarefas da competência futura.

**Ambiente:** o `node_modules` do worktree não tinha `@apice/*`, e a resolução subia para o checkout principal (pacotes da outra sessão). Para validar as correções, foram criados links locais `node_modules/@apice/{domain,api,web}` apontando para o worktree, ignorados pelo Git. Por isso, os resultados PostgreSQL da seção 1 usaram o build do domínio do checkout principal; os da correção usam o worktree.

Limites: tarefas antigas que já tinham `dispenseRequested=true` depois de concluídas continuam assim no banco, e o selo da lista (`TasksPage.tsx`, arquivo da outra sessão) não foi alterado. O typecheck e o build da web continuam dependendo de instalar `@vitejs/plugin-react`; o código da web foi conferido com `tsc`, que acusou só esse módulo ausente.

## 7. Complementos da sessão principal — Claude Code — 19/10/2026

| Achado | Correção |
| --- | --- |
| L03 (complemento) | Geração **manual** pula as empresas sem responsável válido e as nomeia na tela e na auditoria (“Geração com pendências”), em vez de recusar o setor inteiro (`NO_OWNER`). Ao desmarcar “Usuário ativo”, o cadastro lista tarefas abertas, carteiras e etapas de implantação da pessoa e onde redistribuí-las. |
| L02 (complemento) | A lista de tarefas mostra “Dispensa solicitada” só em tarefa aberta. |
| L15 | “Nova tarefa” tem o campo Competência (folhinha padrão), iniciado na competência aberta; o servidor aceita `competence` opcional (padrão: mês corrente). |
| L16 | `followCurrent` (padrão: acompanhar) e `tvCompetence()` usam a competência em andamento no feed e na consulta SQL; a configuração da TV tem “Acompanhar a competência em andamento” e, desmarcada, a competência fixa. |

Regressões em `packages/domain/test/logic-audit-2026-10-19.test.ts` (geração manual, avulsa e TV). As correções L01–L04 feitas em paralelo pela sessão principal foram descartadas em favor das da seção 6.
