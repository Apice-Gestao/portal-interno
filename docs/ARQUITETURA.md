# Arquitetura

O monorepo separa interface, transporte HTTP e regras operacionais. O núcleo compartilhado evita que o frontend e a API mantenham interpretações diferentes do fluxo.

## Responsabilidades

| Camada                                   | Responsabilidade                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/modules`                   | Telas agrupadas por domínio: visão geral, tarefas, empresas, modelos, documentos, relatórios e configurações. Rotas carregadas sob demanda. |
| `apps/web/src/shared/ui`                 | Componentes, formulários, modais e estilos reutilizáveis.                                                                                   |
| `apps/web/src/services/portal-client.ts` | Contrato `PortalClient`, cliente HTTP local e adaptador da prévia em memória.                                                               |
| `apps/api/src/portal`                    | Endpoints, validação de entrada, upload e download autorizado.                                                                              |
| `apps/api/src/security` | Login/senhas, sessão opaca, troca inicial, gestão de contas/permissões e resolução do ator. |
| `apps/api/src/database` | Contrato assíncrono PortalStore, transações PostgreSQL, migrações, fixtures e transferência portátil. |
| `packages/domain`                        | Tipos, esquemas Zod, filtros de escopo, transições, indicadores e geração de tarefas.                                                       |

O estado é consultado como um `Snapshot` filtrado pelo ator. Cada comando informa `expectedRevision`: uma alteração concorrente devolve conflito e exige atualização da interface. As mutações são preparadas em uma cópia do estado e aplicadas após as validações.

## Regras centrais implementadas

- Todo acesso operacional considera tenant, departamentos e grants persistidos. Cargo é informativo; sem `tasks.team.view`, somente tarefas próprias. O administrador pode conceder qualquer grant a qualquer cargo.
- Conclusão e envio para conferência exigem as etapas completas e a evidência aceita.
- Quem participou da execução do ciclo não pode conferir a própria entrega, inclusive após redistribuição.
- Dispensa e reabertura exigem perfil gerencial e justificativa. A reabertura preserva a primeira conclusão e inicia um novo ciclo.
- A geração mensal usa tenant, empresa, modelo e competência para evitar duplicidade. A tarefa guarda a versão do modelo utilizada.
- Evidências recebem novas versões; comandos registram auditoria persistente na mesma transação da alteração, quando usado PostgreSQL.

## Persistência atual

`PortalStore` separa o domínio síncrono da persistência assíncrona. No PostgreSQL, cada operação abre transação e define o tenant com `set_config(..., true)`. Leituras usam REPEATABLE READ. Gravações adquirem lock consultivo por tenant antes de carregar o estado. O ator é resolvido novamente a partir do banco, de modo que uma sessão antiga não conserva um cargo removido.

`MemoryRepository` é usado como cópia de trabalho do domínio dentro da transação. O adaptador persiste apenas adições e alterações; compara a revisão no UPDATE SQL e inclui evidência/auditoria na mesma transação. Erros desfazem tudo. Não grava o estado completo sobre todas as tabelas.

O schema privado `portal` contém tenants, usuários, empresas, modelos, tarefas, documentos e auditoria. Payloads JSONB preservam o contrato do domínio, com colunas geradas, índices, FKs compostas e unicidade de recorrência. Anexos são bytea, separados do payload da tarefa, com tamanho/hash e versão. As migrações não dependem de Auth/Storage específicos do Supabase. Não é ainda o modelo relacional integral do PRD.

Todas as tabelas operacionais têm RLS ENABLE/FORCE. A identidade de tenant vem da API; não há conexão de banco no frontend. O usuário de execução não pode ser superuser/BYPASSRLS. Metadados de migrações ficam em `portal_meta` privado; checksum impede editar silenciosamente migrações aplicadas. Auditoria/documentos permitem apenas INSERT/SELECT ao papel da API, com triggers de bloqueio de alteração/exclusão.

O adaptador ainda carrega o tenant completo antes de filtrar o snapshot; isso limita crescimento e deve evoluir para consultas/paginação SQL. Sessões e limitadores continuam em memória de um processo. A prévia estática utiliza o adaptador de memória e identifica esse limite na interface.

## Caminho para Supabase

1. Provisionar PostgreSQL e dois papéis separados no destino; aplicar as migrações versionadas. Não expor o schema privado em Data API.
2. Exportar/importar o bundle de dados/evidências ou restaurar backup PostgreSQL, verificando hashes e contagens. Usar fixtures somente como teste. O destino não deve conter os tenants importados.
3. Se escolhido Supabase Auth, migrar/integrar a identidade local preservando usuários internos e concessões. Não trocar apenas a URL nem usar hashes scrypt diretamente como contas Supabase Auth. RLS atual pressupõe acesso mediado pela API; conexão direta via Data API exige outras políticas. Para manter NestJS e login local, o PostgreSQL remoto pode conservar `portal.credentials` privado.
4. Decidir permanência de bytea ou evolução para armazenamento privado conforme volume/retencão. Downloads atuais são mediados e autorizados pela API.
5. Configurar HTTPS, proxy, origem, segredos, monitoramento e backup/restauração na VPS. Verificar o ambiente publicado antes de dados reais.

O domínio e os módulos de interface podem ser preservados, mas a troca exige ajustes no repositório e nos serviços. Nenhuma chave privilegiada deve ir para o frontend.

## Escopo do PRD ainda aberto

O cadastro atual representa empresas diretamente, com um responsável e um regime corrente. Não implementa toda a hierarquia cliente → múltiplas empresas, vigências de regime e carteira por departamento. Os departamentos e perfis são fixtures, não um cadastro configurável.

Os modelos suportam somente rotina mensal e dias fixos de 1 a 28 do mês seguinte. Não há motor oficial de feriados, dias úteis, exceções fiscais, jobs agendados ou outras periodicidades. Os prazos de exemplo não devem orientar uma operação fiscal real.

Processos entre áreas, solicitações externas, publicação no Portal do Cliente, eventos de integração, faturamento, IA e governança completa de modelos/procedimentos permanecem fora da implementação atual.

O painel de TV foi acrescentado em 14/10/2026. O módulo NestJS `tv` usa dispositivo persistido, identidade independente e feed sanitizado por tenant/departamento/competência. O frontend público da TV não usa o snapshot ou login humano. Configurações, pareamento, expiração e revogação ficam separados das tarefas; exportação portátil conserva apenas configuração, exigindo novo vínculo. Consulte `PAINEL-TV.md` para contratos, permissões e limites da execução local.
