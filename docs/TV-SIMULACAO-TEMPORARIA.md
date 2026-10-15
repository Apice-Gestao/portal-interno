# Simulação temporária do painel de TV — remover depois

Solicitada explicitamente pelo usuário em **14/10/2026**, para visualizar o painel como se estivesse em operação, com tarefas entrando, mudando de andamento e saindo das pendências ao serem concluídas. **É temporária e deve ser removida antes da VPS.**

## Como usar

Em **Painel de TV**, clique em **Simular operação** e depois em **Abrir painel**. A prévia dedicada preserva o modo. **Voltar → Usar dados reais** encerra a simulação. O endereço da prévia inclui apenas `simulacao=1`, sem credenciais. Não é uma rota pública nem substitui autenticação ou concessões.

O cabeçalho mostra **SIMULAÇÃO** e o rodapé informa **dados fictícios**. Há 12 colaboradores fictícios distribuídos em Fiscal/Contábil/Pessoal, 12 empresas com códigos SIM e 60 tarefas iniciais. Os nomes são exemplos locais, sem relação com os dados do CRM de referência. O escopo continua usando os departamentos e blocos autorizados da prévia; nomes de pessoas exigem a capacidade nominal correspondente.

A cada quatro segundos, ocorre um evento: conclusão de uma tarefa em conferência, entrada de uma nova tarefa, início de execução ou envio de uma tarefa em andamento para conferência. Os números e o quadro por pessoa são recalculados pelo domínio. Linhas recebem um destaque azul breve ao aparecer, respeitando a preferência de movimento reduzido. As listas alternam páginas a cada oito segundos. O cenário reinicia após 240 eventos para limitar memória; não há histórico persistente.

## Isolamento

- A simulação existe apenas no frontend das prévias humanas; não foi implementada no endpoint do dispositivo `/tv/watch`.
- Não envia comandos de tarefas, não cria contas/dispositivos nem grava no banco, localStorage ou sessão de usuário.
- A consulta autorizada da prévia continua funcionando; ela fornece apenas configuração/escopo para o cenário fictício. Ao voltar para os dados reais, o frontend mostra o feed normal.
- O controle está condicionado a `import.meta.env.DEV`: fica desabilitado no build de produção. Essa proteção não dispensa a remoção pedida pelo usuário.
- Prazos, exemplos e movimentos simulados não representam regras fiscais oficiais, evidências ou tarefas reais.

## Remoção obrigatória

1. Remover `apps/web/src/modules/tv/tv-simulation.ts`.
2. Em `TvPage.tsx` e `TvPreviewPage.tsx`, remover imports/hook, parâmetro `simulacao`, botão e navegação que preserva o modo; voltar a fornecer o feed da consulta ao quadro.
3. Em `TvBoard.tsx`, remover prop/atributo/legendas exclusivos da simulação.
4. Em `tv.css`, remover a animação `tv-simulation-entry` e seus seletores exclusivos. Preservar a paginação adaptável, os estilos brancos/azuis e os menus compartilhados.
5. Atualizar este registro, `AGENTS.md` e `docs/CONTEXTO.md`; verificar tipagem, lint, build e navegador. Remover também os atalhos de login de teste conforme documento próprio, em uma etapa separada.

Não excluir tarefas do banco para remover este recurso: nenhuma tarefa de simulação foi persistida.

## Verificação desta etapa

Navegador conferiu criação/conclusão fictícia, alternância de páginas, totais consistentes, nome ligado à tarefa e ausência de sobreposição em 1280×720, 1920×1080 e 390×844. Ao retornar aos dados reais, o feed manteve 47 tarefas/5 contas da base de testes. Lint e build/tipagem web passaram; controles temporários não apareceram no bundle de produção. Prévia deixada em simulação. Prova visual: `outputs/Painel-TV-Simulacao-2026-10-14.jpg`.
