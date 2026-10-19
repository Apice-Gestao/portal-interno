// TEMPORARY (17/10/2026): guided tour for the client demonstration published
// as an artifact. Remove with DemoTour.tsx, demo-tour.css and the <DemoTour />
// line in App.tsx — see docs/TUTORIAL-DEMO-TEMPORARIO.md.
// Generated from a script; selectors may use "css@Text" to match by text,
// and click may chain selectors with " && ".
export interface TourStep {
  /** Elements to highlight (first visible wins). Empty: a centered explanation. */
  target?: string;
  title: string;
  text: string;
  /** Selector clicked before the step is shown (opens or closes something). */
  click?: string;
  /** Target only exists after an earlier click; checked when the step is shown. */
  afterClick?: boolean;
  /** Last step of a module: explore it or move on. */
  final?: boolean;
}

export const TOUR_STEPS: Record<string, TourStep[]> = {
  "/visao-geral": [
    {
      title: "Bem-vindo ao Portal Ápice",
      text: "Este tutorial mostra cada módulo e demonstra os fluxos clicando nos botões por você. Ele aparece toda vez que você abre um módulo; use “Pular tutorial” para mexer à vontade ou “Desativar tutorial” para desligar até atualizar a página.",
    },
    {
      target: "aside.sidebar nav",
      title: "Menu dos módulos",
      text: "Cada item abre um módulo. O que cada pessoa vê depende do acesso dela: o operador vê as próprias tarefas, o coordenador vê a equipe e a diretoria vê tudo. Os itens podem ser arrastados para mudar a ordem.",
    },
    {
      target: ".topbar",
      title: "Barra do topo",
      text: "Escolha o departamento que está acompanhando, veja as notificações e acesse sua conta. A seta à direita recolhe a barra para ganhar espaço.",
    },
    {
      target: ".metric-grid",
      title: "Indicadores da competência",
      text: "Tarefas em aberto, concluídas, em conferência e com prazo legal vencido. Clique em um número para abrir a lista correspondente.",
    },
    {
      target: ".overview-grid > :first-child",
      title: "Entregas por obrigação",
      text: "Para cada obrigação (ISS, PGDAS-D, DCTFWeb…), quantas já foram entregues em relação ao total da competência.",
    },
    {
      target: ".deadline-surface",
      title: "Próximos prazos legais",
      text: "As entregas mais urgentes, com a data e a situação do prazo. Clique para abrir a tarefa direto.",
    },
    {
      target: ".dashboard-team",
      title: "Andamento da equipe",
      text: "Quanto cada colaborador concluiu e quanto ainda está aberto.",
    },
    {
      target: ".calendar-grid",
      title: "Calendário de vencimentos",
      text: "O tutorial abriu o calendário: cada dia mostra as metas internas e os prazos legais. Clique em um dia para ver as tarefas que vencem nele.",
      click: ".dashboard-view-switch button@Calendário",
      afterClick: true,
    },
    {
      target: ".calendar-controls",
      title: "Navegar entre meses",
      text: "Avance ou volte os meses e filtre o que aparece no calendário.",
      afterClick: true,
    },
    {
      target: ".metric-grid",
      title: "De volta ao resumo",
      text: "O botão Resumo volta para os indicadores da competência.",
      click: ".dashboard-view-switch button@Resumo",
      afterClick: true,
    },
  ],
  "/tarefas": [
    {
      title: "Como nasce uma tarefa",
      text: "Todo início de mês o portal gera sozinho a competência que fechou: para cada empresa ativa e cada obrigação do regime dela, cria a tarefa para o responsável do setor. Nada é duplicado. O gestor também pode gerar manualmente e criar tarefas avulsas.",
    },
    {
      title: "O caminho de uma tarefa",
      text: "A fazer → Em andamento → Em conferência → Concluída. O responsável marca as etapas e anexa a evidência (guia, recibo). Se a obrigação exige conferência, outra pessoa confere: aprova (Concluída) ou devolve com o motivo (Devolvida) para correção.",
    },
    {
      title: "Exceções registradas",
      text: "Aguardando cliente pausa a tarefa até o retorno do cliente. Dispensa é pedida quando a obrigação não se aplica no mês e depende de quem tem permissão. Reabrir e cancelar exigem justificativa. Tudo fica no histórico da tarefa.",
    },
    {
      target: ".page-heading .heading-actions",
      title: "Ações da lista",
      text: "Escolha a competência, crie uma tarefa avulsa, importe a lista ou transfira atividades entre pessoas.",
    },
    {
      target: ".filter-menu",
      title: "Filtro por situação",
      text: "Mostre só as tarefas a fazer, em andamento, em conferência, devolvidas ou concluídas. Os números mostram quantas há em cada uma.",
    },
    {
      target: ".tasks-surface .table-toolbar",
      title: "Busca e filtros",
      text: "Procure por empresa e filtre por obrigação, situação do prazo, regime e agrupador.",
    },
    {
      target: ".task-board",
      title: "Visão em quadro",
      text: "O tutorial trocou para o quadro: as tarefas ficam em colunas por etapa do fluxo, como um kanban.",
      click: ".task-presentation button@Quadro",
      afterClick: true,
    },
    {
      target: ".tasks-surface .table-wrap",
      title: "Visão em lista",
      text: "De volta à lista, com meta, prazo legal, situação e responsável de cada tarefa. Clique em qualquer linha para abrir.",
      click: ".task-presentation button@Lista",
      afterClick: true,
    },
    {
      target: ".drawer-content .drawer-topline",
      title: "Detalhe da tarefa",
      text: "O tutorial abriu uma tarefa como exemplo. No topo ficam a situação do prazo, a etapa do fluxo e o setor.",
      click: ".tasks-surface .row-action, .task-board-card",
      afterClick: true,
    },
    {
      target: ".drawer-content .deadline-cards",
      title: "Meta e prazo legal",
      text: "A meta interna é o prazo do escritório; o prazo legal é o do órgão. As cores mostram se está em dia ou atrasada.",
      afterClick: true,
    },
    {
      target: ".drawer-content .drawer-owner",
      title: "Responsável",
      text: "Quem executa a tarefa. Quem tem permissão pode transferi-la para outra pessoa do setor; a transferência fica no histórico.",
      afterClick: true,
    },
    {
      target: ".modal-content .transfer-options",
      title: "Transferir a tarefa",
      text: "O tutorial abriu a transferência: escolha a pessoa (com quantas tarefas abertas cada uma tem) e confirme. Aqui nada será transferido.",
      click: ".drawer-content .drawer-transfer",
      afterClick: true,
    },
    {
      target: ".drawer-content .drawer-tabs",
      title: "Abas do detalhe",
      text: "Execução (etapas e anexos), Documentos (arquivos e versões), Histórico (tudo o que aconteceu), Comentários e P.O.P. (o procedimento da obrigação).",
      click: ".modal-content [aria-label='Fechar janela']",
      afterClick: true,
    },
    {
      target: ".drawer-content .checklist",
      title: "Etapas da execução",
      text: "O responsável marca cada etapa ao concluir. As etapas vêm do modelo da obrigação (ou da versão própria da empresa).",
      afterClick: true,
    },
    {
      target: ".drawer-content .evidence-heading",
      title: "Evidência obrigatória",
      text: "O documento que comprova a entrega (guia, recibo, declaração). Dá para anexar vários arquivos; sem a evidência a tarefa não segue para conferência.",
      afterClick: true,
    },
    {
      target: ".drawer-content .timeline",
      title: "Histórico",
      text: "O tutorial abriu a aba Histórico: cada mudança de situação, responsável, anexo e comentário, com quem fez e quando.",
      click: ".drawer-content .drawer-tabs button@Histórico",
      afterClick: true,
    },
    {
      target:
        ".drawer-content .task-comments, .drawer-content .task-comment-form",
      title: "Comentários",
      text: "Conversa da equipe sobre a tarefa, registrada junto com ela.",
      click: ".drawer-content .drawer-tabs button@Comentários",
      afterClick: true,
    },
    {
      target: ".drawer-content .drawer-footer",
      title: "Andamento",
      text: "Iniciar a execução, enviar para conferência e, para quem confere, aprovar ou devolver com o motivo.",
      click: ".drawer-content .drawer-tabs button@Execução",
      afterClick: true,
    },
    {
      target: ".drawer-content [aria-label='Mais ações da tarefa']",
      title: "Mais ações",
      text: "Aguardando cliente, pedir ou registrar dispensa, reabrir, cancelar com justificativa e transferir. Cada ação depende das permissões da pessoa.",
      afterClick: true,
    },
    {
      title: "Prazos e cores",
      text: "Cinza: no prazo. Azul: vence hoje. Amarelo: meta interna vencida. Vermelho: prazo legal vencido. Verde: concluída.",
      click: ".drawer-content [aria-label='Fechar tarefa']",
    },
  ],
  "/empresas": [
    {
      title: "A carteira de clientes",
      text: "Aqui ficam todas as empresas do grupo, com o regime, a situação e quem é o responsável em cada setor. É desse cadastro que o portal tira quem recebe cada tarefa.",
    },
    {
      target: ".company-summary",
      title: "Empresas por situação",
      text: "Total da carteira e quantas estão ativas, suspensas ou inativas. Clique em uma situação para filtrar.",
    },
    {
      target: ".company-filters",
      title: "Busca e filtros",
      text: "Encontre pelo nome, código ou CNPJ e filtre por regime, responsável, agrupador e obrigação.",
    },
    {
      target: ".modal-content",
      title: "Ficha da empresa",
      text: "O tutorial abriu uma empresa clicando na linha: código, CNPJ, regime, situação e o responsável de cada setor. Daqui se edita o cadastro e se veem as tarefas dela.",
      click: ".company-table tbody tr",
      afterClick: true,
    },
    {
      target: ".modal-content .form-actions, .modal-content footer",
      title: "Editar e ver tarefas",
      text: "Editar abre o cadastro completo; Ver tarefas leva às tarefas desta empresa.",
      afterClick: true,
    },
    {
      target: ".modal-content .status-manager-list",
      title: "Situações do escritório",
      text: "Ativa gera tarefas; suspensa pausa as novas tarefas sem apagar nada; inativa encerra o atendimento. O gestor cria outras situações e escolhe o efeito de cada uma.",
      click:
        ".modal-content [aria-label='Fechar janela'] && .company-status-manage button",
      afterClick: true,
    },
    {
      target: ".company-selection",
      title: "Transferência em lote",
      text: "O tutorial marcou as empresas da lista: aparece a opção de transferir a responsabilidade de um setor para outra pessoa, com as tarefas abertas junto.",
      click:
        ".modal-content [aria-label='Fechar janela'] && .company-table thead input",
      afterClick: true,
    },
    {
      target: ".modal-content .company-editor-fieldset",
      title: "Cadastro completo",
      text: "O tutorial abriu “Nova empresa”: código (usado na busca e no controle), razão social, CNPJ, cidade, regime, situação e agrupadores. Nada é salvo durante o tutorial.",
      click:
        ".company-selection button@Limpar seleção && .page-heading .heading-actions .button-primary",
      afterClick: true,
    },
    {
      target: ".modal-content .company-sector-table",
      title: "Setores e responsáveis",
      text: "Marque os setores que têm obrigação com a empresa e escolha o responsável de cada um, ou deixe na fila do setor.",
      afterClick: true,
    },
    {
      target: ".modal-content .company-new-department",
      title: "Novo departamento",
      text: "Se faltar um setor, crie aqui mesmo; ele entra no cadastro de departamentos e já fica marcado nesta empresa.",
      afterClick: true,
    },
    {
      target: ".modal-content .onboarding-fields",
      title: "Implantação",
      text: "Escolha o fluxo de implantação entre setores e se as tarefas recorrentes esperam a implantação terminar.",
      afterClick: true,
    },
    {
      title: "Mudanças passam pelo gestor",
      text: "Mudar regime, responsáveis ou situação de uma empresa já cadastrada não é aplicado direto: vira uma proposta na Central do gestor, com a data de vigência e o impacto nas tarefas.",
      click: ".modal-content [aria-label='Fechar janela']",
    },
  ],
  "/processos": [
    {
      target: ".section-tabs",
      title: "Fluxos e processos",
      text: "Acompanhamento das implantações em andamento, o desenho dos fluxos entre setores e os modelos de tarefa.",
    },
    {
      title: "Como funciona uma implantação",
      text: "Ao cadastrar uma empresa nova, o gestor escolhe um fluxo (ex.: Contábil → Fiscal → Pessoal). Cada etapa vira uma tarefa para o responsável daquele setor; quando ela é concluída, a próxima etapa é liberada para o setor seguinte.",
    },
    {
      target: ".process-card",
      title: "Processo em andamento",
      text: "Cada cartão mostra a empresa, o fluxo, a etapa atual, o setor e o responsável.",
    },
    {
      target: ".process-card-steps",
      title: "Etapas do processo",
      text: "A sequência entre setores: concluídas, a atual e as próximas, que só são liberadas quando a anterior termina.",
    },
    {
      target: ".process-card a, .process-card button",
      title: "Abrir atividade",
      text: "Abre a tarefa da etapa atual, com etapas, anexos e histórico (como no módulo Tarefas).",
    },
    {
      target: ".page-heading .heading-actions",
      title: "Criar ou iniciar processo",
      text: "Leva à aba Fluxos entre setores, onde se monta um fluxo ou se inicia um processo para uma empresa. O próximo passo do tutorial mostra isso.",
    },
    {
      title: "Rotina depois da implantação",
      text: "No cadastro o gestor decide se as tarefas recorrentes do mês esperam a implantação terminar ou começam em paralelo.",
    },
  ],
  "/processos?fluxos": [
    {
      target: ".section-tabs",
      title: "Fluxos entre setores",
      text: "Aqui o gestor desenha a ordem das etapas entre os setores. Não existe uma ordem fixa: cada fluxo pode ter os setores e as etapas que o escritório precisar.",
    },
    {
      target: ".department-flow-card",
      title: "Um fluxo",
      text: "Nome, tipo (implantação ou processo) e a rota entre os setores.",
    },
    {
      target: ".department-flow-route",
      title: "Rota entre setores",
      text: "As etapas na ordem em que passam de um setor para o outro.",
    },
    {
      target: ".modal-content",
      title: "Ficha do fluxo",
      text: "O tutorial abriu um fluxo clicando no nome: as etapas, o setor e o prazo de cada uma e quem pode executar.",
      click: ".department-flow-card .department-flow-title",
      afterClick: true,
    },
    {
      target: ".modal-content",
      title: "Editar um fluxo",
      text: "O tutorial abriu o editor: para cada etapa, o setor, os passos de execução, a meta e o prazo em dias, se precisa de conferência e qual documento comprova. Nada é salvo durante o tutorial.",
      click: ".modal-content button@Editar fluxo",
      afterClick: true,
    },
    {
      target: ".modal-content",
      title: "Iniciar um processo",
      text: "O tutorial clicou em Iniciar: escolha a empresa, a competência, os responsáveis de cada etapa e se a rotina espera a implantação. Nada é salvo durante o tutorial.",
      click:
        ".modal-content [aria-label='Fechar janela'] && .department-flow-card button@Iniciar",
      afterClick: true,
    },
    {
      target: ".page-heading .heading-actions",
      title: "Novo fluxo",
      text: "Crie fluxos de implantação ou de processos (ex.: alteração contratual) com os setores que quiser.",
      click: ".modal-content [aria-label='Fechar janela']",
    },
  ],
  "/processos?modelos": [
    {
      title: "Modelos de tarefa",
      text: "Cada modelo é uma obrigação recorrente: setor, regime, meta interna, prazo legal, etapas, evidência exigida e se precisa de conferência.",
    },
    {
      target: ".model-grid",
      title: "Os modelos",
      text: "Um cartão por obrigação, com meta, prazo, número de etapas e quantas empresas têm etapas próprias.",
    },
    {
      target: ".modal-content .model-workflow-preview",
      title: "Etapas do modelo",
      text: "O tutorial abriu um modelo: as etapas que toda tarefa dessa obrigação terá, na ordem.",
      click: ".model-grid .model-card",
      afterClick: true,
    },
    {
      target: ".modal-content .company-workflows",
      title: "Etapas por empresa",
      text: "Uma empresa pode ter etapas próprias neste modelo. Se o modelo geral mudar, o gestor é avisado e decide se mantém a versão da empresa ou volta ao geral.",
      afterClick: true,
    },
    {
      target: ".page-heading .heading-actions",
      title: "Geração automática e manual",
      text: "O portal gera a competência sozinho todo início de mês. O botão Gerar competência continua disponível para gerar ou conferir quando o gestor quiser.",
      click: ".modal-content [aria-label='Fechar janela']",
    },
  ],
  "/gestor": [
    {
      target: ".section-tabs",
      title: "Central do gestor",
      text: "Duas abas: Equipe, com as tarefas de cada pessoa, e Alterações de empresas, onde o gestor aprova as mudanças que o portal indica (o gestor responsivo).",
    },
    {
      target: ".team-summary",
      title: "A operação do gestor",
      text: "Tarefas abertas, vencidas, em conferência e na fila do setor. O administrador vê todos os setores; cada gestor vê só os setores que coordena.",
    },
    {
      target: ".team-toolbar",
      title: "Busca e setor",
      text: "Procure uma pessoa ou mostre só um setor.",
    },
    {
      target: ".team-board",
      title: "Quadro por pessoa",
      text: "Uma coluna por colaborador, da tarefa mais urgente para a menos urgente. A fila do setor reúne as tarefas sem responsável.",
    },
    {
      target: ".drawer-content .drawer-owner",
      title: "Abrir e agir",
      text: "O tutorial abriu uma tarefa do quadro: daqui o gestor confere, transfere, reabre ou cancela sem sair da Central.",
      click: ".team-card",
      afterClick: true,
    },
    {
      title: "Equipe sob controle",
      text: "Feche o detalhe e o quadro continua no mesmo lugar, já atualizado.",
      click: ".drawer-content [aria-label='Fechar tarefa']",
    },
  ],
  "/gestor?alteracoes": [
    {
      target: ".change-summary",
      title: "Como funciona o gestor responsivo",
      text: "Quando alguém muda o regime, os responsáveis ou a situação de uma empresa, nada é aplicado na hora: o portal cria uma proposta e avisa o gestor aqui.",
    },
    {
      target: ".filter-menu",
      title: "Propostas por situação",
      text: "Aguardando decisão, aprovadas e rejeitadas. As pendentes são as que precisam da sua análise.",
    },
    {
      target: ".change-surface",
      title: "O que muda e a partir de quando",
      text: "Cada linha mostra a empresa, o que vai mudar (ex.: Simples Nacional → Lucro Presumido), a vigência e o impacto nas tarefas.",
    },
    {
      target: ".modal-content .change-detail",
      title: "Revisão da proposta",
      text: "O tutorial abriu uma proposta: motivo, competência de efeito e o que muda (regime, situação, responsáveis).",
      click: ".change-surface tbody tr",
      afterClick: true,
    },
    {
      target: ".modal-content .change-counts-large",
      title: "Impacto calculado pelo portal",
      text: "Quantas tarefas serão criadas, preservadas, revisadas e transferidas. Meses anteriores e entregas já feitas não mudam.",
      afterClick: true,
    },
    {
      target: ".modal-content .form-actions",
      title: "Aprovar ou rejeitar",
      text: "Aprovar aplica a mudança na vigência e ajusta as tarefas; rejeitar mantém tudo como está. Se o cadastro mudou depois da proposta, o portal pede uma nova.",
      afterClick: true,
    },
    {
      target: ".change-history",
      title: "Tudo fica registrado",
      text: "Quem propôs, quem decidiu e quando. As demais alterações do grupo (modelos, fluxos, usuários) também aparecem aqui.",
      click: ".modal-content [aria-label='Fechar janela']",
    },
  ],
  "/documentos": [
    {
      title: "De onde vêm os documentos",
      text: "Cada arquivo é anexado a uma tarefa como evidência (guia, recibo, declaração). Cada tipo de documento pertence a uma obrigação, e uma nova versão não apaga a anterior.",
    },
    {
      target: ".document-summary",
      title: "Documentos da competência",
      text: "Resumo dos arquivos anexados e da validação de cada um.",
    },
    {
      target: ".document-filters",
      title: "Filtros completos",
      text: "Filtre por setor, período, responsável, quem enviou, empresa, obrigação, tipo, formato e validação.",
    },
    {
      target: ".workspace-main .table-wrap",
      title: "Arquivos",
      text: "Cada documento com a tarefa, a empresa, o responsável, quem enviou e a validação.",
    },
    {
      target: ".modal-content .document-versions-list",
      title: "Versões do documento",
      text: "O tutorial abriu as versões de um arquivo: cada envio fica guardado, com data e autor; a mais recente é a que vale.",
      click: "[aria-label^='Ver versões']",
      afterClick: true,
    },
    {
      title: "Rumo ao Portal do Cliente",
      text: "Futuramente, os documentos aprovados ao fim do fluxo seguem identificados por tipo e obrigação para a base do cliente.",
      click: ".modal-content [aria-label='Fechar janela']",
    },
  ],
  "/relatorios": [
    {
      target: ".report-catalog",
      title: "1. Escolha o relatório",
      text: "Relatórios de tarefas e prazos, empresas, processos, documentos, gestão e acessos. Clique no nome para abrir um ou marque vários para combiná-los.",
    },
    {
      target: ".report-filters",
      title: "2. Ajuste o recorte",
      text: "O tutorial abriu “Pendências e atrasos”. Os filtros estão em três grupos: período, quem e o quê, e apresentação.",
      click: ".report-option-open@Pendências e atrasos",
      afterClick: true,
    },
    {
      target: ".report-filter-group@Apresentação",
      title: "Agrupar por",
      text: "O mesmo relatório pode mostrar uma linha por tarefa, por colaborador (desempenho de cada um) ou por empresa.",
      afterClick: true,
    },
    {
      target: ".report-sections",
      title: "3. Resultado",
      text: "O tutorial gerou o relatório: a tabela é uma prévia do que será baixado.",
      click: "button@Gerar relatório",
      afterClick: true,
    },
    {
      target: "button@Colunas",
      title: "Colunas",
      text: "Escolha quais colunas aparecem; a escolha vale para a tela e para o arquivo baixado.",
      afterClick: true,
    },
    {
      target: ".page-heading .heading-actions",
      title: "Baixar",
      text: "Baixe o relatório em PDF ou Excel, com o recorte e as colunas escolhidas.",
      afterClick: true,
    },
  ],
  "/painel-tv": [
    {
      target: ".tv-preview-card",
      title: "Painel da TV",
      text: "O que a TV da equipe mostra: indicadores, tarefas e colaboradores, atualizando sozinha e alternando as páginas.",
    },
    {
      target: ".tv-devices",
      title: "Dispositivos",
      text: "Cada TV cadastrada com seus setores, blocos e rodízio.",
    },
    {
      target: ".modal-content",
      title: "Novo dispositivo",
      text: "O tutorial abriu o cadastro: nome da TV, setores e competência. Depois se escolhem os blocos e conecta-se com um código de uso único. A TV não recebe dados sensíveis.",
      click: "button@Novo dispositivo",
      afterClick: true,
    },
    {
      title: "Abrir painel",
      text: "O botão Abrir painel mostra a tela cheia da TV para conferir como ela fica.",
      click: ".modal-content [aria-label='Fechar janela']",
    },
  ],
  "/configuracoes": [
    {
      target: ".settings-tabs",
      title: "Configurações",
      text: "Departamentos, equipe e acesso, auditoria, e ambiente e armazenamento.",
    },
    {
      target: ".workspace-main .surface",
      title: "Departamentos",
      text: "Crie e renomeie setores, cargos e lideranças, e organize a equipe de cada um.",
      click: ".settings-tabs button@Departamentos",
      afterClick: true,
    },
    {
      target: ".workspace-main .surface",
      title: "Equipe e acesso",
      text: "Quem está em cada setor e o que pode fazer.",
      click: ".settings-tabs button@Equipe e acesso",
      afterClick: true,
    },
    {
      target: ".workspace-main .surface",
      title: "Auditoria",
      text: "Registro de tudo o que aconteceu no portal, com quem e quando.",
      click: ".settings-tabs button@Auditoria",
      afterClick: true,
    },
    {
      target: ".workspace-main .surface",
      title: "Ambiente e armazenamento",
      text: "Informações do ambiente e do espaço usado pelos documentos.",
      click: ".settings-tabs button@Ambiente",
      afterClick: true,
    },
  ],
  "/usuarios": [
    {
      title: "Hierarquia de acesso",
      text: "Diretoria tem acesso a tudo. Coordenadores e gerentes veem a equipe dos seus setores. Operadores veem as próprias tarefas. O cargo identifica a pessoa; o que ela pode fazer é definido pelas permissões.",
    },
    {
      target: ".account-tabs",
      title: "Usuários e modelos de acesso",
      text: "Contas individuais e modelos de acesso prontos, para aplicar o mesmo conjunto de permissões a quem entra na equipe.",
    },
    {
      target: ".page-heading .heading-actions",
      title: "Cadastro de pessoas",
      text: "Crie, importe e exporte usuários e organize departamentos, cargos e lideranças.",
    },
    {
      target: ".modal-content .account-form",
      title: "Ficha da pessoa",
      text: "O tutorial abriu uma pessoa clicando na linha: nome, usuário, e-mail, cargo, gestor e setores. Nada é salvo durante o tutorial.",
      click: ".account-table tbody tr",
      afterClick: true,
    },
    {
      target: ".modal-content .account-permission-groups",
      title: "Permissões, ação por ação",
      text: "Ver, executar, conferir, dispensar, reabrir, cancelar, transferir, gerenciar empresas, relatórios e mais. O administrador pode conceder qualquer acesso a qualquer cargo.",
      afterClick: true,
    },
    {
      target: ".account-profile-grid, .workspace-main .surface",
      title: "Modelos de acesso",
      text: "O tutorial abriu os modelos de acesso: conjuntos de permissões prontos (operador, coordenador, gerente…) para aplicar de uma vez.",
      click:
        ".modal-content [aria-label='Fechar janela'] && .account-tabs button@Modelos de acesso",
      afterClick: true,
    },
    {
      target: ".account-tabs",
      title: "Voltar aos usuários",
      text: "A aba Usuários volta para a lista de contas.",
      click: ".account-tabs button@Usuários",
      afterClick: true,
    },
  ],
};

// Order the tour follows: finishing a module opens the next one.
export const TOUR_ORDER: { key: string; to: string; label: string }[] = [
  { key: "/visao-geral", to: "/visao-geral", label: "Visão geral" },
  { key: "/tarefas", to: "/tarefas", label: "Tarefas" },
  { key: "/empresas", to: "/empresas", label: "Empresas e carteira" },
  { key: "/processos", to: "/processos", label: "Fluxos e processos" },
  {
    key: "/processos?fluxos",
    to: "/processos?aba=fluxos",
    label: "Fluxos entre setores",
  },
  {
    key: "/processos?modelos",
    to: "/processos?aba=modelos",
    label: "Modelos de tarefa",
  },
  { key: "/gestor", to: "/gestor", label: "Central do gestor" },
  {
    key: "/gestor?alteracoes",
    to: "/gestor?aba=alteracoes",
    label: "Alterações de empresas",
  },
  { key: "/documentos", to: "/documentos", label: "Documentos" },
  { key: "/relatorios", to: "/relatorios", label: "Relatórios" },
  { key: "/painel-tv", to: "/painel-tv", label: "Painel de TV" },
  { key: "/configuracoes", to: "/configuracoes", label: "Configurações" },
  { key: "/usuarios", to: "/usuarios", label: "Usuários e permissões" },
];
