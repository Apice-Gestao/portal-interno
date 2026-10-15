# Segurança

Esta versão usa contas individuais com senha, além de dados operacionais fictícios. A API recusa iniciar fora de `NODE_ENV=development` e escuta somente em `127.0.0.1`. Não foi configurada para produção na VPS. O endpoint de perfis demonstrativos fica desabilitado na execução normal; só os testes isolados usam `ENABLE_DEMO_SESSIONS=true`.

Exceção temporária autorizada em 13/10/2026: dois acessos diretos para visualizar administrador/operador, sem MFA ou troca inicial nesses acessos. Exigem opt-in privado, development, instância PostgreSQL local dedicada e usam somente o tenant fictício `apice-local-test`. Credenciais normais não foram resetadas. Sessões temporárias revalidam conta/grants/versão de senha e são rejeitadas quando a flag é desligada. Remover código, configuração e dados fictícios antes da produção; ver [registro e remoção](ACESSO-TEMPORARIO-TESTES.md).

## Controles implementados

- Login por usuário/senha. Senhas derivadas com scrypt N32768/r8/p3, salt aleatório de 32 bytes e comparação constante; quatro derivações simultâneas e fila de até 16. Senha temporária exige troca antes de acessar módulos; novas senhas têm 12–128 caracteres. Login é limitado a dez tentativas por IP/minuto. Contas desconhecidas também passam pela derivação. [Referência de parâmetros: OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Sessões locais com token aleatório opaco, validade de uma hora, revogação e limite de sessões; ator/conta ativa/versão da senha/permissões são revalidados no servidor. Reset de senha ou desativação revoga sessões existentes. O cliente HTTP mantém o token apenas em memória e exige novo login ao recarregar.
- Abas, ações e escopo de equipe são grants persistidos; cargos não concedem nem limitam acessos automaticamente. A gestão pode atribuir qualquer grant a qualquer cargo, conforme decisão do usuário. UI/rotas, guards e domínio verificam autorizações. Sem `tasks.team.view`, só tarefas próprias; tenant/departamentos continuam obrigatórios. A última conta ativa com `users.manage` não pode perder esse acesso por administração comum.
- Autorização no domínio para tenant, departamento, carteira e perfil. Cabeçalhos enviados pelo cliente não definem tenant ou cargo.
- Esquemas Zod estritos, campos desconhecidos rejeitados, limites de tamanho e justificativas obrigatórias nas ações sensíveis.
- Controle de revisão para rejeitar alterações sobre estado desatualizado; validações antes da aplicação da mutação.
- Conferência por outra pessoa, incluindo os participantes da execução após redistribuição ou reabertura; consulta sem permissão de mutação.
- API com Helmet, CORS e origem/host restritos ao ambiente local, `Cache-Control: no-store`, identificador de requisição e limitação de requisições em memória.
- JSON limitado a 64 KB nas rotas comuns e 256 KB na importação de até 200 empresas. Upload limitado a um PDF/XML de 5 MB, com nome validado e normalização UTF-8. PDFs são analisados estruturalmente; XML malformado, com múltiplas raízes, DTD/entidades ou mais de 100 níveis é rejeitado. Hash SHA-256 é conferido no download. Memória tem quota de 32 MB; PostgreSQL tem quota documental por tenant de 1 GiB por padrão, configurável por `MAX_TENANT_DOCUMENT_BYTES`, verificada sob lock/transação.
- Alterações de tarefas registram valores antes/depois persistidos. Login/logout/download também geram auditoria com contexto de IP/dispositivo, respeitando a visibilidade do histórico. Eventos de modelos/geração respeitam o departamento.
- PostgreSQL com RLS forçado, FKs compostas, unicidade de recorrência, controle de revisão no SQL e rollback conjunto de tarefa/anexo/audit. A API revalida o papel persistido; não usa superuser/BYPASSRLS. O pool trata desconexões ociosas e tenta reconectar; saúde consulta o banco e retorna 503 sem detalhes internos quando indisponível.
- Credenciais locais aleatórias e arquivos privados ignorados pelo Git. Exportação exige destino configurado; importação valida hashes/base64/vínculos e rejeita tenants existentes sob lock dentro da transação. Backups/exports contêm dados e precisam de proteção própria.
- Downloads verificam o escopo e usam `Content-Disposition: attachment`. Exportações CSV escapam células e neutralizam prefixos de fórmulas.
- A prévia estática declara CSP e cabeçalhos de proteção em `apps/web/public/_headers`. Não contém credenciais de banco ou de serviço.

## Verificação automatizada

Os testes de domínio exercitam isolamento por tenant/departamento, somente leitura, conferência própria, justificativas, conflitos de revisão, conclusão incompleta, idempotência da geração/importação, preservação de histórico e validação de arquivos/CSV.

Os testes HTTP exercitam sessão ausente ou forjada, escopo do snapshot, cabeçalhos de proteção, origem/host estrangeiro, tentativa de definir perfil por cabeçalho, payload inválido, dispensa sem permissão, evidência inválida, download autorizado, limite de JSON, revogação e recusa do modo demonstrativo em produção. Execute `npm run check` para repetir essas verificações e `npm audit` para verificar os pacotes instalados.

## Limites e preparação para operação real

O papel da API não pode alterar/excluir evidências e auditoria persistida. Isso não torna o histórico resistente a um administrador do PostgreSQL: ele pode alterar triggers/dados. Proteção contra esse ator exige trilha externa/retencão definida. Sessões e limitadores não são compartilhados entre processos. Cada operação ainda lê o tenant completo, de modo que volume excessivo pode degradar disponibilidade.

A análise estrutural de PDF/XML não faz varredura antimalware, validação fiscal, assinatura digital ou conferência do conteúdo da obrigação. Os arquivos iniciais são documentos de exemplo.

Antes de usar dados reais, definir política de senha/MFA, recuperação de conta e perfis por departamento/carteira; configurar HTTPS/proxy/firewall, segredos e permissões de disco na VPS; automatizar backups externos protegidos e ensaiar recuperação; definir retenção e regras oficiais de prazo. O `.gitignore` evita versionar credenciais, mas não protege o disco ou criptografa backups. O modo `0600` de arquivos não garante ACL equivalente no Windows. PostgreSQL instalado 18.4 deve ter atualizações de manutenção avaliadas antes da implantação. Nenhuma VPS foi acessada ou implantada.

RLS atual utiliza contexto definido pela API; quem obtém a credencial SQL de execução pode definir esse contexto. Portanto não fornecer essa credencial ao browser nem tratar RLS como substituto da proteção do backend/segredos. O inicializador usa credenciais de migração, mas remove essa URL e valores de bootstrap do ambiente filho da API. Na VPS, manter papéis/segredos de migração fora do serviço da aplicação.
