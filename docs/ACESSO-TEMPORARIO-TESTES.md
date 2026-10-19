# Acesso temporário para testes locais

Solicitado explicitamente em 13/10/2026 para visualizar e testar administrador e operador pela mesma tela de login. O usuário confirmou que, nesta etapa, não deve haver e-mail, código ou etapa adicional nesses dois acessos. A configuração privada associa o usuário informado à senha de administrador ou à senha de operador solicitada; os valores ficam em `.env`, ignorado pelo Git.

## Funcionamento

- `ENABLE_LOCAL_TEST_LOGIN=true` habilita o atalho somente em `NODE_ENV=development`, persistência PostgreSQL e instância local dedicada na porta 55432. `LOCAL_TEST_USERNAME`, `LOCAL_TEST_ADMIN_PASSWORD` e `LOCAL_TEST_OPERATOR_PASSWORD` precisam estar preenchidos; as duas senhas devem ser diferentes.
- `npm run dev` prepara o tenant fictício `apice-local-test` sem sobrescrever tenants ou dados existentes. Administrador utiliza a fixture Helena; operador comum utiliza Júlia, que já possui tarefas de exemplo.
- O administrador inicial de teste recebe o catálogo completo de permissões. O operador começa com tarefas próprias, execução/checklist e anexos/download. Essas concessões estão no banco; continuam editáveis pela administração, sem teto obrigatório pelo cargo.
- As credenciais normais permanecem intactas. As fixtures possuem hashes aleatórios sem uma senha normal divulgada e não usam o remetente de e-mail. O segundo fator continua preparado para contas normais; SMTP real ainda está pendente.
- O servidor emite sessão marcada `local-test` por uma hora, registra o acesso e revalida conta ativa, permissões e versão de senha a cada requisição. Desligar a flag invalida a sessão de testes no próximo acesso. `ENABLE_DEMO_SESSIONS` permanece desabilitado.
- A interface identifica o ambiente de testes. Tokens ficam apenas em memória; sair ou recarregar exige novo login. Modificações de tarefas e permissões persistem no tenant fictício.
- Essas duas identidades são atalhos de visualização, não validação de recuperação/MFA. Reset de senha das duas fixtures é bloqueado na interface/API para não criar uma etapa impossível de concluir. Grants e ativação continuam editáveis; e-mail é opcional ao editar contas fictícias existentes. A criação normal de contas continua exigindo e-mail. Não usar esse atalho como teste de cadastro e login real de novas contas.

## Remover antes de produção / VPS

1. Remover `apps/api/src/security/local-test-login.ts`, seu uso em `SessionService`/`SessionController`, o modo `local-test` e a resposta de sessão direta no login. O fluxo normal volta a aceitar somente o desafio de autenticação.
2. Remover `scripts/prepare-local-test.mjs` e `scripts/prepare-demo-data.mjs` (dados fictícios de demonstração, 17/10/2026), as chamadas em `scripts/dev.mjs`, as variáveis temporárias da configuração privada e seus exemplos.
3. Remover o indicador da interface, as exceções temporárias do formulário de usuários (e-mail opcional das fixtures e bloqueio de reset) e os testes específicos do atalho (`apps/api/test/local-test-login.test.ts` e `scripts/test-local-test.mjs`), preservando testes de identidade, autorização e MFA.
4. Excluir o tenant fictício e seus registros relacionados de qualquer conjunto destinado à produção. Exportação e backup atualmente incluem tenants; verificar isso antes de migrar. Não apagar tenants reais nem remover registros da auditoria por caminhos operacionais.
5. Revalidar login individual, recuperação, MFA obrigatório, revogação, permissões e implantação com o atalho ausente.

Não publicar esse ambiente nem usar dados reais. A versão atual continua exclusivamente local; a VPS ainda não foi implantada.

## Verificação desta etapa

- `npm run check`: tipagem, lint, build e 91 testes em oito arquivos passaram. Os testes antigos de sessão foram adaptados à confirmação MFA; novos testes cobrem o atalho somente local e sua revogação.
- `node scripts/test-local-test.mjs`: 21 verificações HTTP/PostgreSQL passaram, incluindo os dois logins diretos, escopo do operador, bloqueios administrativos, tarefa alheia ocultada (404), execução/checklist persistido, seed idempotente, logout e fingerprint inalterado do tenant principal. Uma tarefa fictícia ficou em andamento com uma etapa marcada, preservando auditoria, para comprovar a operação.
- Conferência visual no navegador: administrador entrou sem etapa adicional com oito abas; edição de Júlia salvou sem exigir e-mail e apresentou campo de reset desabilitado. Logout e login do operador mostraram somente Minhas tarefas, sem Nova tarefa nem gestão. A tela ficou aberta como operador.
- SMTP real e a suíte ampla de banco/E2E das contas normais continuam pendentes de integração. Esses resultados não comprovam envio de e-mail real, todos os requisitos do PRD ou implantação na VPS.
