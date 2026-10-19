import type { PortalEngine } from "./engine.js";
import type {
  Actor,
  CompanyOperationalPatch,
  CreateDepartmentFlow,
} from "./types.js";

// TEMPORARY (17/10/2026): fictitious demonstration records shared by the local
// test groups (scripts/prepare-demo-data.mjs) and the hosted preview, so every
// screen has something to show. Each block only runs while its area is empty,
// so applying it again never duplicates or overwrites data. Remove before the VPS.
interface DemoProposal {
  companyId: string;
  patch: CompanyOperationalPatch;
  effectiveCompetence: string;
  reason: string;
  transferOpenTasks?: boolean;
  decision?: "approve" | "reject";
}

const PREFIX = "Demonstração ·";

const onboardingFlow: CreateDepartmentFlow = {
  kind: "onboarding",
  title: "Implantação de nova empresa",
  description: `${PREFIX} entrada da empresa, parametrização por setor e liberação das rotinas.`,
  stages: [
    {
      id: "contabil-cadastro",
      title: "Cadastro contábil e plano de contas",
      department: "Contábil",
      workflowSteps: [
        { id: "plano", title: "Importar plano de contas" },
        { id: "saldos", title: "Conferir saldos de abertura" },
      ],
      internalDays: 3,
      legalDays: 5,
      requiresReview: false,
      requiredDocument: "Balancete de abertura",
    },
    {
      id: "fiscal-parametros",
      title: "Parâmetros fiscais e obrigações",
      department: "Fiscal",
      workflowSteps: [
        { id: "regime", title: "Confirmar regime e atividades" },
        { id: "obrigacoes", title: "Vincular obrigações mensais" },
      ],
      internalDays: 4,
      legalDays: 7,
      requiresReview: true,
      requiredDocument: "Checklist fiscal",
    },
    {
      id: "pessoal-folha",
      title: "Folha e eSocial",
      department: "Pessoal",
      workflowSteps: [
        { id: "funcionarios", title: "Cadastrar funcionários" },
        { id: "esocial", title: "Conferir eventos iniciais do eSocial" },
      ],
      internalDays: 5,
      legalDays: 10,
      requiresReview: false,
      requiredDocument: "",
    },
  ],
};
const processFlow: CreateDepartmentFlow = {
  kind: "process",
  title: "Alteração contratual",
  description: `${PREFIX} mudança de sócios, endereço ou atividade com reflexo nos setores.`,
  stages: [
    {
      id: "contabil-alteracao",
      title: "Registrar alteração no contrato",
      department: "Contábil",
      workflowSteps: [
        { id: "minuta", title: "Preparar minuta" },
        { id: "registro", title: "Protocolar na junta" },
      ],
      internalDays: 5,
      legalDays: 15,
      requiresReview: true,
      requiredDocument: "Contrato alterado",
    },
    {
      id: "fiscal-cadastros",
      title: "Atualizar cadastros fiscais",
      department: "Fiscal",
      workflowSteps: [
        { id: "cnpj", title: "Atualizar cadastro do CNPJ" },
        {
          id: "inscricoes",
          title: "Atualizar inscrições estadual e municipal",
        },
      ],
      internalDays: 3,
      legalDays: 10,
      requiresReview: false,
      requiredDocument: "Comprovante de atualização",
    },
  ],
};

const proposals: DemoProposal[] = [
  {
    companyId: "company-2",
    patch: { regime: "Lucro Presumido" },
    effectiveCompetence: "2026-11",
    reason: `${PREFIX} faturamento ultrapassou o limite do Simples Nacional`,
  },
  {
    companyId: "company-5",
    patch: {
      responsibilities: { Fiscal: { mode: "person", userId: "marina" } },
    },
    effectiveCompetence: "2026-10",
    reason: `${PREFIX} redistribuição da carteira fiscal`,
    transferOpenTasks: true,
  },
  {
    companyId: "company-11",
    patch: { status: "closing", serviceEndCompetence: "2026-12" },
    effectiveCompetence: "2026-11",
    reason: `${PREFIX} cliente comunicou encerramento do contrato`,
  },
  {
    companyId: "company-8",
    patch: {
      responsibilities: { Fiscal: { mode: "person", userId: "julia" } },
    },
    effectiveCompetence: "2026-10",
    reason: `${PREFIX} Júlia assume a empresa após treinamento`,
    decision: "approve",
  },
  {
    companyId: "company-10",
    patch: { responsibilities: { Fiscal: { mode: "department" } } },
    effectiveCompetence: "2026-10",
    reason: `${PREFIX} empresa volta para a fila do setor`,
    decision: "approve",
  },
  {
    companyId: "company-12",
    patch: { regime: "Lucro Presumido" },
    effectiveCompetence: "2026-11",
    reason: `${PREFIX} mudança de regime solicitada sem documentação`,
    decision: "reject",
  },
];

const comments = [
  "Cliente enviou os extratos hoje; sigo com a apuração.",
  "Aguardando retorno do cliente sobre as notas de entrada.",
  "Conferi os valores com o mês anterior, sem divergências.",
  "Guia gerada; falta anexar o comprovante de envio.",
];

/** Applies the showcase with an administrator actor; returns what was added. */
export function applyDemoShowcase(engine: PortalEngine, resolved: Actor) {
  const done: string[] = [];
  const attempt = (operation: () => void) => {
    try {
      operation();
    } catch (error) {
      done.push(
        `não aplicado: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  attempt(() => {
    const state = engine.snapshot(resolved);
    if ((state.changeProposals ?? []).length) return;
    let created = 0;
    for (const item of proposals) {
      const company = state.companies.find((c) => c.id === item.companyId);
      if (!company) continue;
      const [proposal] = engine.proposeCompanyChanges(resolved, [
        {
          companyId: company.id,
          expectedRevision: company.revision ?? 1,
          patch: item.patch,
          effectiveCompetence: item.effectiveCompetence,
          reason: item.reason,
          ...(item.transferOpenTasks ? { transferOpenTasks: true } : {}),
        },
      ]);
      if (item.decision && proposal)
        engine.decideChangeProposal(resolved, proposal.id, {
          expectedRevision: proposal.revision,
          decision: item.decision,
        });
      created++;
    }
    return void done.push(`Central do gestor — ${`${created} propostas`}`);
  });
  attempt(() => {
    const state = engine.snapshot(resolved);
    if ((state.departmentFlows ?? []).length) return;
    const onboarding = engine.createDepartmentFlow(resolved, onboardingFlow);
    const process = engine.createDepartmentFlow(resolved, processFlow);
    engine.startCompanyOnboarding(resolved, {
      companyId: "company-6",
      flowId: onboarding.id,
      expectedFlowVersion: onboarding.version,
      competence: "2026-10",
      blockRecurring: false,
      assignments: {
        "contabil-cadastro": "helena",
        "fiscal-parametros": "marina",
        "pessoal-folha": "helena",
      },
    });
    engine.startCompanyOnboarding(resolved, {
      companyId: "company-3",
      flowId: process.id,
      expectedFlowVersion: process.version,
      competence: "2026-10",
      blockRecurring: false,
      assignments: {
        "contabil-alteracao": "helena",
        "fiscal-cadastros": "julia",
      },
    });
    return void done.push(
      `Fluxos e implantações — ${"2 fluxos e 2 em andamento"}`,
    );
  });
  attempt(() => {
    const state = engine.snapshot(resolved);
    if (state.tasks.some((task) => (task.comments ?? []).length)) return;
    const open = state.tasks
      .filter((task) =>
        ["in_progress", "waiting", "in_review"].includes(task.status),
      )
      .slice(0, comments.length);
    open.forEach((task, index) =>
      engine.addTaskComment(resolved, task.id, {
        expectedRevision: task.revision,
        text: comments[index] ?? "Acompanhando.",
      }),
    );
    return void done.push(`Comentários — ${`${open.length} comentários`}`);
  });
  attempt(() => {
    const state = engine.snapshot(resolved);
    if (state.companies.some((c) => c.workflowOverrides)) return;
    const company = state.companies.find((c) => c.id === "company-1");
    const template = state.templates.find((item) => item.id === "dctf");
    if (!company || !template) return;
    engine.setCompanyWorkflow(resolved, {
      companyId: company.id,
      templateId: "dctf",
      action: "save",
      expectedRevision: company.revision ?? 1,
      expectedTemplateVersion: template.version,
      workflowSteps: [
        {
          id: "extratos",
          title: "Solicitar extratos ao financeiro do cliente",
        },
        { id: "apurar", title: "Apurar débitos e créditos" },
        { id: "conferir", title: "Conferir com a contabilidade" },
        { id: "transmitir", title: "Transmitir e anexar o recibo" },
      ],
    });
    return void done.push(`Etapas por empresa — ${"1 empresa personalizada"}`);
  });
  return done;
}
