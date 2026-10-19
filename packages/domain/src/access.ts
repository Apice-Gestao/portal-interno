import type { Actor } from "./types.js";
export const PERMISSIONS = [
  "overview.view",
  "tasks.view",
  "tasks.team.view",
  "tasks.create",
  "tasks.execute",
  "tasks.attach",
  "tasks.download",
  "tasks.review",
  "tasks.manage",
  "tasks.export",
  "tasks.assign",
  "tasks.dispense",
  "tasks.reopen",
  "tasks.cancel",
  "tasks.comment",
  "companies.view",
  "companies.manage",
  "templates.view",
  "templates.manage",
  "documents.view",
  "documents.manage",
  "reports.view",
  "reports.performance.view",
  "processes.view",
  "processes.manage",
  "changes.manage",
  "settings.view",
  "users.manage",
  "tv.view",
  "tv.manage",
  "tv.configure",
  "tv.team.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const OPERATOR_PERMISSIONS: readonly Permission[] = [
  "tasks.view",
  "tasks.execute",
  "tasks.attach",
  "tasks.download",
  "tasks.comment",
];
export const PERMISSION_LABELS: Record<Permission, string> = {
  "overview.view": "Acessar visão geral",
  "tasks.view": "Acessar tarefas",
  "tasks.team.view": "Ver tarefas de toda a equipe",
  "tasks.create": "Criar tarefas",
  "tasks.execute": "Executar e marcar andamento",
  "tasks.attach": "Anexar evidências",
  "tasks.download": "Baixar evidências das tarefas",
  "tasks.review": "Conferir e devolver entregas",
  "tasks.manage": "Redistribuir, dispensar e reabrir",
  "tasks.export": "Exportar tarefas",
  "tasks.assign": "Redistribuir tarefas e carteiras",
  "tasks.dispense": "Aprovar dispensa de tarefas",
  "tasks.reopen": "Reabrir tarefas encerradas",
  "tasks.cancel": "Cancelar tarefas com histórico",
  "tasks.comment": "Comentar nas tarefas",
  "companies.view": "Acessar empresas e carteira",
  "companies.manage": "Cadastrar e importar empresas",
  "templates.view": "Acessar modelos",
  "templates.manage": "Criar e editar modelos, fluxos e gerar tarefas",
  "documents.view": "Acessar documentos",
  "documents.manage": "Configurar tipos e regras de documentos",
  "reports.view": "Acessar e exportar relatórios",
  "reports.performance.view": "Ver desempenho individual dos colaboradores",
  "processes.view": "Acessar fluxos e processos",
  "processes.manage": "Criar, editar e iniciar processos",
  "changes.manage": "Revisar e aprovar impactos nas empresas",
  "settings.view": "Acessar configurações",
  "users.manage": "Gerenciar usuários e permissões",
  "tv.view": "Acessar o painel de TV e suas prévias",
  "tv.manage": "Cadastrar, vincular e revogar dispositivos de TV",
  "tv.configure": "Configurar blocos, departamentos e nomes na TV",
  "tv.team.view": "Exibir colaboradores e andamento individual na TV",
};
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] =
  [
    { label: "Visão geral", permissions: ["overview.view"] },
    {
      label: "Tarefas",
      permissions: [
        "tasks.view",
        "tasks.team.view",
        "tasks.create",
        "tasks.execute",
        "tasks.attach",
        "tasks.download",
        "tasks.review",
        "tasks.manage",
        "tasks.export",
        "tasks.assign",
        "tasks.dispense",
        "tasks.reopen",
        "tasks.cancel",
        "tasks.comment",
      ],
    },
    {
      label: "Empresas e carteira",
      permissions: ["companies.view", "companies.manage"],
    },
    { label: "Modelos", permissions: ["templates.view", "templates.manage"] },
    {
      label: "Documentos",
      permissions: ["documents.view", "documents.manage"],
    },
    {
      label: "Relatórios",
      permissions: ["reports.view", "reports.performance.view"],
    },
    {
      label: "Fluxos e processos",
      permissions: ["processes.view", "processes.manage"],
    },
    { label: "Gestor de alterações", permissions: ["changes.manage"] },
    { label: "Configurações", permissions: ["settings.view"] },
    { label: "Administração", permissions: ["users.manage"] },
    {
      label: "Painel de TV",
      permissions: ["tv.view", "tv.manage", "tv.configure", "tv.team.view"],
    },
  ];
// The catalogue defines available capabilities. Assigned grants come from the database.
export function hasPermission(actor: Actor, permission: Permission): boolean {
  if (actor.permissions === undefined) return true; // Isolated legacy demo/test adapter only.
  if (
    ["tasks.assign", "tasks.dispense", "tasks.reopen", "tasks.cancel"].includes(
      permission,
    ) &&
    actor.permissions.includes("tasks.manage")
  )
    return true;
  return (
    actor.permissions.includes(permission) ||
    ([
      "tasks.assign",
      "tasks.dispense",
      "tasks.reopen",
      "tasks.cancel",
    ].includes(permission) &&
      actor.permissions.includes("tasks.manage"))
  );
}
export function canExecute(actor: Actor) {
  return actor.permissions === undefined
    ? actor.role !== "viewer"
    : hasPermission(actor, "tasks.execute");
}
