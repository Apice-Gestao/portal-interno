# Revisão geral do projeto — Claude Code — 18/10/2026

Pedido do usuário: revisão geral para saber se estamos alinhados para seguir com novas funções, validar o que já está pronto (robusto e escalável) e avaliar a auditoria deixada pelo Codex em `docs/REVISAO-ARQUITETURA-E-AJUSTES-2026-10-17.md`.

Recorte: estado do `main` em `d9db466`, sem alterações de código nesta etapa. Os achados do Codex foram conferidos no código atual e os principais foram reproduzidos em memória (fixtures fictícias, sem banco principal). Nenhum segredo ou dado real neste documento.

## Parecer

**Escopo e base: alinhados.** O que foi construído segue o PRD e as decisões registradas no `AGENTS.md`. A base técnica é boa: regras de negócio num domínio único compartilhado entre servidor, interface e prévia; autorização sempre no servidor; isolamento por grupo no PostgreSQL (RLS); proteção contra gravação simultânea (revisões e CAS); auditoria na mesma transação; 304 testes automatizados passando.

**Seguir para novas funções: sim, depois de uma rodada curta de correções.** Cinco achados são de prioridade alta (P1) e dois deles são de permissão. As próximas funções previstas (níveis de acesso Operador/Coordenador/Gerente/Diretoria, calendário do operador, transferência em lote) mexem justamente em permissões, situações e geração; corrigir antes evita construir em cima de regra errada. Estimativa: uma etapa de trabalho, com testes de regressão para cada caso.

**Robusto e escalável para produção: ainda não, e isso já era sabido.** A forma como o servidor lê os dados (carrega o grupo inteiro a cada requisição, e a tela pergunta de novo a cada 5 segundos) funciona bem em teste, mas não acompanha o crescimento do histórico. Exemplo ilustrativo: 200 empresas com 8 tarefas por mês geram 1.600 tarefas/mês; em menos de três meses chega-se às 4.000 tarefas em que o Codex mediu 4 s de espera (p95, 40 leitores, máquina local). O caminho de solução já está desenhado e os dois agentes concordam com ele (seção “Escala”). Isso precisa estar pronto **antes do piloto com dados reais**, não antes das próximas funções — desde que as funções novas não aumentem a dependência dessa leitura integral.

## Avaliação da auditoria do Codex

A auditoria faz sentido e é precisa. Todos os achados técnicos procedem no código atual, exceto R01 (já resolvido) e R13 (quase todo resolvido depois da auditoria). Ajustei apenas a prioridade de alguns.

| ID | O que diz | Conferência no código atual | Veredito | Prioridade |
| --- | --- | --- | --- | --- |
| R01 | Verificação oficial falhava (`PortalState` sem import) | Import adicionado; `npm run check` passa | Resolvido | — |
| R02 | Geração automática não enxerga todos os grupos | Nenhuma migração dá `SELECT` em `portal.tenants` ao papel do servidor; `tenantIds()` cai no `PORTAL_TENANT_ID` e só um grupo gera | Procede | P1 |
| R03 | Etapas personalizadas de outro setor vão para quem não tem acesso | Reproduzido: operador só do Fiscal recebe, no snapshot, etapas próprias de modelo de outro setor; `setCompanyWorkflow` também devolve a empresa inteira | Procede (vaza nomes de etapas, não dados de cliente) | P1 |
| R04 | “Agrupar por colaborador” mostra % na meta sem a permissão de desempenho | Reproduzido: coluna `onTimePercent` aparece com só `reports.view` | Procede | P1 |
| R05 | Empresa suspensa depois de “em encerramento” continua recebendo tarefas | Reproduzido: 5 tarefas de novembro geradas para empresa suspensa | Procede | P1 |
| R06 | Reativar com situação personalizada mantém o término antigo | Reproduzido: retomada com `active:retomada` gera 0 tarefas | Procede (mesma regra do R05; corrigir junto) | P1 |
| R07 | Proposta pendente pode aprovar situação já removida | Aprovação não revalida o catálogo; remoção ignora propostas pendentes | Procede | P2 |
| R08 | Editor por empresa não percebe mudança do modelo geral feita em paralelo | O pedido leva só a revisão da empresa, não a versão do modelo vista | Procede | P2 |
| R09 | Quadro “Equipe” esconde tarefas de pessoa desativada ou sem execução | Colunas só de pessoas ativas que executam; as tarefas delas somem do quadro mas entram nos totais | Procede | P2 (alta) |
| R10 | Trocar o formato do relatório permite esconder todas as colunas | Contagem usa `columns.length - hidden.length` com IDs que não existem mais | Procede | P2 |
| R11 | “Limpar” data deixa a data aparecendo, sem filtrar | `value ?? local` no `DatePicker` | Procede (relatório pode ser lido com recorte errado) | P2 |
| R12 | Prévia restaura o anexo sem o arquivo | Arquivos ficam só na memória da aba; o registro volta, o download falha | Procede — só prévia | P3 |
| R13 | Escolher o grupo apaga a sessão restaurada da prévia | Depois da auditoria o grupo passou a ser lembrado na prévia; recarregar não remonta mais. Resta só o desenho “descartar cliente = sair”, que afeta apenas a troca de grupo (onde novo login já é esperado) | Quase resolvido — só prévia | P3 |
| R14 | Estado salvo da prévia não é validado | Ainda é aceito por cast; já existe “Recomeçar a demonstração do zero” na tela de entrada | Parcial — só prévia | P3 |
| A01 | Um cadastro com problema impede a geração automática do grupo inteiro | `autoGenerate` gera todos os setores num único estado; um `NO_OWNER` derruba tudo e só aparece no log | Procede | P1 |
| A02 | Competências perdidas não são recuperadas | Sempre calcula só o mês recém-fechado; sem marco persistido | Procede — precisa de decisão sua | P2 (antes do piloto) |

Onde divirjo levemente do Codex:

- **R06 sobe para P1** porque a correção é a mesma do R05 e o efeito é silencioso (empresa reativada sem tarefas).
- **R12–R14 descem para P3**: valem só para a prévia hospedada, que é temporária. Correção barata: ao restaurar, descartar anexos sem arquivo com aviso claro e validar versão/estrutura do estado salvo, voltando ao estado fictício íntegro quando não bater. **Correção de informação:** eu disse que a prévia mantinha tudo após recarregar; isso vale para login, grupo, tela e dados, mas **não para o conteúdo de anexos** enviados na prévia.
- **Ordem da refatoração de leitura**: concordo com o desenho do Codex (monólito modular, consultas específicas por módulo, começando por Tarefas). Acrescento uma regra para as próximas funções: telas novas (ex.: calendário do operador) devem nascer usando consultas específicas no servidor, e não o snapshot integral, para não aumentar a dívida.

## O que está pronto

“Pronto” aqui significa: funciona no PostgreSQL local, com autorização no servidor e testes automatizados. Não significa pronto para produção.

| Área | Situação |
| --- | --- |
| Entrada e identidade | Login individual, troca de senha, recuperação e código por e-mail (MFA) com limite de tentativas; sessões em cookie HttpOnly. Envio real de e-mail (SMTP corporativo) não configurado |
| Usuários e permissões | Concessões individuais por aba/ação, cargo como identificação (não teto), departamentos livres, lideranças, ordenação |
| Empresas e carteira | Cadastro, regime, responsáveis por setor ou fila, situações (ativa, suspensa, inativa e criadas pelo usuário), histórico por competência e propostas de alteração com impacto |
| Modelos e fluxos | Modelos de tarefa com versão, editor visual de etapas, etapas próprias por empresa, fluxos de implantação entre setores |
| Geração de tarefas | Manual por setor e automática mensal (com os ajustes R02, R05, R06 e A01 pendentes) |
| Tarefas | Fila, assumir, transferir, etapas, conferência independente, dispensa, cancelamento e reabertura, comentários, datas de negócio em São Paulo |
| Documentos | Evidências com hash e versão, regras por obrigação, validação, filtros completos |
| Central do gestor | Equipe (quadro por pessoa, escopo dos setores do gestor) e Alterações de empresas |
| Relatórios | Catálogo, relatórios combinados, agrupamento, colunas, Excel/PDF (com R04, R10 e R11 pendentes) |
| Painel de TV | Dispositivo pareado, dados sanitizados, escopo próprio |
| Auditoria | Registro na mesma transação de cada alteração |

Só demonstração (temporário, remover antes da VPS, conforme `docs/ACESSO-TEMPORARIO-TESTES.md`, `docs/TUTORIAL-DEMO-TEMPORARIO.md` e `docs/TV-SIMULACAO-TEMPORARIA.md`): prévia hospedada e sua persistência local, tutorial guiado, entradas admin/admin e operador/operador da prévia, dados fictícios dos grupos de teste, simulação da TV e acesso direto de testes.

## Escala e arquitetura

Concordo com a tabela de arquitetura do Codex. Resumo do que pesa:

1. **Leitura integral do grupo** (`loadState` a cada requisição + atualização da tela a cada 5 s). É o principal limite de escala. Relatórios combinados multiplicam isso (um relatório com 31 seções faz 31 leituras integrais). Solução combinada: consultas de Tarefas direto no PostgreSQL, com autorização, filtros e paginação; depois Visão geral, Empresas, Auditoria e famílias de relatórios.
2. **Geração automática dentro do processo da API**, sem marco persistido (A02) e com unidade de falha grande (A01). Antes do piloto: resultado por empresa/setor, registro do que não gerou visível ao gestor e marco da última competência processada.
3. **Sessões e limite de tentativas em memória**, por processo. Atende uma VPS com um processo; impede replicar a API sem antes levar isso ao banco.
4. **Motor central grande** (`engine.ts` com 2.572 linhas). Funciona e está bem testado; separar por módulo à medida que cada área for mexida, sem reescrita geral.
5. **Código de demonstração no build normal.** O cliente de demonstração (motor, dados fictícios, vitrine e tutorial) é importado sempre e decidido em tempo de execução. Não é falha de segurança (o servidor continua decidindo tudo), mas aumenta o pacote e mistura temporário com produção. Ao remover os temporários, conferir que o build da VPS não contém nada de demonstração.
6. **Estilos em camadas** (`clean-list.css` por cima de `styles.css`). Consolidar quando o visual estabilizar.

## Plano recomendado

**Etapa A — correções antes de novas funções (P1):** R02, R03, R04, R05 + R06 e A01, cada um com teste que reproduz o problema. Depois, na mesma linha, R07–R11 (P2).

**Etapa B — decisões suas:**

1. A02: a partir de qual competência a geração automática vale e se meses perdidos devem ser gerados automaticamente ou só sugeridos ao gestor.
2. Tamanho real esperado: número de empresas, tarefas por mês e pessoas usando ao mesmo tempo. Isso define a meta de desempenho da VPS.
3. Próxima função: sugiro os níveis de acesso (Operador/Coordenador/Gerente/Diretoria) e o calendário do operador, já com consultas específicas.

**Etapa C — antes do piloto com dados reais/VPS:** consultas de Tarefas sem leitura integral, geração automática com marco e resultado por unidade, remoção dos temporários (com conferência do build), SMTP corporativo, cópia de segurança e restauração testadas, configuração da VPS (HTTPS, segredos, logs).

## Verificações desta revisão

- Reprodução em memória (fixtures fictícias): R03 verdadeiro, R04 verdadeiro, R05 = 5 tarefas indevidas, R06 = 0 tarefas devidas.
- Leitura de código atual: R02, R07–R14, A01, A02.
- `npm run check`: tipagem, lint, 304 testes (21 arquivos) e builds aprovados; só o aviso conhecido de pacote acima de 500 kB.
- Build normal (`dist/assets`) conferido: contém os textos do tutorial de demonstração, confirmando o item 5 de “Escala e arquitetura”.
- Não executado nesta revisão: testes PostgreSQL massivos, navegador, VPS, pentest externo.

## Atualização — correções aplicadas no mesmo dia

A pedido do usuário, R02–R12, R14 e A01 foram corrigidos com testes (detalhes em `docs/CONTEXTO.md`, seção “Correções da revisão e auditoria da demonstração”). R13 ficou como está: o grupo já é lembrado na prévia e sair de um grupo encerra a sessão de propósito. **A02 continua pendente** de decisão (a partir de qual competência a geração automática vale e se meses perdidos são gerados ou só sugeridos). A auditoria da demonstração encontrou ainda: downloads e impressão bloqueados no link publicado (agora com aviso), criação/importação de usuários indisponível na prévia e edição de usuário fictício travada pelo e-mail obrigatório — corrigidos. O teste de navegador `test:e2e` estava desatualizado desde 13/10 (código por e-mail e tela de grupos); o primeiro cenário voltou a passar e o segundo precisa ser reescrito.
