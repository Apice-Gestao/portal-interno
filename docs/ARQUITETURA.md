# Arquitetura

Estado revisado pelo Codex em 17/10/2026, sobre o código funcional do commit `53a6c43`. Este arquivo descreve a implementação atual. A proposta de evolução está no [parecer de arquitetura e escalabilidade](PARECER-ARQUITETURA-ESCALABILIDADE-2026-10-17.md), pendente de avaliação pelo Claude; não confundir proposta com entrega.

O monorepo separa interface, transporte HTTP e regras operacionais. O núcleo compartilhado reduz interpretações diferentes de datas, documentos e fluxo. O backend ainda compõe controllers e serviços em um `AppModule` e concentra vários casos de uso no `PortalEngine`; módulos NestJS com limites explícitos são uma evolução proposta.

## Responsabilidades

| Camada                                   | Responsabilidade                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/modules`                   | Telas de autenticação/ecossistema, visão geral, tarefas, empresas, modelos, processos, central do gestor, documentos, relatórios, TV, usuários e configurações. Rotas carregadas sob demanda. |
| `apps/web/src/shared/ui`                 | Componentes, formulários, modais e estilos reutilizáveis.                                                                                   |
| `apps/web/src/services/portal-client.ts` | Contrato `PortalClient`, cliente HTTP local e adaptador da prévia em memória.                                                               |
| `apps/api/src/portal`                    | Endpoints, validação de entrada, upload e download autorizado.                                                                              |
| `apps/api/src/security` | Login/senhas, sessão opaca, MFA por e-mail, recuperação, troca inicial, gestão de contas/permissões e resolução do ator. |
| `apps/api/src/database` | Contrato assíncrono PortalStore, transações PostgreSQL, migrações, fixtures e transferência portátil. |
| `apps/api/src/tv` | Dispositivos, identidade separada, pareamento e feed sanitizado com consultas próprias. |
| `packages/domain`                        | Tipos, esquemas Zod, filtros de escopo, transições, indicadores e geração de tarefas.                                                       |

O caminho operacional humano consulta um `Snapshot` filtrado pelo ator. O frontend o atualiza a cada cinco segundos e invalida a consulta completa após mutações. Alterações em tarefas usam `expectedRevision`; empresas, modelos, processos e configurações têm controles de revisão/versão próprios. Uma alteração concorrente devolve conflito e exige atualização da interface. As mutações do motor são preparadas em uma cópia do estado e aplicadas após as validações.

## Regras centrais implementadas

- Todo acesso operacional considera tenant, departamentos e grants persistidos. Cargo é informativo; sem `tasks.team.view`, a consulta de tarefas fica nas próprias e na fila dos departamentos autorizados, respeitando a permissão de consulta aplicável. O administrador pode conceder qualquer grant a qualquer cargo.
- Conclusão e envio para conferência exigem as etapas completas e a evidência aceita.
- Quem participou da execução do ciclo não pode conferir a própria entrega, inclusive após redistribuição.
- Dispensa, cancelamento e reabertura exigem as concessões de ação aplicáveis e justificativa; cargo não impõe teto. A reabertura preserva histórico e inicia novo ciclo. Canceladas não contam como entregas/dispensas operacionais.
- A geração mensal usa tenant, empresa, modelo e competência para evitar duplicidade. A tarefa guarda a versão do modelo utilizada.
- Evidências recebem novas versões; comandos registram auditoria persistente na mesma transação da alteração, quando usado PostgreSQL.
- Modelos têm etapas editáveis/versionadas; tarefas geradas preservam sua cópia. Processos sequenciais entre departamentos liberam etapas conforme a execução. O gestor escolhe se a rotina aguarda a implantação ou começa em paralelo.
- Empresas têm código, responsáveis individuais/fila/sem obrigações por setor e mudanças por proposta com competência de efeito. A aprovação revalida versões, registra histórico, gera tarefas aplicáveis e sinaliza incompatibilidades para revisão humana. Isso ainda não é um catálogo fiscal oficial completo.
- Departamentos, cargos e vínculos são configuráveis. Modelos de acesso/copiar cadastro ajudam a parametrização; os grants efetivos continuam persistidos por conta. Cargos departamentais não concedem acesso por si.

## Persistência atual

`PortalStore` separa o domínio síncrono da persistência assíncrona. No PostgreSQL, suas operações abrem transação e definem o tenant com `set_config(..., true)`. Leituras do store usam REPEATABLE READ READ ONLY. Gravações adquirem lock consultivo por tenant antes de carregar o estado. O ator é resolvido novamente a partir do banco, de modo que uma sessão antiga não conserva concessões removidas. O contrato `run` ainda recebe callback do motor integral, em vez de casos de uso com repositórios específicos.

`MemoryRepository` é usado como cópia de trabalho do domínio dentro da transação. O adaptador persiste apenas adições e alterações; compara a revisão no UPDATE SQL e inclui evidência/auditoria na mesma transação. Erros desfazem tudo. Não grava o estado completo sobre todas as tabelas.

O schema privado `portal` contém tenants, usuários/credenciais, recuperação/MFA, empresas, modelos, tarefas, documentos, auditoria, dispositivos TV, fluxos, implantações/processos, configurações e propostas de alteração. Payloads JSONB preservam o contrato do domínio, com colunas geradas, índices, FKs compostas e unicidade de recorrência. Anexos são bytea, separados do payload da tarefa, com tamanho/hash e versão. As migrações não dependem de Auth/Storage específicos do Supabase. Não é ainda o modelo relacional integral do PRD.

Todas as tabelas operacionais têm RLS ENABLE/FORCE. A identidade de tenant vem da API; não há conexão de banco no frontend. O usuário de execução não pode ser superuser/BYPASSRLS. Metadados de migrações ficam em `portal_meta` privado; checksum impede editar silenciosamente migrações aplicadas. Auditoria/documentos permitem apenas INSERT/SELECT ao papel da API, com triggers de bloqueio de alteração/exclusão.

O adaptador carrega o tenant completo antes de executar comandos, filtrar o snapshot ou montar relatórios, incluindo todo o histórico de auditoria e metadados documentais. Os bytes de todos os anexos não entram nessa carga. Isso limita crescimento e deve evoluir para consultas/paginação SQL e unidades de trabalho menores. O download autorizado também usa a transação de escrita para auditar o acesso. A TV tem um caminho distinto: consulta tarefas por competência/departamento e monta seu DTO.

A bateria de 17/10/2026 observou snapshot serializado de aproximadamente 3,4 MB e p95 de 3.524 ms com 40 leitores diretos do store/4.000 tarefas. São dados locais, não benchmark HTTP ou da VPS. Ver [testes massivos](TESTES-MASSIVOS-2026-10-17.md) e as ressalvas do parecer antes de usar esses números como meta.

## Identidade e execução

Sessões humanas opacas e limitadores HTTP continuam em memória de um processo. Há limite global de 100 sessões emitidas por processo e expiração em uma hora; reinício exige novo login. Contas/permissões e registros de recuperação/MFA com hashes persistem no PostgreSQL. A identidade normal é revalidada, incluindo conta ativa e versão de senha. A integração de e-mail existe, mas envio real depende de configuração; promessas pendentes em memória não constituem fila durável operacional.

O processo configura até 24 conexões PostgreSQL somando pools de operação, identidade, MFA e recuperação; não significa que todas estejam sempre abertas. Há hooks de encerramento/fechamento. Replicar processos exige antes resolver sessão/rate limit compartilhados e orçamento total de conexões.

A API permanece local de desenvolvimento: `bootstrap.ts` recusa execução de produção, valida origem local e `main.ts` escuta loopback. A prévia estática utiliza o adaptador de memória e identifica esse limite. Acessos e simulações temporários registrados no contexto devem ser removidos antes da VPS. Nenhum worker ou implantação de produção foi acrescentado na revisão arquitetural.

## Caminho para Supabase

1. Provisionar PostgreSQL e dois papéis separados no destino; aplicar as migrações versionadas. Não expor o schema privado em Data API.
2. Exportar/importar o bundle de dados/evidências ou restaurar backup PostgreSQL, verificando hashes e contagens. Usar fixtures somente como teste. O destino não deve conter os tenants importados.
3. Se escolhido Supabase Auth, migrar/integrar a identidade local preservando usuários internos e concessões. Não trocar apenas a URL nem usar hashes scrypt diretamente como contas Supabase Auth. RLS atual pressupõe acesso mediado pela API; conexão direta via Data API exige outras políticas. Para manter NestJS e login local, o PostgreSQL remoto pode conservar `portal.credentials` privado.
4. Decidir permanência de bytea ou evolução para armazenamento privado conforme volume/retencão. Downloads atuais são mediados e autorizados pela API.
5. Configurar HTTPS, proxy, origem, segredos, monitoramento e backup/restauração na VPS. Verificar o ambiente publicado antes de dados reais.

O domínio e os módulos de interface podem ser preservados, mas a troca exige ajustes no repositório e nos serviços. Nenhuma chave privilegiada deve ir para o frontend.

## Escopo do PRD ainda aberto

O cadastro representa empresas diretamente e já tem carteira por departamento, agrupadores e histórico de mudanças com competência de efeito. Ainda não implementa a hierarquia completa cliente → múltiplas empresas nem elegibilidade/vigências fiscais oficiais. A identificação de cargo pode variar por departamento, mas as permissões de ação são da conta e se aplicam aos departamentos autorizados; o perfil de ações diferente por departamento da RN28 continua pendente.

Os modelos suportam somente rotina mensal e dias fixos de 1 a 28 do mês seguinte. Não há motor oficial de feriados, dias úteis, exceções fiscais, jobs agendados ou outras periodicidades. Os prazos de exemplo não devem orientar uma operação fiscal real.

Processos sequenciais entre áreas já existem. Ramificações condicionais gerais, cronômetro de trabalho ativo, transferência automática integral ao desativar usuário, solicitações externas, publicação no Portal do Cliente, eventos de integração, faturamento, IA e governança completa de modelos/procedimentos permanecem pendentes. Os 31 relatórios oferecem CSV e impressão, mas não relatórios salvos ou configuração arbitrária de colunas; a paginação atual do resultado é visual.

O painel de TV foi acrescentado em 14/10/2026. O módulo NestJS `tv` usa dispositivo persistido, identidade independente e feed sanitizado por tenant/departamento/competência. O frontend público da TV não usa o snapshot ou login humano. Configurações, pareamento, expiração e revogação ficam separados das tarefas; exportação portátil conserva apenas configuração, exigindo novo vínculo. Consulte `PAINEL-TV.md` para contratos, permissões e limites da execução local.
