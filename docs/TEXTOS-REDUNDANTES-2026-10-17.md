# Textos possivelmente redundantes — levantamento de 17/10/2026

Levantamento feito pelo Claude Code durante o refino visual global, a pedido do usuário: **identificar** textos redundantes para uma remoção futura, **somente se o usuário decidir**. Nada desta lista foi removido. Ao remover, apagar só o texto/elemento indicado, sem alterar lógica, contadores ou permissões.

Prioridade sugerida: **A** = repete exatamente outra informação visível; **B** = explicação longa que poderia virar ajuda recolhida ou sair; **C** = discutível, depende de preferência.

| # | Tela | Texto | Por que parece redundante | Prioridade | Onde está |
|---|------|-------|---------------------------|------------|-----------|
| 1 | Barra superior (Empresas, Fluxos, Central, Configurações, Usuários) | Nome da página no topo (ex.: “Empresas e carteira”) | Repete o título grande logo abaixo | A | `app/App.tsx`, bloco `.breadcrumb` (quando não mostra o seletor de departamento) |
| 2 | Usuários e permissões | “5 usuários” abaixo da busca | Mesmo número já aparece na aba “Usuários 5” | A | `modules/users/UsersPage.tsx:758` |
| 3 | Tarefas da equipe | “45 tarefas” no resumo | Mesmo número do filtro “Todas as tarefas 45” | A | `modules/tasks/TasksPage.tsx` (bloco de resumo) |
| 4 | Empresas e carteira | “12 empresas na carteira” + “12 ativa” | Dois contadores mostrando o mesmo total quando todas estão ativas | C | `modules/companies/CompaniesPage.tsx:198` |
| 5 | Documentos | “16 evidências disponíveis” + “16 versões preservadas · Fiscal” | Dois números iguais na maior parte dos casos; departamento já está no seletor do topo | B | `modules/documents/DocumentsPage.tsx:131` |
| 6 | Documentos | Selo “Visibilidade interna” | Informação fixa, não muda nem orienta ação | C | `modules/documents/DocumentsPage.tsx:139` |
| 7 | Modelos de tarefa | “4 modelos · Fiscal” | Departamento já está no seletor do topo; a contagem é visível nos cartões | C | `modules/templates/TemplatesPage.tsx:206` |
| 8 | Modelos de tarefa | Selo “Ativo” em todos os cartões | Quando todos estão ativos, o selo não diferencia nada (manter só “Inativo”) | C | `modules/templates/TemplatesPage.tsx` (cartões) |
| 9 | Visão geral | “Olá, Helena. Acompanhe as entregas de Fiscal.” | O departamento já aparece no seletor do topo | C | `modules/overview/OverviewPage.tsx:282` |
| 10 | Visão geral | “0 dispensadas, contabilizadas separadamente” | Nota técnica exibida mesmo quando o número é zero | B | `modules/overview/OverviewPage.tsx:457` |
| 11 | Tarefas da equipe | “Clique na tarefa para executar ou acompanhar.” | Instrução óbvia pela interação | B | `modules/tasks/TasksPage.tsx:330` |
| 12 | Fluxos e processos | “Arraste uma atividade para iniciar, enviar à conferência ou concluir…” | Parágrafo longo permanente; caberia em ajuda recolhida | B | `modules/processes/ProcessesPage.tsx:147` |
| 13 | Central do gestor | Caixa “Regime, responsáveis e situação da empresa geram propostas…” | Explicação longa permanente | B | `modules/changes/ChangesPage.tsx:107` |
| 14 | Central do gestor | Descrição sob “Outras alterações do grupo” | Explicação longa permanente | B | `modules/changes/ChangesPage.tsx:200` |
| 15 | Painel de TV | “Todos os departamentos · Visão consolidada da equipe” | O painel abaixo já informa “Todos os departamentos” | A | `modules/tv/TvPage.tsx:231` |
| 16 | Relatórios | Nota “Só aparecem os relatórios liberados…” no catálogo | Repetida pela primeira nota de cada resultado (“Os dados respeitam o grupo…”) | B | `modules/reports/ReportCatalog.tsx:112` e `packages/domain/src/reports.ts` (notas) |
| 17 | Todas as páginas | Frase descritiva abaixo de cada título (ex.: “Cadastro integrado e responsabilidades de todos os setores.”) | Útil na primeira visita; repetitiva no uso diário | C | `PageHeading description` em cada módulo |
| 18 | Menu lateral | Rótulo “Portal interno” acima da logo | A logo e o menu já identificam o portal | C | `app/App.tsx:229` |
| 19 | Tela de escolha de grupo | “Acesso individual, conforme as permissões de cada grupo.” | Complementa a anotação de textos ilustrativos; discutível | C | `modules/auth/OrganizationSelection.tsx:96` |

Fora desta lista de propósito: “AMBIENTE DE TESTES” no menu (sinaliza o acesso temporário que deve sair antes da VPS) e a anotação “Todos os textos são meramente ilustrativos” (pedida pelo usuário).
