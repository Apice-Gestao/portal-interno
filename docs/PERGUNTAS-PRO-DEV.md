# Perguntas pro dev

Levantamento de 17/10/2026 (Claude Code), a pedido do usuário: todas as dúvidas em aberto do Portal Ápice num só lugar. Cada item diz o contexto, o que está em jogo e as opções. Atualizar este arquivo quando uma resposta chegar (registrar a decisão e a data no `docs/CONTEXTO.md`).

Legenda de prioridade: **A** bloqueia ou muda o próximo passo; **B** precisa de resposta antes do piloto/VPS; **C** pode esperar.

## 1. Arquitetura e VPS

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 1.1 | Quantas pessoas vão usar o portal **ao mesmo tempo** no pico? E no total? | Dimensiona a VPS e o pool de conexões. Hoje o limite técnico é 100 sessões por processo e as sessões ficam só em memória. | B |
| 1.2 | Quantas empresas por grupo (Contábil, Go, Condomínios) e quantas obrigações por empresa por mês? | Define o volume de tarefas por ano (ex.: 500 empresas × 8 modelos = 48 mil tarefas/ano) e quando a lentidão do “snapshot integral” aparece. | B |
| 1.3 | Por quanto tempo manter histórico de tarefas, auditoria e anexos? | Define backup, arquivamento e se os anexos podem continuar dentro do banco (bytea). | B |
| 1.4 | Volume esperado de anexos (quantos por mês, tamanho médio)? | Decide quando mover arquivos para armazenamento privado separado. | C |
| 1.5 | Qual VPS (provedor, CPU, memória, disco) e quem cuida de backup/restauração e monitoramento? | O parecer pede RPO/RTO definidos e backup fora da VPS. | B |
| 1.6 | Quando executar a primeira fatia do parecer do Codex (consultas de tarefas no banco com paginação real)? Recomendação do Claude: **antes do piloto com dados reais**, não durante a fase de demonstração. | Evita retrabalho enquanto as telas ainda mudam todo dia. | B |
| 1.7 | Os outros grupos (Go e Condomínios) terão login e dados próprios de verdade, ou continuam só como demonstração por enquanto? | Hoje a autenticação normal é só do Contábil; os outros usam fixtures locais. | B |

Referência: `docs/PARECER-ARQUITETURA-ESCALABILIDADE-2026-10-17.md` e avaliação do Claude no `CONTEXTO.md`.

## 2. Regras de negócio

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 2.1 | **Permissões por departamento (RN28):** a mesma pessoa pode ter acessos diferentes em cada setor (ex.: gerencia Fiscal, só consulta Pessoal)? | Hoje as permissões valem para todos os setores da conta. Mudar exige migração cuidadosa dos acessos atuais. | A para o desenho de acessos |
| 2.2 | Quem vai validar o **catálogo fiscal** (obrigações por regime, UF, ICMS/IPI, atividade, vigências)? Existe uma fonte oficial que o escritório já usa? | Regime sozinho não define obrigações; o sistema não deve inventar regra fiscal. | B |
| 2.3 | Além de mensal, quais **periodicidades** são necessárias (trimestral, anual, eventual)? Feriados e dias úteis entram no cálculo dos prazos? | Hoje só há rotina mensal com dias 1–28. | B |
| 2.4 | **Personalizar etapas por empresa** (pedido de 17/10): quando o modelo geral mudar (ex.: nova etapa no PGDAS-D), a versão personalizada da empresa deve receber a mudança automaticamente, avisar o gestor ou ficar congelada? | **Respondida em 17/10/2026: avisar o gestor** — a personalização continua valendo e um aviso indica que o modelo geral mudou, para o gestor decidir se incorpora. | ✔ |
| 2.5 | A personalização por empresa vale só para as **próximas** tarefas geradas, ou também para tarefas já abertas da competência atual? | Tarefas existentes hoje preservam a versão com que foram criadas. **Adotado por padrão (a confirmar): só as próximas tarefas geradas**, como já acontece com versões de modelo. | B |
| 2.6 | No **editor visual de fluxos**, quem pode editar: só quem tem “Criar e editar modelos”, ou também o líder do setor? | **Respondida em 17/10/2026:** usa a permissão existente de editar modelos (`templates.manage`), concedível a qualquer cargo. | ✔ |

## 3. Portal do Cliente

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 3.1 | Quando o cadastro do Portal do Cliente deixa de ser demonstração e passa a gravar no banco? | Hoje é só visual, com dados fictícios em memória. | B |
| 3.2 | Um usuário do cliente pode ver **várias empresas** (ex.: sócio de mais de uma)? | O desenho atual vincula uma empresa por usuário. | B |
| 3.3 | Como o cliente vai entrar: senha + código por e-mail (como o portal interno), link mágico ou outro? | Define a autenticação do portal externo. | B |
| 3.4 | Quais documentos o cliente vê: todos os aceitos da empresa, ou só os que o escritório marcar como “publicados”? | Evita expor documento interno por engano. | B |

## 4. Identidade e e-mail

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 4.1 | Qual provedor de e-mail envia códigos e recuperação de senha (Google Workspace, Microsoft 365, hospedagem)? Qual remetente? | O segundo fator por e-mail e a recuperação dependem disso; hoje não há SMTP real configurado. | B |
| 4.2 | Quando remover os **acessos temporários de teste** e a **simulação da TV**? (obrigatório antes da VPS) | Ver `docs/ACESSO-TEMPORARIO-TESTES.md` e `docs/TV-SIMULACAO-TEMPORARIA.md`. | B |

## 5. Visual e conteúdo

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 5.1 | Existem os **arquivos originais** das logos Ápice Go e Ápice Condomínios? | As atuais foram recriadas a partir da logo do Contábil; trocar pelas oficiais é só substituir os arquivos. | C |
| 5.2 | Quais cores ficam definitivas na tela de escolha do grupo (fundo e cartões)? | O botão de paleta nessa tela é temporário e deve sair depois da escolha. | C |
| 5.3 | Quais **textos redundantes** remover? Lista com 19 itens em `docs/TEXTOS-REDUNDANTES-2026-10-17.md`. | Nada foi removido sem decisão. | C |

## 6. Dados de demonstração

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 6.1 | Os dados fictícios das demonstrações vão só no grupo de testes do **Ápice Contábil** ou também nos de Go e Condomínios? | **Respondida em 17/10/2026: nos três grupos de teste** (Contábil, Go e Condomínios). | ✔ |
| 6.2 | Quanto volume de exemplo (ex.: 3 propostas por situação, alguns meses de documentos, 2 implantações em andamento)? | Muito dado deixa a demonstração confusa; pouco não mostra as funções. | C |

## 7. Publicação e GitHub

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 7.1 | O repositório `Apice-Gestao/portal-interno` no GitHub tem só a cópia sanitizada de 14/10. Deve receber as versões novas? Com que frequência e quem revisa? | Nada foi enviado depois de 14/10; não há sincronização automática. | C |
| 7.2 | A demonstração pública separada (adiada) volta a ser prioridade? | Está pausada desde 16/10. | C |

## 8. Técnico (para quem for continuar o código)

| # | Pergunta | Por que importa | Prioridade |
|---|----------|-----------------|------------|
| 8.1 | O relatório combinado faz uma consulta por relatório, e cada uma carrega o estado inteiro do grupo. Criar um endpoint único para vários relatórios agora ou na fatia de consultas do parecer? | Custo multiplica com o número de relatórios marcados. | C |
| 8.2 | O polling de 5 s do snapshot continua até a fatia de consultas, ou já trocar por invalidação mais fina? | Custo de leitura repetida em todas as telas. | C |
