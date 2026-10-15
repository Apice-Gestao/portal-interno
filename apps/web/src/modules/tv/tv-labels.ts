import type { TvBlock } from "@apice/domain";

export const blockLabels: Record<TvBlock, string> = {
  progress: "Progresso da competência",
  deadlines: "Situação dos prazos",
  obligations: "Entregas por obrigação",
  deliveries: "Últimas entregas",
  upcoming: "Tarefas pendentes",
  collaborators: "Colaboradores",
};
