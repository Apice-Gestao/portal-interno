# Tutorial guiado da demonstração (TEMPORÁRIO)

Pedido do usuário em 17/10/2026: ao abrir cada módulo, um passo a passo com balões e setas explica cada parte e os fluxos (como a tarefa nasce e é conferida, implantação entre setores, gestor responsivo, documentos, hierarquia de acesso). Pode ser pulado e reaparece toda vez que o módulo é aberto de novo. É **somente para a demonstração ao cliente publicada como artefato** e será removido depois, exatamente com as peças abaixo.

## Quando aparece

- Prévia publicada (`npm run build:preview`, `VITE_DATA_MODE=demo`): sempre.
- Portal local em desenvolvimento: só se o navegador tiver `localStorage["apice.demo-tour"] = "on"` (para conferir). Nunca no build de produção normal.

## Peças (remover todas)

1. `apps/web/src/shared/ui/DemoTour.tsx` — balão, seta, destaque, Pular/Voltar/Próximo, teclado (Esc, setas).
2. `apps/web/src/shared/ui/demo-tour-steps.ts` — 102 passos em 13 telas (gerado por script), com a ordem dos módulos (`TOUR_ORDER`) (Visão geral, Tarefas, Empresas, Fluxos e processos e suas abas, Central do gestor e Alterações, Documentos, Relatórios, Painel de TV, Configurações, Usuários).
3. `apps/web/src/shared/ui/demo-tour.css`.
4. `apps/web/src/app/App.tsx`: a linha `<DemoTour />` (com o comentário acima dela) e o `import { DemoTour }`.
5. `apps/web/src/modules/tasks/TaskDrawer.tsx` e `apps/web/src/shared/ui/components.tsx` (`Modal`): o `onInteractOutside` marcado “TEMPORARY demo tour”, que impede o detalhe da tarefa e as janelas de fecharem ao clicar no balão.
6. Este documento e a menção no `docs/CONTEXTO.md`.

Nenhuma regra, dado ou permissão depende do tutorial; remover essas peças não muda o portal.

## Manutenção

Se uma tela mudar de estrutura, ajustar o seletor (`target`) do passo correspondente. Passos cujo alvo não existir na tela são pulados automaticamente; passos sem `target` são explicações centralizadas.

Passos com `click` abrem ou fecham algo antes de aparecer (o tutorial de Tarefas abre a primeira tarefa e explica o detalhe; o de Empresas abre “Nova empresa” e fecha sem salvar). Passos com `afterClick` só são conferidos depois do clique. Ao terminar um módulo, o tutorial abre o próximo da `TOUR_ORDER`.

Ao fim de cada módulo há o passo “Experimente à vontade” com “Explorar este módulo” (fecha e deixa usar) ou “Ir para <próximo>”; o próximo é sempre um módulo que a pessoa vê no menu (o operador vê menos). “Desativar tutorial” desliga até a página ser atualizada. Seletores aceitam `css@Texto` (achar pelo texto) e `click` aceita `a && b` (cliques em sequência).

## Prévia: persistência e login de demonstração (também temporários)

- `apps/web/src/services/portal-client.ts`: dados da demonstração salvos no navegador (`apice.demo.state.v1`), sessão (`apice.demo.session.v1`), `restoreSession`, `resetDemo`, login de demonstração (admin/admin → administrador; operador/operador → operador).
- `apps/web/src/app/Router.tsx`: na prévia a navegação fica em memória (o visualizador de artefatos recarrega com endereços `#/rota?param=`) e a tela atual é lembrada (`apice.demo.route.v1`); fora da prévia continua o `HashRouter`.
- `apps/web/src/app/OrganizationProvider.tsx`: lembra o grupo escolhido só na prévia (`apice.demo.group.v1`).
- `apps/web/src/modules/auth/LoginPage.tsx`: aviso das credenciais e “Recomeçar a demonstração do zero”.
- (18/10/2026, Claude Code) `portal-client.ts`: arquivos anexados na prévia guardados no IndexedDB (`apice-demo-files`) para voltarem após recarregar; estado salvo só é usado se tiver a estrutura esperada e o motor conseguir abri-lo (senão volta aos dados fictícios); `createUser`/`importUsers` de demonstração (contas fictícias, sem guardar senha) e `demoAccount`.
- (18/10/2026) `apps/web/src/main.tsx`: botão “Recomeçar a demonstração do zero” na tela de erro, só na prévia.
- (18/10/2026) `apps/web/src/shared/downloads.ts` (`framedPreview`, evento `apice:preview-blocked`) e `apps/web/src/shared/ui/PreviewBlockedNotice.tsx` (+ `.preview-blocked` em `demo-tour.css`, montado em `App.tsx`): o artefato publicado bloqueia downloads e a janela de impressão; os botões Baixar PDF/Excel, Exportar e baixar anexo mostram um aviso em vez de não fazer nada. Ao remover, `downloadBlob`/`downloadText`/`printPage` ficam só com o caminho normal.
- (18/10/2026) `apps/web/src/modules/users/UsersPage.tsx`: `fictitious` também considera a prévia (e-mail opcional ao editar conta fictícia).
Remover junto com a prévia quando a demonstração deixar de existir.
