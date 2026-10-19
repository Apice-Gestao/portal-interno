# Revisão, correções e validação do Portal Ápice

Data: 08/10/2026. Projeto local: `<pasta do projeto>`. Este relatório atualiza o diagnóstico preservado em `AUDITORIA-PRD-2026-10-08.md`, feito sobre o commit `35e1d54`. O PRD foi lido integralmente: 19 páginas, 52 seções e CA01–CA15. O documento é referência de requisitos; pedidos do usuário determinam autorização e prioridade.

## Resultado atual

Frontend React/Vite/TypeScript, API NestJS, PostgreSQL local persistente e login por conta individual. O usuário priorizou login e gestão das permissões antes das abas; foi removida a entrada automática como Júlia e a troca livre de perfis.

**Cargos não são limites fixos.** Administrador, supervisor e operador são identificações; permissões por aba/ação ficam no banco e podem ser concedidas a qualquer cargo. A configuração sugerida do operador é tarefas próprias e execução, mas o administrador pode ampliá-la. Catálogo de capacidades está no código; atribuições são dados editáveis na interface. Tenant/departamentos e a proibição de conferir a própria execução continuam obrigatórios.

O sistema ainda não implementa todo o PRD e não foi implantado numa VPS. Os dados operacionais iniciais continuam fictícios. Login por senha foi implementado; MFA, recuperação de conta e infraestrutura definitiva permanecem abertos.

## Como login e permissões funcionam

1. Sem sessão, aparece apenas a tela de login. Nenhuma aba é carregada automaticamente.
2. O servidor valida usuário/senha no PostgreSQL privado. Hash scrypt com salt aleatório; senha não é armazenada em texto plano na conta. A conta inicial foi provisionada por configuração externa, sem credencial fixa no código ou Git.
3. Senha temporária exige troca antes de acessar módulos. O servidor permite apenas consultar a sessão, trocar senha e sair nesse estado. Novas senhas têm 12–128 caracteres; parâmetros de derivação e fila são limitados. [Referência: OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
4. Sessão opaca vale uma hora, fica em memória e é revogada ao sair. Recarregar/reiniciar exige novo login. Conta ativa, grants e versão da senha são revalidados em cada requisição.
5. Quem possui `users.manage` pode criar/editar contas, cargos, departamentos, acessos, resetar senha temporária e desativar. A última conta ativa com essa permissão não pode removê-la ou ser desativada por essa gestão.
6. UI oculta abas/botões negados; acesso direto à rota não abre o módulo. API e domínio também negam ações sem grant. Somente ocultar o botão não é considerado autorização.
7. Sem `tasks.team.view`, a leitura de tarefas fica restrita ao responsável. Com esse grant, inclui a equipe dos departamentos autorizados. Sem `tasks.create`, não há criação avulsa. Execução, anexos, downloads, conferência e gestão têm grants separados.
8. Alteração de grants vale na sessão existente; reset da senha ou desativação revoga o acesso. Sessões demonstrativas estão desabilitadas no runtime normal e habilitadas apenas nos testes isolados identificados.

| Capacidade | Decisão de acesso |
| --- | --- |
| Visão geral, tarefas, empresas, modelos, documentos, relatórios, configurações | Grants de acesso à respectiva aba. |
| Ver a equipe | Grant próprio, além de acesso às tarefas; tenant/departamentos preservados. |
| Executar e marcar etapas | Grant de execução e responsabilidade pela tarefa; gestão pode atuar no escopo permitido. |
| Criar, anexar, baixar, exportar | Grants distintos, verificados no fluxo correspondente. |
| Conferir/devolver | Grant de conferência, tarefa no escopo e pessoa diferente dos participantes da execução. |
| Redistribuir, dispensar, reabrir | Grant de gestão; justificativas/estado/revisão continuam validados. |
| Gerenciar usuários e permissões | Grant explícito, independentemente do nome do cargo. |

Grants novos não são atribuídos automaticamente por mudar cargo. O administrador marca os acessos. Ações dependem da aba pertinente; servidor rejeita combinações incompletas. Colaboradores inativos ou sem execução não recebem novas atribuições/gerações. Tarefas já atribuídas a alguém desativado são preservadas e precisam de redistribuição autorizada; não há ainda uma fila automática do PRD.

## Falhas corrigidas e evidências

| Achado | Correção e verificação |
| --- | --- |
| Dados/anexos perdidos ao reiniciar API | PostgreSQL com transações, migrações, evidências bytea e audit persistente. Teste de reinício conserva versões/bytes/hash. |
| Concorrência/idempotência apenas em memória | Unicidade de recorrência no SQL, revisão no UPDATE e lock de gravação por tenant. 80 comandos na mesma revisão resultam em uma alteração e 79 conflitos. 12 gerações concorrentes produzem um lote de 4.000 tarefas. |
| Quota de anexos não transacional | Tamanho/5 MB por arquivo e quota por tenant verificados sob lock; erro faz rollback de tarefa/documento/audit. |
| Login era seleção livre de identidade/admin | Login por senha, gestão persistente e troca inicial. Endpoint demo desligado, inclusive tokens demo previamente emitidos quando a flag é desligada. |
| Cargo/permissões antigos conservados na sessão | Resolução atual no PostgreSQL e grants usados também no domínio. Testes revogam grants e resetam/desativam contas com sessões abertas. |
| Atribuição a pessoa sem capacidade de executar | Novas atribuições/gerações exigem conta ativa e capacidade de execução. Teste rejeita assignee cujo grant foi revogado. |
| IDs reiniciáveis no adaptador persistente | UUIDs por entidade/audit no PostgreSQL. IDs iguais em tenants diferentes testados com FKs compostas/RLS. |
| Limite de sessão burlável por caixa/barra da URL | Normalização canônica antes de classificar o rate limit. Variantes recebem o mesmo limite. |
| Pool sem handler podia derrubar Node com conexão ociosa perdida | Listener seguro e fechamento em falha de inicialização; teste encerra apenas um backend da base temporária e confirma reconexão. |
| Health sempre dizia ok sem verificar banco | Probe PostgreSQL; falha retorna 503 e mensagem segura. Teste não expõe detalhes da conexão. |
| Nome de upload UTF-8 corrompido/controles aceitos | Normalização do multipart e rejeição de controles/C1/surrogates/path. Testes com acentos e caracteres não latinos. |
| XML profundo gerava erro interno | Limite de 100 níveis e erro de validação controlado 422; XML normal permanece aceito. DTD/entidades continuam bloqueados. |
| CNPJ limitado a formato numérico sem DV | Normalização/validação numérica e alfanumérica, 5.000 casos gerados. Registros fictícios antigos preservados para não alterar silenciosamente IDs/dados. [Mudança oficial: Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico). |
| Indicadores/filtros não abriam a população equivalente | Seleção compartilhada entre tarefas/dashboard/relatórios, concluídas/dispensadas, meta e modelos/empresa. 500 populações geradas confrontam contadores com seleções. |
| Matriz descartava avulsas de título repetido | Agrupamento por identidade do modelo/título de avulsa e célula com todas as tarefas. CSV preserva todos os estados; teste de domínio verifica multiplicidade. |
| Importação portátil concorrente dava sucesso aparente | Destino é verificado sob lock dentro da transação; uma importação entra e a concorrente é rejeitada. Não sobrescreve tenants. |
| CLI podia conectar ao banco padrão sem URL | Conexão de migração obrigatória, sem destino implícito. |
| Transferência perdia nome/tenant vazio e contas | Bundle `portal-data-v2` preserva tenants, nomes, entidades, anexos e hashes/estado das contas; verifica evidências, codificação, duplicatas e vínculos. Restore/export/import são testados em novas bases locais. |

## Validação realizada

- `npm run check`: tipagem, lint, **62 testes em cinco arquivos** e build passaram. Inclui identidade, HTTP, regras de domínio, nomes de arquivos e testes de propriedades.
- **9.500 execuções geradas** com seed reproduzível: 5.000 CNPJ, 2.000 entradas de comando, 500 populações de indicadores, 300 sequências de 20–40 comandos, 500 tenants estrangeiros, 1.000 CSV e 200 XML. Isso é variedade gerada, não 9.500 funcionalidades distintas nem prova de ausência de bugs.
- PostgreSQL: **21 cenários** passaram, incluindo dois tenants com IDs repetidos, RLS/FKs, privilégios da API, rollback, regras via HTTP, anexos, revisão concorrente, quotas, reinício, geração/carga, backup/restauração, transferência e identidade persistida.
- Navegador: **dois cenários integrados** passaram em banco temporário separado: entrada/erro/móvel e admin → troca inicial → contas → operador restrito → execução/etapas → revogação → operador com concessões adicionais → supervisor → desativação/logout. API direta também testada para impedir contornar UI.
- `npm audit`: nenhuma vulnerabilidade conhecida nos pacotes instalados na consulta realizada. Não é garantia de segurança integral.
- Resultado de carga é salvo em `docs/auditoria/testes-postgres.json`. Bases temporárias são removidas pelo próprio teste; a base principal e a conta inicial não são usadas como fixture.

Os testes antigos de quatro fluxos da demonstração foram válidos para a versão anterior. O seletor foi retirado; esses resultados não são apresentados como E2E do login atual. Os novos E2E e os testes PostgreSQL cobrem o estado atual indicado acima. Não houve pentest externo ou acesso à VPS.

## Desempenho e limitações reais

Na execução de referência, 500 empresas × oito modelos geraram 4.000 tarefas; 12 solicitações concorrentes concluíram em aproximadamente 3,3 segundos. Um snapshot tinha cerca de **3,26 MB**. Com 40 leitores concorrentes, P50 foi **1,8 s** e P95 **3,1 s**. São medições locais, sujeitas ao ambiente; não são SLA nem garantia na VPS.

Cada operação ainda carrega o tenant completo antes de filtrar. Prioridade antes de crescimento: consultas/paginação no banco, snapshots menores e audit consultado por janela. A paginação visual não reduz esse payload. Sessões e limitadores por IP são de um processo; múltiplas réplicas exigem estratégia compartilhada ou configuração coerente. É preciso revisar proxy/IP/origens na VPS, sem desabilitar os controles locais para publicar.

Auditoria e documentos são append-only para o papel da aplicação; um administrador do banco pode alterar triggers/dados. Não há trilha externa resistente a esse ator. PDF/XML recebem validação estrutural, não antivírus, assinatura fiscal ou conferência de conteúdo.

Backup/export privado contém dados e hashes de contas. `.gitignore` protege o versionamento, não o disco. Não foram configurados ACL específica Windows, criptografia de backup, cópia externa programada ou recuperação de desastre numa VPS. A restauração local foi verificada; falta a política operacional e o ensaio no destino escolhido.

Login local não equivale a Supabase Auth, SSO, MFA ou recuperação de conta. A atribuição é por usuário, com departamentos; ainda não há perfil reutilizável com papel diferente por área/carteira. A API continua bloqueada fora do desenvolvimento local. HTTPS, reverse proxy, firewall, atualização de PostgreSQL/OS, gestão de segredos, monitoramento e deploy permanecem pendentes.

## O PRD ainda não está completo

O mapa de 52 seções e CA01–CA15 permanece no relatório original. Mudanças de parecer: persistência e versões são duráveis localmente; CA01 tem restrição SQL/concorrência; CA11 possui RLS e teste de dois tenants; parte de CA09 recebeu audit de segurança e transações; CA15 teve filtros/indicadores/matriz corrigidos. CA10 melhorou a elegibilidade, mas desativação ainda requer redistribuição manual. CA02, CA13 e CA14 continuam sem aceite integral.

Principais pendências de produto: cliente com múltiplas empresas, vigências de regime/carteira por departamento, grupos/vínculos de obrigação e manutenção em lote, calendário/feriados/dias úteis, geração agendada e outras periodicidades, tempo ativo por etapa/retrabalho, edição/versionamento governado de workflows/modelos, processos entre departamentos, P.O.P. gerenciável, notificações efetivas, eventos/outbox e integrações, XLSX/PDF padronizado, Portal do Cliente e painel TV. Faturamento/IA são fases futuras conforme PRD, sem implementação implícita.

As lacunas/decisões do próprio PRD estão discriminadas na auditoria original: conferentes autorizados, acesso a empresas por área, desativação/órfãs, publicação, prazos oficiais, retenção, políticas de identidade e aceite dos formatos de exportação. A decisão posterior do usuário sobre cargos sem teto prevalece sobre interpretações anteriores de restrição fixa por perfil.

Recomendação de sequência: validar login/permissões com o usuário; fechar cadastros/escopos pendentes do P0; melhorar consultas para volume; completar regras de geração/calendário e critérios de aceite; então preparar e verificar a VPS. Não anunciar todo o PRD ou prontidão de produção como entregue.
