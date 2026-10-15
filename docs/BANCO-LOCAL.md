# PostgreSQL local e migração

Estado de 08/10/2026. O projeto usa PostgreSQL local exclusivo, autorizado pelo usuário, mantendo Supabase como opção futura. A aplicação ficará numa VPS; nenhum serviço externo foi provisionado.

## Executar

Na pasta `<pasta-do-projeto>`, com Node/npm e binários PostgreSQL instalados:

```powershell
npm ci
npm run db:setup
npm run dev
```

Configuração já existente: execute somente `npm run dev`. O setup não sobrescreve `.env` nem tenants existentes. Credenciais são geradas aleatoriamente. Não copie `.env.example` antes do setup; seu conteúdo serve de referência para configuração explícita. `PG_BIN_DIR` permite indicar os binários quando não estiverem no caminho padrão Windows `C:/Program Files/PostgreSQL/18/bin`. O cluster criado está em `.local/postgres/data`, identificado por um marcador de propriedade, e usa somente `127.0.0.1:55432`. A instalação preexistente na porta 5432 não é usada.

`Ctrl+C` encerra a aplicação. `npm run db:stop` encerra somente o banco do projeto. `npm run db:start` o reinicia. Nenhum desses comandos apaga dados. Não versionar `.local`, `.env` ou `backups`.

## Comandos de dados

| Comando | Finalidade |
| --- | --- |
| `npm run db:migrate` | Compila e aplica SQL versionado, sob lock, com checksum. |
| `npm run db:backup` | Gera dump PostgreSQL privado em `backups`, sem owner/ACL. |
| `npm run db:export` | Exporta tenants, dados, histórico, bytes/base64 e hashes/estado das contas; sem tokens ou senhas em texto plano. |
| `npm run db:import -- caminho-do-arquivo.json` | Importa no destino explicitamente configurado, migrado e vazio para esses tenants; rejeita conflitos/corrupção. |
| `npm run test:database` | Cria bases locais temporárias, testa migração/RLS/regras/concorrência/recuperação e as remove. Preserva a base principal. |

Backup/export contém os dados e arquivos. `.gitignore` não é proteção de confidencialidade; mantenha cópias privadas e protegidas fora do computador para operação real. A restauração de dump e a importação portátil foram verificadas em outras bases locais com contagens/hashes. Isso não comprova uma restauração em um provedor ainda não escolhido.

## Levar para VPS ou Supabase

1. Definir o destino, instalar/provisionar PostgreSQL compatível e criar papéis separados. `DATABASE_URL` deve usar um papel restrito, sem superuser/BYPASSRLS; `MIGRATION_DATABASE_URL` fica somente na etapa de migração/transferência, com direitos suficientes de owner. No destino, a estratégia de owner/RLS precisa ser verificada.
2. Aplicar SQL e grants com `db:migrate`, mantendo `portal`/`portal_meta` privados. Não executar `db:setup` para criar automaticamente serviços remotos; ele é um inicializador de cluster local.
3. Exportar dados da origem. Selecionar a conexão de migração do destino de forma segura, sem colocar URLs com senha em comandos/logs/histórico. Importar bundle; não rodar seed antes da importação. Verificar contagens, nomes de tenants e hashes.
4. Para dump, restaurar sem owner/ACL e reaplicar grants/migrações. Confirmar a versão de origem/destino; compatibilidade de dump entre versões não é garantida. O bundle evita dependência do formato binário do dump, mas depende do contrato `portal-data-v2` e das mesmas migrações. Contas locais scrypt continuam válidas no login NestJS; não são importação automática para Supabase Auth.
5. Substituir login demonstrativo e configurar VPS antes de exposição externa. A API atual bloqueia produção e escuta loopback. Trocar a conexão não resolve identidade, domínio/HTTPS, reverse proxy, monitoramento, backups ou retenção.

As migrações usam PostgreSQL padrão em `supabase/migrations`; não há dependência de Auth/Storage do Supabase. [A documentação oficial de migrações do Supabase](https://supabase.com/docs/guides/local-development/database-migrations) descreve o ciclo SQL. Usar Supabase Auth ou expor acesso direto à Data API exigirá integrar identidades e rever RLS. A aplicação pode continuar consumindo PostgreSQL por NestJS na VPS.

## Limites

Persistência atual usa JSONB e colunas geradas/restrições; não implementa o modelo integral do PRD. Anexos ficam em bytea privado, com limite de 5 MB por arquivo e 1 GiB/tenant por padrão. O snapshot completo limita crescimento; deve evoluir para consultas/paginação SQL. Login e contas têm persistência real; sessões expiram ao reiniciar/recarregar. Os dados operacionais iniciais continuam fictícios.

A conta inicial é provisionada uma vez por `scripts/bootstrap-admin.mjs`, recebendo `PORTAL_BOOTSTRAP_USERNAME` e `PORTAL_BOOTSTRAP_PASSWORD` na configuração do processo, junto com a conexão de migração. Não armazenar a senha em código, Git, documentação ou logs. O script preserva a conta existente e não redefine senha/grants. A senha temporária exige troca no primeiro acesso; `npm run dev` só chama bootstrap quando ambos os valores foram explicitamente configurados.
