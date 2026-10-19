# Revisão completa com carga ampliada — Claude Code — 19/10/2026

Pedido do usuário: “quero outra revisão completa, dessa vez mais detalhada e com uma carga maior de testes” e, durante o trabalho, “veja coisas como rate limit, ataque DDoS pra impedir esse tipo de situação”.

**Base revisada:** main em `7195e22` + junção não commitada da branch `claude/eloquent-kepler-dec625` (L01–L14) + complementos L15/L16 desta sessão. Só dados fictícios, API local em `127.0.0.1` e bases descartáveis na instância 55432; nada publicado e nenhum segredo neste documento. **Nenhum código do produto foi alterado nesta revisão**; os testes temporários de estresse, abuso e escala foram apagados ao final.

## Parecer

1. **Regras de negócio: sólidas.** Nenhuma regra quebrou em ~94 mil populações aleatórias, no passeio aleatório entre módulos e nas baterias de banco. Os defeitos novos são de borda (seção 3).
2. **Escala: é o bloqueio real para o piloto.** Com 20 mil tarefas no grupo (cerca de 1 ano de 200 empresas), abrir o portal leva ~25 s para 40 pessoas ao mesmo tempo e uma gravação simples ~24 s; com 80 mil o banco desiste. A solução já é conhecida: consultas por tela no PostgreSQL, sem carregar o grupo inteiro (seção 4).
3. **Proteção contra abuso: boa para uso local, insuficiente para a internet.** O limite de requisições existe e não é burlável por cabeçalho falso, mas é por endereço IP e fica na memória do processo, o que pode bloquear o escritório inteiro e não protege contra muitos endereços ao mesmo tempo. DDoS de verdade se resolve na borda da VPS (seção 5).

## 1. O que foi executado

| Bateria | Volume | Resultado |
| --- | --- | --- |
| `npm run test:massive` (tipagem, lint, 337 testes, builds, banco, modelos, jornadas, TV) | completo | Aprovado; banco principal intacto, nenhuma base temporária restante |
| Testes de propriedade ×10 (temporário) | 94.500 populações aleatórias em 10 propriedades (antes 9.450) | Aprovado, 10/10 |
| Passeio aleatório entre módulos (temporário) | 20 mil ações em 16 sequências | Nenhuma regra quebrada (seção 2) |
| Escala no PostgreSQL (temporário) | 500 empresas × 8 obrigações, 4 mil → 80 mil tarefas, 40 leitores e 20 escritores simultâneos | Tabela da seção 4 |
| Abuso da API (temporário) | rajadas de login, 350 leituras, JSON gigante, URL gigante, cabeçalho falso, sessões | Seção 5 |
| `test:e2e` (navegador, login com código por e-mail) | 2 cenários | Aprovado |
| Telas | 13 caminhos em 375 px + 10 caminhos em 768/1024/1366/1920 px | Sem rolagem lateral, sem erro |
| Tutorial da demonstração | 114 passos nos 12 módulos | Sem balão fora da tela ou cobrindo o alvo, sem erro |
| Revisão de código da junção | 27 arquivos, ~1.500 linhas | 8 achados (seção 3) |

## 2. Passeio aleatório entre módulos

Duas rodadas, 8 sequências cada, sobre a base fictícia com vitrine de demonstração (fluxos e implantações): **20 mil ações** (12 mil + 8 mil), ~7,5 mil aceitas e o resto recusado com motivo de negócio. Ações: comandos de tarefa, anexos, comentários, propostas e decisões (288 decididas), transferência de carteira (462) e de tarefas, geração manual (749) e automática repetida (629+), avulsas com competência, ativar/desativar pessoas (618+), 24 tipos de relatório com e sem agrupamento e avanço de 20 dias no relógio.

Verificado a cada ação ou a cada 50 ações: nenhum erro não tratado; recusa não altera o estado (comparação do estado inteiro); geração automática repetida não muda nada (idempotente); nenhuma tarefa recorrente duplicada; auditoria só do próprio grupo; snapshot de cada perfil sem tarefa invisível nem etapas de modelo invisível; totais = listas; TV com o total certo; relatórios sempre com colunas. **Nenhuma violação encontrada.**

Limite: nessa rodada entre módulos, enviar/concluir/aprovar tarefas foram pouco aceitos (a escolha aleatória raramente completa todas as etapas); esse caminho está coberto pelo passeio só de tarefas (7.500 ações) e pelas baterias de banco. Uma primeira tentativa com 32 mil ações foi interrompida por lentidão do próprio teste (comparava o estado inteiro a cada ação).

## 3. Achados de lógica e código

| # | Gravidade | Achado | Cenário |
| --- | --- | --- | --- |
| C01 | P2 | Conferência de XML aceita só competência no formato AAAA-MM | XML correto com “09/2026”, “202609” ou período em atributo é recusado (`DOCUMENT_MISMATCH`) quando a regra pede competência (`documents.ts`) |
| C02 | P2 | Filtro de propostas trata setor ausente como atendido | Empresa só com responsável Fiscal: gestor do Pessoal continua vendo as propostas dela (`engine.ts`, snapshot) |
| C03 | P2 | Proposta mista some para setores afetados | Mudança de regime + responsável Fiscal: o gestor do Contábil deixa de ver uma alteração que revisa tarefas do Contábil |
| C04 | P2 | Transferência futura move tarefas antigas agora | Carteira transferida com vigência 12/2026 e “transferir abertas”: tarefas de 09 e 10 mudam hoje |
| C05 | P3 | Relatório de pendências de desativados ignora quem perdeu a execução | Pessoa ativa sem `tasks.execute` não aparece, embora a geração já a trate como inválida |
| C06 | P3 | TVs antigas passam a acompanhar o mês sem aviso | TV fixada de propósito num mês muda após a atualização (decidir migração ou aviso) |
| C07 | P3 (manutenção) | Mapa comando → permissão duplicado | `deny_dispense` tratado em dois lugares do `engine.ts` |
| C08 | P3 (manutenção) | Aviso “sem responsável válido” repetido em três lugares com três nomes de ação | Dificulta filtrar a auditoria |

## 4. Escala medida (PostgreSQL local, base descartável)

| Tarefas no grupo | Snapshot | Leitura p50 / p95 (40 simultâneos) | Gravação p50 / p95 (20 simultâneas) | Relatório Pendências |
| --- | --- | --- | --- | --- |
| 4.000 | 3,2 MB | 3,0 s / 4,8 s | 2,3 s / 4,2 s | 0,2 s |
| 20.000 | 15,7 MB | 14,8 s / 24,8 s | 13,2 s / 23,6 s | 0,9 s |
| 40.000 | 31,2 MB | 27,5 s / 49,2 s | 27,5 s / 49,6 s | 1,8 s |
| 80.000 | — | o banco cancelou por tempo esgotado (`statement timeout`) | — | — |

- O custo cresce em linha reta com o histórico; gravações esperam as leituras porque cada operação carrega o grupo inteiro.
- A tela pede o snapshot a cada 5 s: 40 pessoas geram 8 leituras por segundo. Acima de ~4 mil tarefas a fila não esvazia.
- **Recomendação (P1 antes do piloto):** consultas por tela no PostgreSQL (Tarefas primeiro, paginadas e filtradas no banco), polling mais leve (só o que mudou) e arquivamento/limite de histórico no snapshot. Medição local, não da VPS.

## 5. Proteção contra abuso e DDoS

**O que já funciona (medido):**
- Login: 10 tentativas por minuto por endereço; a 11ª recebe 429. Variações do caminho (`/LOGIN`, barra final) contam no mesmo limite. Cabeçalho `X-Forwarded-For` falso não zera o limite.
- API: 300 requisições por minuto por endereço; 200 leituras simultâneas foram atendidas em 0,5 s (memória) e a 301ª recebeu 429.
- Entrada: JSON acima do limite → 413; JSON malformado → 400; URL gigante → 431; upload com 1 arquivo e tamanho máximo; código por e-mail com 5 tentativas.
- Senhas com scrypt (custo alto) e hash fictício para usuário inexistente (não revela quem existe).

**Riscos encontrados:**

| # | Gravidade | Risco | Efeito |
| --- | --- | --- | --- |
| S01 | P1 (VPS) | Limite por IP com todo o escritório atrás de um IP (NAT) ou atrás do proxy reverso | Com polling de 5 s, ~25 pessoas no mesmo IP passam de 300/min e **todos** recebem 429. Atrás de proxy sem `trust proxy`, todos os usuários viram “o mesmo IP” |
| S02 | P1 (VPS) | Limites e sessões em memória do processo | Não valem entre processos; reiniciar zera; um ataque de muitos IPs (botnet) não é contido |
| S03 | P1 | Teto global de 100 sessões | Quem logar muitas vezes (ou várias abas/aparelhos por 1 h) esgota o teto e **ninguém** entra até expirar |
| S04 | P2 | Login caro sem bloqueio por conta | Cada tentativa custa ~190 ms de CPU e 32 MB; 16 em paralelo levam 1,1 s. Uma conexão do banco de identidade (4 no total) fica presa durante o cálculo. ~15 tentativas/s de vários IPs travam o login de todos |
| S05 | P2 | Limite não considera o custo | Uma única pessoa pode pedir 300 snapshots/min; com 20 mil tarefas cada um custa ~15 s de banco |
| S06 | P3 | Limpeza dos contadores percorre todos a cada requisição | Com milhares de IPs, cada requisição fica mais lenta (amplificação) |
| S07 | P3 | `health` cai no mesmo limite | Monitoramento acusa queda durante abuso |
| S08 | P3 | Conexões lentas | Node espera até 60 s por cabeçalhos e 300 s por requisição; sem teto de conexões |

**Plano recomendado:**
1. **Na borda da VPS (o que realmente segura DDoS):** proxy reverso (Nginx ou Caddy) com HTTPS, `limit_req`/`limit_conn`, tempos curtos (`client_header_timeout` ~10 s), tamanho de corpo, e de preferência um serviço de proteção à frente (ex.: Cloudflare) e firewall da VPS liberando só 80/443.
2. **Na API:** `trust proxy` configurado só para o proxy; limite por **conta** além de por IP; contadores e sessões no PostgreSQL (ou Redis) para valer entre processos; teto de sessões **por pessoa** (ex.: 5) em vez de global, revogando a mais antiga; atraso progressivo e bloqueio temporário por conta após falhas; mover o cálculo da senha para fora da transação; limite separado e mais baixo para endpoints caros (snapshot, relatórios, uploads); `health` fora do limite comum; `server.headersTimeout`/`requestTimeout` menores e `maxConnections`.
3. **Monitoramento:** o registro técnico novo já mostra 429/4xx com número da requisição; somar alertas na VPS.

## 6. Recomendação de ordem

1. Decidir e corrigir C01–C04 (P2) e o teto de sessões S03, que afetam uso normal.
2. Antes do piloto: escala (seção 4) e S01/S02/S04/S05 junto com a configuração da VPS.
3. P3 em lote.

## 7. Correções aplicadas no mesmo dia

A pedido do usuário (“corrija C01–C04 e o teto de sessões S03, com testes”):

| Achado | Correção | Teste |
| --- | --- | --- |
| C01 | `xmlCompetences()` lê AAAA-MM, AAAA-MM-DD, MM/AAAA, MM-AAAA e AAAAMM; `xmlField` também lê atributos (`perApur="2026-09"`) | `packages/domain/test/full-review-2026-10-19.test.ts` |
| C02/C03 | Propostas chegam aos setores afetados: responsáveis alterados e, quando muda regime, situação ou término, todos os setores que atendem a empresa (setor ausente do cadastro não atende) | idem |
| C04 | Transferência com vigência futura só move tarefas abertas daquela competência em diante; na competência em andamento continua movendo todas as abertas | idem |
| S03 | Até 5 sessões por pessoa (o login novo derruba a mais antiga dela); teto geral só de memória (5.000) | `apps/api/test/sessions.test.ts` |

Bateria após as correções: `test:massive` aprovado (343 testes; PostgreSQL 25/8/29/13; banco principal intacto) e `test:e2e` 2/2. Continuam em aberto: S01, S02, S04–S08 (dependem da configuração da VPS), escala (seção 4), C05–C08.
