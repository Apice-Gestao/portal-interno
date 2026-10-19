import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoveDownIcon,
  ForwardIcon,
  MoveUpIcon,
  CheckIcon,
  DepartmentFlowIcon,
  EditIcon,
  StartIcon,
  AddIcon,
  DeleteIcon,
} from "../../shared/icons";
import {
  canExecute,
  createDepartmentFlowSchema,
  hasPermission,
  startCompanyOnboardingSchema,
  updateCompanyOnboardingSchema,
  updateDepartmentFlowSchema,
} from "@apice/domain";
import type {
  CompanyOnboarding,
  Department,
  DepartmentFlow,
  DepartmentFlowStage,
} from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  Busy,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
import { CompetencePicker } from "../../shared/ui/CompetencePicker";
import { SelectField } from "../../shared/ui/SelectField";
import { WorkflowEditor } from "./WorkflowEditor";
import "./department-flows.css";

export interface OnboardingDraft {
  flowId: string;
  competence: string;
  blockRecurring: boolean;
  assignments: Record<string, string>;
}

/** Used both on company registration and when starting an existing company. */
export function OnboardingFields({
  value,
  onChange,
  disabled = false,
  optional = false,
}: {
  value: OnboardingDraft;
  onChange: (value: OnboardingDraft) => void;
  disabled?: boolean;
  optional?: boolean;
}) {
  const { data, actor } = usePortal();
  const fieldId = useId();
  const flows = data.departmentFlows.filter(
    (flow) =>
      flow.active &&
      (!optional || flow.kind !== "process") &&
      flow.stages.every((stage) =>
        actor.departments.includes(stage.department),
      ),
  );
  const selected = flows.find((flow) => flow.id === value.flowId);
  return (
    <section
      className="onboarding-fields full"
      aria-labelledby={`${fieldId}-title`}
    >
      <div className="section-heading">
        <h3 id={`${fieldId}-title`}>Implantação da empresa</h3>
      </div>
      <label>
        Fluxo entre departamentos
        <SelectField
          value={value.flowId}
          onValueChange={(flowId) =>
            onChange({ ...value, flowId, assignments: {} })
          }
          disabled={disabled}
          required={!optional}
          aria-label="Fluxo de implantação"
        >
          <option value="">
            {optional ? "Sem implantação neste cadastro" : "Selecione um fluxo"}
          </option>
          {flows.map((flow) => (
            <option key={flow.id} value={flow.id}>
              {flow.title} · v{flow.version}
            </option>
          ))}
        </SelectField>
      </label>
      {!flows.length && (
        <p className="muted-note">
          Cadastre um fluxo em Modelos → Fluxos entre departamentos. Ele precisa
          abranger somente departamentos aos quais você tem acesso.
        </p>
      )}
      {selected && (
        <>
          <p className="muted-note">
            O primeiro setor recebe a tarefa agora. Os próximos recebem suas
            tarefas conforme o setor anterior conclui a entrega e a conferência
            exigida.
          </p>
          <div className="onboarding-competence">
            <span>Competência da implantação</span>
            <CompetencePicker
              value={value.competence}
              onValueChange={(competence) => onChange({ ...value, competence })}
            />
          </div>
          <fieldset className="onboarding-policy" disabled={disabled}>
            <legend>Quando as tarefas recorrentes podem começar?</legend>
            <label className={value.blockRecurring ? "selected" : ""}>
              <input
                type="radio"
                name={`${fieldId}-recurring`}
                checked={value.blockRecurring}
                onChange={() => onChange({ ...value, blockRecurring: true })}
              />
              <span>
                <strong>Aguardar a implantação</strong>
                <small>
                  Novas rotinas só podem ser geradas depois de todos os setores
                  concluírem.
                </small>
              </span>
            </label>
            <label className={!value.blockRecurring ? "selected" : ""}>
              <input
                type="radio"
                name={`${fieldId}-recurring`}
                checked={!value.blockRecurring}
                onChange={() => onChange({ ...value, blockRecurring: false })}
              />
              <span>
                <strong>Trabalhar em paralelo</strong>
                <small>
                  Permite gerar rotinas enquanto os setores fazem a
                  parametrização.
                </small>
              </span>
            </label>
          </fieldset>
          <ol className="onboarding-assignment-list">
            {selected.stages.map((stage, index) => (
              <li key={stage.id}>
                <span className="flow-stage-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{stage.title}</strong>
                  <small>{stage.department}</small>
                </div>
                <SelectField
                  label={`Responsável por ${stage.title}`}
                  value={value.assignments[stage.id] ?? ""}
                  disabled={disabled}
                  required
                  onValueChange={(assigneeId) =>
                    onChange({
                      ...value,
                      assignments: {
                        ...value.assignments,
                        [stage.id]: assigneeId,
                      },
                    })
                  }
                >
                  <option value="">Selecione o responsável</option>
                  {data.users
                    .filter(
                      (user) =>
                        user.active !== false &&
                        hasPermission(user, "tasks.view") &&
                        canExecute(user) &&
                        user.departments.includes(stage.department),
                    )
                    .map((user) => (
                      <option key={user.userId} value={user.userId}>
                        {user.name}
                      </option>
                    ))}
                </SelectField>
              </li>
            ))}
          </ol>
          <p className="muted-note">
            O fluxo e os responsáveis são copiados para esta implantação. Editar
            o modelo depois preserva o andamento das empresas já iniciadas.
          </p>
        </>
      )}
    </section>
  );
}

export function DepartmentFlowsPage({
  initialCompanyId,
}: {
  initialCompanyId?: string;
}) {
  const { data, actor } = usePortal();
  const [editor, setEditor] = useState<{ flow?: DepartmentFlow }>();
  const [starting, setStarting] = useState<
    { flowId?: string; companyId?: string } | undefined
  >(initialCompanyId ? { companyId: initialCompanyId } : undefined);
  const [selected, setSelected] = useState<DepartmentFlow>();
  const canManage =
    hasPermission(actor, "templates.manage") ||
    hasPermission(actor, "processes.manage");
  const canRequestStart =
    hasPermission(actor, "companies.manage") ||
    hasPermission(actor, "processes.manage");
  const canStart = canRequestStart && hasPermission(actor, "companies.view");
  const flows = data.departmentFlows;
  const runs = [...data.companyOnboardings].sort(
    (left, right) =>
      Number(left.status === "completed") -
        Number(right.status === "completed") ||
      right.startedAt.localeCompare(left.startedAt),
  );
  return (
    <>
      <PageHeading
        title="Fluxos entre departamentos"
        description="Organize a entrada da empresa e a parametrização de cada setor."
      >
        {canStart && (
          <button
            className="button button-white"
            onClick={() => setStarting({})}
            disabled={!flows.some((flow) => flow.active)}
          >
            <StartIcon size={16} />
            Iniciar processo
          </button>
        )}
        {canManage && (
          <button
            className="button button-primary"
            onClick={() => setEditor({})}
          >
            <AddIcon size={17} />
            Novo fluxo
          </button>
        )}
      </PageHeading>
      <div className="department-flow-intro">
        <DepartmentFlowIcon size={22} />
        <p>
          O gestor define os setores, a sequência e o que deve ser feito. Ao
          cadastrar a empresa, escolhe se a rotina aguarda a implantação ou
          começa em paralelo.
        </p>
      </div>
      {canRequestStart && !canStart && (
        <p className="muted-note">
          Para escolher a empresa e iniciar um processo, seu acesso também
          precisa incluir Empresas e carteira. Os modelos continuam disponíveis
          para gestão.
        </p>
      )}
      <div className="section-heading">
        <h2>Modelos de fluxos e processos</h2>
        <span>
          {flows.length} {flows.length === 1 ? "fluxo" : "fluxos"}
        </span>
      </div>
      <div className="department-flow-grid">
        {flows.map((flow) => (
          <article key={flow.id} className="department-flow-card">
            <header>
              <span className="model-icon">
                <DepartmentFlowIcon size={20} />
              </span>
              <span
                className={`badge ${flow.active ? "status-done" : "status-waiting"}`}
              >
                {flow.active ? "Ativo" : "Inativo"}
              </span>
            </header>
            <button
              type="button"
              className="department-flow-title"
              onClick={() => setSelected(flow)}
            >
              <h3>{flow.title}</h3>
            </button>
            {flow.description && <p>{flow.description}</p>}
            <ol className="department-flow-route">
              {flow.stages.map((stage, index) => (
                <li key={stage.id}>
                  <span>{index + 1}</span>
                  {stage.department}
                  {index < flow.stages.length - 1 && (
                    <ForwardIcon size={13} aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
            <footer>
              <span>
                {flow.stages.length} setores · v{flow.version}
              </span>
              <div>
                {canManage && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Editar ${flow.title}`}
                    onClick={() => setEditor({ flow })}
                  >
                    <EditIcon size={14} />
                    Editar
                  </button>
                )}
                {canStart && flow.active && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Iniciar ${flow.title}`}
                    onClick={() => setStarting({ flowId: flow.id })}
                  >
                    <StartIcon size={14} />
                    Iniciar
                  </button>
                )}
              </div>
            </footer>
          </article>
        ))}
      </div>
      {!flows.length && (
        <EmptyState
          title="Nenhum fluxo entre departamentos"
          text="Crie um modelo com os setores e as etapas da implantação."
          action={
            canManage ? (
              <button
                className="button button-primary"
                onClick={() => setEditor({})}
              >
                <AddIcon size={16} />
                Criar primeiro fluxo
              </button>
            ) : undefined
          }
        />
      )}
      <section className="onboarding-progress-section">
        <div className="section-heading">
          <h2>Implantações das empresas</h2>
          <span>
            {runs.filter((run) => run.status === "active").length} em andamento
          </span>
        </div>
        {runs.length ? (
          <div className="onboarding-run-list">
            {runs.map((run) => (
              <OnboardingProgress key={run.id} run={run} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma implantação iniciada"
            text="Vincule um fluxo ao cadastrar uma empresa ou inicie para uma empresa existente."
          />
        )}
      </section>
      {editor && canManage && (
        <DepartmentFlowEditor
          key={editor.flow?.id ?? "new"}
          flow={editor.flow}
          onClose={() => setEditor(undefined)}
        />
      )}
      {starting && canStart && (
        <StartOnboarding
          key={`${starting.companyId ?? "any"}-${starting.flowId ?? "any"}`}
          initialCompanyId={starting.companyId}
          initialFlowId={starting.flowId}
          onClose={() => setStarting(undefined)}
        />
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        title={selected?.title ?? "Fluxo de implantação"}
        description="Os setores são executados nesta ordem."
      >
        {selected && (
          <>
            <ol className="flow-preview-list">
              {selected.stages.map((stage, index) => (
                <li key={stage.id}>
                  <span className="flow-stage-number">{index + 1}</span>
                  <div>
                    <strong>{stage.title}</strong>
                    <p>
                      {stage.department} · {stage.workflowSteps.length} etapas ·{" "}
                      {stage.requiresReview
                        ? "Com conferência"
                        : "Execução direta"}
                    </p>
                    <ul>
                      {stage.workflowSteps.map((step) => (
                        <li key={step.id}>{step.title}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
            <footer className="form-actions">
              <button
                className="button button-white"
                onClick={() => setSelected(undefined)}
              >
                Fechar
              </button>
              {canManage && (
                <button
                  className="button button-primary"
                  onClick={() => {
                    setSelected(undefined);
                    setEditor({ flow: selected });
                  }}
                >
                  <EditIcon size={15} />
                  Editar fluxo
                </button>
              )}
            </footer>
          </>
        )}
      </Modal>
    </>
  );
}

function OnboardingProgress({ run }: { run: CompanyOnboarding }) {
  const { data, actor, setDepartment, setCompetence } = usePortal();
  const navigate = useNavigate();
  const [editingAssignments, setEditingAssignments] = useState(false);
  const company = data.companies.find((item) => item.id === run.companyId);
  const done = run.stages.filter((stage) => stage.status === "done").length;
  function openTask(stage: CompanyOnboarding["stages"][number]) {
    if (!stage.taskId) return;
    setDepartment(stage.department);
    setCompetence(run.competence);
    navigate(`/tarefas?task=${encodeURIComponent(stage.taskId)}`);
  }
  return (
    <article className="onboarding-run">
      <header>
        <div>
          <h3>{company?.name ?? "Empresa da carteira"}</h3>
          <p>
            {run.flowTitle} · v{run.flowVersion} ·{" "}
            {run.competence.split("-").reverse().join("/")}
          </p>
        </div>
        <span
          className={`badge ${run.status === "completed" ? "status-done" : "status-progress"}`}
        >
          {run.status === "completed"
            ? "Implantação concluída"
            : "Em implantação"}
        </span>
      </header>
      <div className="onboarding-run-meta">
        <span>
          {done} de {run.stages.length} setores concluídos
        </span>
        <span>
          {run.status === "completed"
            ? "Rotinas liberadas para geração"
            : run.blockRecurring
              ? "Rotinas aguardam a implantação"
              : "Rotinas permitidas em paralelo"}
        </span>
      </div>
      <ol className="onboarding-run-stages">
        {run.stages.map((stage, index) => {
          const task = data.tasks.find((item) => item.id === stage.taskId);
          const completed = stage.status === "done";
          const current = stage.status === "active";
          const assignee = data.users.find(
            (item) => item.userId === stage.assigneeId,
          );
          return (
            <li
              className={completed ? "completed" : current ? "current" : ""}
              key={stage.id}
            >
              <span className="flow-stage-number">
                {completed ? <CheckIcon size={15} /> : index + 1}
              </span>
              <div>
                <strong>{stage.title}</strong>
                <span>
                  {stage.department} ·{" "}
                  {assignee?.name ?? "Responsável do setor"}
                </span>
                <small>
                  {completed
                    ? "Concluído"
                    : current
                      ? task?.status === "in_review"
                        ? "Em conferência"
                        : "Tarefa disponível"
                      : "Aguarda o setor anterior"}
                </small>
              </div>
              {stage.taskId && hasPermission(actor, "tasks.view") && task && (
                <button className="text-button" onClick={() => openTask(stage)}>
                  Ver tarefa
                  <ForwardIcon size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {run.status === "active" &&
        run.stages.some((stage) => stage.status === "blocked") &&
        hasPermission(actor, "companies.manage") && (
          <div className="onboarding-run-actions">
            <button
              className="text-button"
              onClick={() => setEditingAssignments(true)}
            >
              <EditIcon size={14} />
              Alterar responsáveis dos próximos setores
            </button>
          </div>
        )}
      {editingAssignments && (
        <OnboardingAssignmentEditor
          key={run.revision}
          run={run}
          onClose={() => setEditingAssignments(false)}
        />
      )}
    </article>
  );
}

function OnboardingAssignmentEditor({
  run,
  onClose,
}: {
  run: CompanyOnboarding;
  onClose: () => void;
}) {
  const { data, client, refresh, notify } = usePortal();
  const blocked = run.stages.filter((stage) => stage.status === "blocked");
  const [assignments, setAssignments] = useState<Record<string, string>>(
    Object.fromEntries(blocked.map((stage) => [stage.id, stage.assigneeId])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = updateCompanyOnboardingSchema.safeParse({
      expectedRevision: run.revision,
      assignments,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise os responsáveis.");
      return;
    }
    setBusy(true);
    try {
      await client.updateCompanyOnboarding(run.id, parsed.data);
      await refresh();
      notify("Responsáveis dos próximos setores atualizados.");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar os responsáveis.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Responsáveis dos próximos setores"
      description="Altere os setores que ainda aguardam sua vez. Tarefas já liberadas mantêm o responsável."
    >
      <form onSubmit={submit}>
        <fieldset className="form-grid flow-editor-fieldset" disabled={busy}>
          {blocked.map((stage) => (
            <label className="full" key={stage.id}>
              {stage.title} · {stage.department}
              <SelectField
                value={assignments[stage.id] ?? ""}
                onValueChange={(userId) =>
                  setAssignments({ ...assignments, [stage.id]: userId })
                }
                aria-label={`Novo responsável por ${stage.title}`}
                required
              >
                <option value="">Selecione o responsável</option>
                {data.users
                  .filter(
                    (user) =>
                      user.active !== false &&
                      hasPermission(user, "tasks.view") &&
                      canExecute(user) &&
                      user.departments.includes(stage.department),
                  )
                  .map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name}
                    </option>
                  ))}
              </SelectField>
            </label>
          ))}
          <div className="full">
            <FormError message={error} />
          </div>
          <footer className="form-actions full">
            <button
              type="button"
              className="button button-white"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy}>
              <Busy busy={busy}>Salvar responsáveis</Busy>
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}

function DepartmentFlowEditor({
  flow,
  onClose,
}: {
  flow?: DepartmentFlow;
  onClose: () => void;
}) {
  const { actor, client, refresh, notify } = usePortal();
  const [title, setTitle] = useState(flow?.title ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [active, setActive] = useState(flow?.active ?? true);
  const [kind, setKind] = useState<"onboarding" | "process">(
    flow?.kind ?? "onboarding",
  );
  const [stages, setStages] = useState<DepartmentFlowStage[]>(
    flow?.stages.map((stage) => structuredClone(stage)) ?? [
      newStage(actor.departments[0] ?? "Fiscal"),
    ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function updateStage(id: string, patch: Partial<DepartmentFlowStage>) {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, ...patch } : stage,
      ),
    );
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...stages];
    const target = index + direction;
    if (!next[target]) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setStages(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const payload = { title, description, stages, kind };
    const parsed = flow
      ? updateDepartmentFlowSchema.safeParse({
          ...payload,
          active,
          expectedVersion: flow.version,
        })
      : createDepartmentFlowSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise as etapas do fluxo.");
      return;
    }
    setBusy(true);
    try {
      if (flow)
        await client.updateDepartmentFlow(
          flow.id,
          updateDepartmentFlowSchema.parse({
            ...payload,
            active,
            expectedVersion: flow.version,
          }),
        );
      else
        await client.createDepartmentFlow(
          createDepartmentFlowSchema.parse(payload),
        );
      await refresh();
      notify(
        flow
          ? "Nova versão do fluxo salva. Implantações existentes foram preservadas."
          : "Fluxo entre departamentos criado.",
      );
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o fluxo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={
        flow
          ? "Editar fluxo entre departamentos"
          : "Novo fluxo entre departamentos"
      }
      description="Defina a sequência do processo e a tarefa de cada setor."
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="form-grid flow-editor-fieldset" disabled={busy}>
          {!flow && (
            <div className="full">
              <button
                className="button button-white"
                type="button"
                onClick={() => {
                  setTitle("Implantação de nova empresa");
                  setKind("onboarding");
                  setDescription(
                    "Entrada e parametrização inicial, com passagem entre os setores definidos pelo gestor.",
                  );
                  setStages(
                    actor.departments.map((department) => ({
                      ...newStage(department),
                      title: `Parametrização de ${department}`,
                      workflowSteps: [
                        {
                          id: crypto.randomUUID(),
                          title:
                            "Conferir parâmetros e registrar a entrega do setor",
                        },
                      ],
                    })),
                  );
                }}
              >
                Preencher exemplo de implantação
              </button>
              <p className="muted-note">
                Revise setores, ordem, prazos e etapas antes de salvar.
              </p>
            </div>
          )}
          <label className="full">
            Nome do fluxo
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={3}
              maxLength={100}
              placeholder="Ex.: Implantação de nova empresa"
            />
          </label>
          <label className="full">
            Tipo de processo
            <SelectField
              value={kind}
              onValueChange={(value) =>
                setKind(value as "onboarding" | "process")
              }
            >
              <option value="onboarding">Implantação inicial da empresa</option>
              <option value="process">
                Processo entre setores, reutilizável
              </option>
            </SelectField>
          </label>
          <label className="full">
            Descrição
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Objetivo deste processo"
            />
          </label>
          <ol className="department-stage-editor full">
            {stages.map((stage, index) => (
              <li key={stage.id}>
                <header>
                  <h3>
                    <span className="flow-stage-number">{index + 1}</span>Setor
                    da implantação
                  </h3>
                  <div className="workflow-step-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Subir setor"
                      aria-label={`Subir setor ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <MoveUpIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Descer setor"
                      aria-label={`Descer setor ${index + 1}`}
                      disabled={index === stages.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <MoveDownIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Remover setor"
                      aria-label={`Remover setor ${index + 1}`}
                      disabled={stages.length === 1}
                      onClick={() =>
                        setStages(stages.filter((item) => item.id !== stage.id))
                      }
                    >
                      <DeleteIcon size={16} />
                    </button>
                  </div>
                </header>
                <div className="form-grid">
                  <label>
                    Departamento
                    <SelectField
                      value={stage.department}
                      onValueChange={(value) =>
                        updateStage(stage.id, {
                          department: value as Department,
                        })
                      }
                      aria-label={`Departamento do setor ${index + 1}`}
                    >
                      {actor.departments.map((department) => (
                        <option key={department}>{department}</option>
                      ))}
                    </SelectField>
                  </label>
                  <label>
                    Tarefa do setor
                    <input
                      value={stage.title}
                      onChange={(event) =>
                        updateStage(stage.id, { title: event.target.value })
                      }
                      required
                      minLength={3}
                      maxLength={100}
                      placeholder="Ex.: Parametrização inicial"
                    />
                  </label>
                  <label>
                    Meta após liberar o setor (dias)
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      required
                      value={stage.internalDays}
                      onChange={(event) =>
                        updateStage(stage.id, {
                          internalDays: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Prazo após liberar o setor (dias)
                    <input
                      type="number"
                      min={stage.internalDays}
                      max={3650}
                      required
                      value={stage.legalDays}
                      onChange={(event) =>
                        updateStage(stage.id, {
                          legalDays: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <WorkflowEditor
                    value={stage.workflowSteps}
                    onChange={(workflowSteps) =>
                      updateStage(stage.id, { workflowSteps })
                    }
                    models={[]}
                    disabled={busy}
                  />
                  <label className="full">
                    Evidência obrigatória (opcional)
                    <input
                      value={stage.requiredDocument}
                      onChange={(event) =>
                        updateStage(stage.id, {
                          requiredDocument: event.target.value,
                        })
                      }
                      maxLength={100}
                      placeholder="Deixe vazio se não exigir arquivo"
                    />
                  </label>
                  <label className="checkbox-field full">
                    <input
                      type="checkbox"
                      checked={stage.requiresReview}
                      onChange={(event) =>
                        updateStage(stage.id, {
                          requiresReview: event.target.checked,
                        })
                      }
                    />
                    Exigir conferência por outra pessoa antes de liberar o
                    próximo setor
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <div className="full">
            <button
              type="button"
              className="button button-white"
              disabled={stages.length >= 30}
              onClick={() =>
                setStages([
                  ...stages,
                  newStage(actor.departments[0] ?? "Fiscal"),
                ])
              }
            >
              <AddIcon size={16} />
              Adicionar setor
            </button>
          </div>
          {flow && (
            <>
              <label className="checkbox-field full">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                Disponível para novas implantações
              </label>
              <p className="muted-note full">
                Uma nova versão será criada. As empresas que já iniciaram mantêm
                seu fluxo, responsáveis e andamento.
              </p>
            </>
          )}
          <div className="full">
            <FormError message={error} />
          </div>
          <footer className="form-actions full">
            <button
              type="button"
              className="button button-white"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy}>
              <Busy busy={busy}>
                {flow ? "Salvar nova versão" : "Criar fluxo"}
              </Busy>
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}

function newStage(department: Department): DepartmentFlowStage {
  return {
    id: `stage-${crypto.randomUUID()}`,
    title: "",
    department,
    internalDays: 3,
    legalDays: 7,
    requiresReview: false,
    requiredDocument: "",
    workflowSteps: [{ id: `step-${crypto.randomUUID()}`, title: "" }],
  };
}

function StartOnboarding({
  initialCompanyId,
  initialFlowId,
  onClose,
}: {
  initialCompanyId?: string;
  initialFlowId?: string;
  onClose: () => void;
}) {
  const { data, competence, client, refresh, notify } = usePortal();
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [draft, setDraft] = useState<OnboardingDraft>({
    flowId: initialFlowId ?? "",
    competence,
    blockRecurring: true,
    assignments: {},
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosenFlow = data.departmentFlows.find(
    (flow) => flow.id === draft.flowId,
  );
  const companies = data.companies.filter(
    (company) =>
      company.active &&
      (chosenFlow?.kind === "process" ||
        !data.companyOnboardings.some(
          (run) => run.companyId === company.id && run.kind !== "process",
        )),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const flow = data.departmentFlows.find((item) => item.id === draft.flowId);
    const parsed = startCompanyOnboardingSchema.safeParse({
      ...draft,
      companyId,
      expectedFlowVersion: flow?.version,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Selecione empresa, fluxo e responsáveis.",
      );
      return;
    }
    setBusy(true);
    try {
      await client.startCompanyOnboarding(parsed.data);
      await refresh();
      notify(
        "Implantação iniciada. A tarefa do primeiro setor está disponível.",
      );
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível iniciar a implantação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Iniciar implantação da empresa"
      description="Escolha o fluxo, os responsáveis e a liberação da rotina."
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="form-grid flow-editor-fieldset" disabled={busy}>
          <label className="full">
            Empresa
            <SelectField
              value={companyId}
              onValueChange={setCompanyId}
              aria-label="Empresa da implantação"
              required
            >
              <option value="">Selecione a empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </SelectField>
          </label>
          {!companies.length && (
            <p className="muted-note full">
              As empresas da carteira já possuem implantação ou estão inativas.
            </p>
          )}
          <OnboardingFields value={draft} onChange={setDraft} disabled={busy} />
          <p className="muted-note full">
            Esta escolha controla novas gerações. Tarefas que já existem são
            preservadas.
          </p>
          <div className="full">
            <FormError message={error} />
          </div>
          <footer className="form-actions full">
            <button
              type="button"
              className="button button-white"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={busy || !companies.length}
            >
              <Busy busy={busy}>Iniciar implantação</Busy>
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}
