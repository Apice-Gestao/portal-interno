# Testes massivos de funções — 17/10/2026

Execução por Codex, a pedido explícito do usuário. Bateria concluída e aprovada. Resultado gerado em 17/10/2026 às 12:43 no horário de São Paulo; relatório privado detalhado preservado.

## Bateria preparada

`npm run test:massive` agora executa, em sequência:

1. Tipagem, lint, testes de domínio/API/propriedades e builds.
2. PostgreSQL: isolamento, integridade, transações, concorrência, arquivos, carga, backup/restauração, exportação, login, MFA e recuperação com entrega de e-mail capturada somente em pasta privada local.
3. Edição/versionamento de modelos e fluxos.
4. Jornadas empresa → implantação → tarefas → documentos → conferência → relatórios e transferências concorrentes para filas.
5. TV, dispositivos, departamentos livres, pareamento, sanitização e revogação.

O orquestrador verifica conexões loopback na porta dedicada 55432, compara uma impressão digital da base principal antes/depois sem gravar nela e confere se sobraram bases temporárias criadas pela bateria. Resumos e logs ficam privados em `.local/verification/massive-latest.json` e na pasta exclusiva de cada execução. Não incluir credenciais ou mensagens de MFA em commits; os arquivos de entrega local são removidos pelo teste de banco.

O teste antigo `test-database.mjs` precisava ser atualizado: esperava somente três migrações, tinha pressupostos de cargo e de login anteriores aos grants/MFA e não refletia o esquema atual. As expectativas foram corrigidas mantendo os controles de acesso. A suíte de carga continua testando 500 empresas × 8 modelos, 4.000 tarefas, 12 gerações concorrentes, 80 comandos sobre a mesma revisão e 40 leitores concorrentes.

## Simulações e regressões novas

Novo `tests/massive-functions.test.ts`: dez testes de propriedades, com **8.450 execuções geradas** e seeds fixas `2026101701` a `2026101710`. Isso não significa 8.450 casos unitários distintos. Uma das propriedades chama todos os 31 relatórios sobre 150 populações, totalizando 4.650 construções nessa propriedade. Os demais cobrem filtros, grants por cargo, numeradores e listas, versões documentais, datas UTC/São Paulo, datas de cadastro, CSV e tomada de fila.

Cancelamento real é `status=dispensed` com `cancelled=true`. Foi confirmada divergência: indicadores e TV contavam cancelamento como dispensa, elevando o progresso, enquanto relatórios separavam os dois. Corrigido: população operacional e numerador de dispensa excluem canceladas; métrica `cancelled` é separada, histórico continua disponível pelo filtro **Canceladas** e relatório próprio. Exportação de tarefas usa o rótulo Cancelada. Reabrir recoloca a tarefa na operação; regressão testa comandos reais, além das populações geradas.

Integração ampliada: para andamento, espera e conferência, criar uma empresa/tarefa, executar/anexar/comentar, aprovar a transferência por proposta, disputar oito aprovações e doze tomadas da fila, preservar autoria/etapas/documentos e concluir com conferente independente. O catálogo de 31 relatórios é exercitado por HTTP/PostgreSQL com escopo e consulta sem gravação.

## Interpretação das falhas durante preparação

- Um payload sintético de criação com grant de criar, mas sem executar e atribuído à própria pessoa, foi corretamente recusado. O teste passou a conceder execução explicitamente; cargo Consulta não substitui o grant.
- Os limites de requisições e recuperação bloquearam fases longas acumuladas da suíte. Não foram aumentados ou desligados no produto. Fases independentes abrem instâncias locais novas de teste; a proteção atingida também é verificada. Nenhuma dessas instâncias usa a base principal.
- Requisições concorrentes do Supertest em servidor ainda não iniciado geravam aviso de listeners. O servidor de testes agora abre uma porta efêmera loopback antes das requisições, em vez de mascarar o aviso aumentando limites de listeners.

## Limites

Navegador consultado nesta etapa: controle local desativado no Work. A bateria não contorna essa restrição nem executa Playwright por outro meio. Testes de tela, impressão/PDF real, CSV aberto no Excel e entrega por SMTP externo não são comprovados por estas execuções. O comando de navegador continua separado (`npm run test:e2e`) para quando o controle estiver disponível.

Tempos de carga medidos neste computador não são promessa de desempenho da VPS. Os resultados não implementam recursos ainda ausentes: geração agendada, feriados, periodicidades adicionais, cronômetro, grants distintos por departamento e redistribuição automática após desativação continuam no relatório de auditoria.

## Resultado final

`npm run test:massive` terminou com código 0 e estado `passed`. Fonte: `.local/verification/massive-latest.json`.

| Grupo                                  | Resultado                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tipagem/lint/builds                    | Aprovados nos três pacotes                                                                                                    |
| Domínio/API/propriedades               | **293 testes em 18 arquivos**, incluindo os dez novos testes de propriedades                                                  |
| Simulações adicionais                  | **8.450 execuções geradas** com seeds fixas; 4.650 construções dos relatórios na propriedade que percorre o catálogo completo |
| Banco, carga, identidade e recuperação | **24 cenários** aprovados                                                                                                     |
| Modelos e versões de fluxos            | **8 cenários** aprovados                                                                                                      |
| Jornadas entre módulos                 | **29 cenários** aprovados                                                                                                     |
| TV e dispositivos                      | **13 cenários** aprovados                                                                                                     |
| Total de cenários PostgreSQL           | **74**, contados separadamente dos testes unitários/propriedades                                                              |
| Base principal                         | Impressão digital antes/depois idêntica; o orquestrador somente a consultou em transação de leitura                           |
| Limpeza                                | Nenhuma base temporária nova restante; entregas de MFA/recuperação capturadas localmente foram removidas                      |

Após a bateria, o arquivo de propriedades recebeu ajuste de tipagem explícita e reforço dos asserts de cancelamento/TV; os dez testes de propriedades e oito de conexões foram repetidos: **18 aprovados**, com lint e tipagem específica do arquivo aprovados. O comportamento do produto não foi alterado após o build da bateria.

### Quantidade e concorrência reais

- 500 empresas × 8 modelos geraram exatamente **4.000 tarefas**, mesmo disputando **12 gerações concorrentes**.
- **80 comandos** na mesma revisão produziram um sucesso e 79 conflitos, sem dupla gravação.
- **40 leitores concorrentes** recuperaram o conjunto de 4.000 tarefas.
- Para cada um dos três estados de fila, **8 decisões de proposta** produziram um sucesso e sete conflitos; **12 tomadas de responsabilidade** produziram uma vencedora, preservando passos, comentários, documentos e participantes.
- **8 verificações simultâneas do mesmo código MFA** produziram uma sessão e sete recusas. Reset concorrente usou link uma única vez; sessão anterior foi revogada.
- Backup/restauração e exportação/importação preservaram **4.098 tarefas** (fixtures de vários tenants e carga) e **36 documentos**, com conferência dos hashes. Isso não é backup ou restauração da base principal.

### Desempenho observado

Nesta execução local: lote das 12 gerações em **3.567 ms**; snapshot de 4.000 tarefas com **3.381.491 bytes**; leitura sob 40 clientes simultâneos com **p50 de 2.073 ms** e **p95 de 3.524 ms**. Os tempos incluem o ambiente local de teste e disputa do pool; não são medições do navegador nem da futura VPS.

Não houve falha de integridade na carga, mas o payload de aproximadamente 3,4 MB e a leitura completa do tenant apontam uma melhoria concreta: **paginação/filtros no servidor e consultas específicas por módulo** antes de ampliar a operação. Paginação apenas visual não reduz esse custo. Não foi reduzida a carga ou aumentado timeout para esconder o resultado.
