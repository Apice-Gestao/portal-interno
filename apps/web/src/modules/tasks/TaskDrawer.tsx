import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  CalendarDays,
  Check,
  Upload,
  FileText,
  ShieldCheck,
  CircleCheck,
  Clock3,
  MoreHorizontal,
  Download,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  dateLabel,
  demoPdf,
  canExecute,
  hasPermission,
  isManager,
  statusLabels,
} from "@apice/domain";
import type { TaskCommand } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { Busy, FormError, Modal } from "../../shared/ui/components";
import {
  TaskDeadlineBadge,
  TaskWorkflowLabel,
} from "../../shared/ui/TaskStatus";
import { SelectField } from "../../shared/ui/SelectField";
type ReasonAction =
  "return" | "wait" | "request_dispense" | "dispense" | "reopen";
const reasonTitles = {
  return: "Devolver para correção",
  wait: "Registrar espera pelo cliente",
  request_dispense: "Solicitar dispensa",
  dispense: "Aprovar dispensa",
  reopen: "Reabrir tarefa",
};
export function TaskDrawer({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const { data, actor, client, refresh, notify } = usePortal();
  const [tab, setTab] = useState("execution");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stagedAction, setStagedAction] = useState<{
    type: ReasonAction;
    taskId: string;
    revision: number;
  }>();
  const action = stagedAction?.type;
  const [reason, setReason] = useState("");
  const [more, setMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const task = data.tasks.find((t) => t.id === taskId);
  function setAction(type?: ReasonAction) {
    setStagedAction(
      type && task
        ? { type, taskId: task.id, revision: task.revision }
        : undefined,
    );
  }
  const company = data.companies.find((c) => c.id === task?.companyId);
  const user = data.users.find((u) => u.userId === task?.assigneeId);
  const manager = isManager(actor);
  const writable = canExecute(actor);
  const canEdit = writable && (task?.assigneeId === actor.userId || manager);
  const canAttach =
    hasPermission(actor, "tasks.attach") &&
    (task?.assigneeId === actor.userId || manager);
  const canReview =
    (actor.permissions === undefined
      ? writable
      : hasPermission(actor, "tasks.review")) &&
    task?.status === "in_review" &&
    !task.executionActorIds.includes(actor.userId);
  const ready =
    task?.steps.every((s) => s.completed) &&
    task.documents.at(-1)?.validation === "accepted";
  async function command(input: TaskCommand) {
    if (!task || busy) return;
    setBusy(true);
    setError("");
    try {
      await client.command(task.id, input);
      await refresh();
      setAction(undefined);
      setReason("");
      setMore(false);
      if (!canEdit && ["approve", "return"].includes(input.type)) {
        onClose();
        notify(
          input.type === "approve"
            ? "Entrega aprovada e registrada."
            : "Tarefa devolvida e registrada.",
        );
      } else {
        notify("Tarefa atualizada.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação indisponível.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!task || !file || busy) return;
    setBusy(true);
    setError("");
    try {
      await client.attach(task.id, task.revision, file);
      await refresh();
      notify(
        "Evidência anexada. Formato verificado; validação fiscal não executada.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível anexar.");
      await refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function download(docId: string, name: string) {
    if (!task) return;
    try {
      const blob = await client.downloadDocument(task.id, docId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download indisponível.");
    }
  }
  return (
    <Dialog.Root
      open={!!taskId}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setError("");
          setTab("execution");
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="drawer-content">
          <div className="drawer-topline">
            <span className="eyebrow">DETALHE DA TAREFA</span>
            <Dialog.Close
              className="icon-button"
              aria-label="Fechar tarefa"
              disabled={busy}
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Title className="drawer-title">
            {task?.title ?? "Tarefa indisponível"}
          </Dialog.Title>
          <Dialog.Description className="drawer-description">
            {company?.name ?? "Esta tarefa não está disponível no seu escopo."}
            {task &&
              ` · ${task.competence.slice(5)}/${task.competence.slice(0, 4)}`}
          </Dialog.Description>
          {task && (
            <>
              <div className="drawer-meta">
                <TaskDeadlineBadge task={task} today={data.now.slice(0, 10)} />
                {!["done", "dispensed"].includes(task.status) && (
                  <TaskWorkflowLabel status={task.status} />
                )}
                <span className="small-text">{task.department}</span>
                {manager && (
                  <button
                    className="icon-button"
                    aria-label="Mais ações da tarefa"
                    onClick={() => setMore(!more)}
                    disabled={busy}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                )}
              </div>
              {more && manager && (
                <div className="more-actions">
                  {canEdit && task.status === "in_progress" && (
                    <button onClick={() => setAction("wait")}>
                      Aguardar cliente
                    </button>
                  )}
                  {manager &&
                    !["done", "dispensed"].includes(task.status) &&
                    !task.dispenseRequested && (
                      <button
                        onClick={() =>
                          setAction(manager ? "dispense" : "request_dispense")
                        }
                      >
                        {manager ? "Dispensar tarefa" : "Solicitar dispensa"}
                      </button>
                    )}
                  {manager && ["done", "dispensed"].includes(task.status) && (
                    <button onClick={() => setAction("reopen")}>
                      Reabrir tarefa
                    </button>
                  )}
                  {manager && (
                    <label>
                      Responsável
                      <SelectField
                        aria-label="Responsável pela tarefa"
                        value={task.assigneeId}
                        disabled={busy}
                        onValueChange={(value) =>
                          void command({
                            type: "assign",
                            assigneeId: value,
                            expectedRevision: task.revision,
                          })
                        }
                      >
                        {data.users
                          .filter(
                            (u) =>
                              u.active !== false &&
                              canExecute(u) &&
                              u.departments.includes(task.department),
                          )
                          .map((u) => (
                            <option key={u.userId} value={u.userId}>
                              {u.name}
                            </option>
                          ))}
                      </SelectField>
                    </label>
                  )}
                </div>
              )}
              <div className="deadline-cards">
                <div>
                  <span>
                    <CalendarDays size={15} />
                    Meta interna
                  </span>
                  <strong>
                    {dateLabel(task.internalDue)}
                    <small> / {task.internalDue.slice(0, 4)}</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <ShieldCheck size={15} />
                    Prazo legal
                  </span>
                  <strong>
                    {dateLabel(task.legalDue)}
                    <small> / {task.legalDue.slice(0, 4)}</small>
                  </strong>
                </div>
              </div>
              <div className="drawer-owner">
                <span className="avatar avatar-small">{user?.initials}</span>
                <div>
                  <small>Responsável pela execução</small>
                  <strong>{user?.name}</strong>
                </div>
                {task.startedAt && (
                  <span className="small-text">
                    <Clock3 size={14} />
                    Iniciada em {dateLabel(task.startedAt)}
                  </span>
                )}
              </div>
              <div className="drawer-tabs" aria-label="Seções da tarefa">
                {[
                  { id: "execution", label: "Execução" },
                  {
                    id: "documents",
                    label: `Documentos (${task.documents.length})`,
                  },
                  { id: "history", label: "Histórico" },
                  { id: "pop", label: "P.O.P." },
                ].map((item) => (
                  <button
                    className={tab === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    aria-pressed={tab === item.id}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="drawer-body">
                <FormError message={error} />
                {tab === "execution" && (
                  <>
                    <div className="section-heading">
                      <h3>Etapas da execução</h3>
                      <span>
                        {task.steps.filter((s) => s.completed).length}/
                        {task.steps.length}
                      </span>
                    </div>
                    <div className="checklist">
                      {task.steps.map((step, i) => (
                        <label
                          key={step.id}
                          className={`checklist-step ${step.completed ? "completed" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={step.completed}
                            disabled={
                              !canEdit || task.status !== "in_progress" || busy
                            }
                            onChange={(e) =>
                              void command({
                                type: "step",
                                stepId: step.id,
                                completed: e.target.checked,
                                expectedRevision: task.revision,
                              })
                            }
                          />
                          <span className="custom-checkbox" aria-hidden="true">
                            {step.completed && <Check size={13} />}
                          </span>
                          <span>
                            <small>Etapa {i + 1}</small>
                            <strong>{step.title}</strong>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="section-heading evidence-heading">
                      <h3>Evidência obrigatória</h3>
                      <span
                        className={
                          task.documents.length
                            ? "success-text"
                            : "warning-text"
                        }
                      >
                        {task.documents.length ? "Anexada" : "Pendente"}
                      </span>
                    </div>
                    <div className="required-document">
                      <FileText size={24} />
                      <div>
                        <strong>{task.documentLabel}</strong>
                        <p>PDF ou XML · até 5 MB por arquivo</p>
                      </div>
                      {task.documents.length ? (
                        <CircleCheck size={19} className="success-text" />
                      ) : (
                        <span className="required-label">Obrigatório</span>
                      )}
                    </div>
                    {canAttach && task.status === "in_progress" && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          className="sr-only"
                          tabIndex={-1}
                          accept=".pdf,.xml"
                          onChange={(e) => void upload(e.target.files?.[0])}
                          aria-label="Selecionar evidência"
                        />
                        <button
                          className="upload-zone"
                          disabled={busy}
                          onClick={() => fileRef.current?.click()}
                        >
                          <Upload size={21} />
                          <strong>Selecionar evidência</strong>
                        </button>
                        <button
                          className="text-button example-file"
                          disabled={busy}
                          onClick={() =>
                            void upload(
                              new File(
                                [demoPdf() as Uint8Array<ArrayBuffer>],
                                "evidencia-demonstracao.pdf",
                                { type: "application/pdf" },
                              ),
                            )
                          }
                        >
                          Usar PDF fictício de exemplo
                        </button>
                      </>
                    )}
                    {task.requiresReview && (
                      <div className="info-box">
                        <ShieldCheck size={18} />
                        <div>
                          <strong>Conferência por outra pessoa</strong>
                          <p>
                            Após a execução, outro integrante do departamento
                            deve aprovar a entrega.
                          </p>
                        </div>
                      </div>
                    )}
                    {task.dispenseRequested && (
                      <div className="info-box warning-box">
                        <Clock3 size={18} />
                        <div>
                          <strong>Dispensa aguardando aprovação</strong>
                          <p>
                            Um coordenador deve analisar a justificativa no
                            histórico.
                          </p>
                          {manager && (
                            <button
                              className="text-button"
                              onClick={() => setAction("dispense")}
                            >
                              Analisar dispensa
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {tab === "documents" && (
                  <>
                    <div className="section-heading">
                      <h3>Versões da evidência</h3>
                      <span>{task.documents.length} arquivos</span>
                    </div>
                    {task.documents.length ? (
                      [...task.documents].reverse().map((doc) => (
                        <div className="document-version" key={doc.id}>
                          <span className="file-icon">
                            <FileText size={21} />
                          </span>
                          <div>
                            <strong>{doc.name}</strong>
                            <p>
                              Versão {doc.version} ·{" "}
                              {(doc.bytes / 1024).toFixed(0)} KB ·{" "}
                              {dateLabel(doc.createdAt)}
                            </p>
                            <span className="badge status-done">
                              Formato verificado
                            </span>
                          </div>
                          {hasPermission(actor, "tasks.download") && (
                            <button
                              className="icon-button"
                              aria-label={`Baixar ${doc.name}`}
                              onClick={() => void download(doc.id, doc.name)}
                            >
                              <Download size={17} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty-document">
                        <FileText size={28} />
                        <p>A evidência ainda não foi anexada.</p>
                        <button
                          className="text-button"
                          onClick={() => setTab("execution")}
                        >
                          Ir para execução
                        </button>
                      </div>
                    )}
                    <p className="muted-note">
                      A verificação de formato não substitui validação fiscal,
                      análise de conteúdo ou antivírus.
                    </p>
                  </>
                )}
                {tab === "history" && (
                  <div className="timeline">
                    {data.audit
                      .filter((e) => e.taskId === task.id)
                      .map((e) => (
                        <div className="timeline-event" key={e.id}>
                          <span className="timeline-node" />
                          <strong>{e.action}</strong>
                          <p>{e.detail}</p>
                          {e.before && e.after && (
                            <p className="muted-note">
                              {e.before.status !== e.after.status && (
                                <>
                                  {statusLabels[e.before.status]} →{" "}
                                  {statusLabels[e.after.status]} ·{" "}
                                </>
                              )}
                              Etapas concluídas:{" "}
                              {e.before.completedStepIds.length} →{" "}
                              {e.after.completedStepIds.length} · Versões de
                              evidência: {e.before.documentVersions} →{" "}
                              {e.after.documentVersions}
                            </p>
                          )}
                          <small>
                            {e.actorName} · {dateLabel(e.at)} às{" "}
                            {e.at.slice(11, 16)}
                          </small>
                        </div>
                      ))}
                    <div className="timeline-event">
                      <span className="timeline-node" />
                      <strong>Tarefa gerada</strong>
                      <p>
                        Competência {task.competence} · Fluxo v
                        {task.templateVersion}
                      </p>
                      <small>
                        {task.templateId === "avulsa"
                          ? "Cadastro de tarefa avulsa"
                          : "Geração recorrente do sistema"}
                      </small>
                    </div>
                    {task.originalCompletedAt && (
                      <div className="info-box">
                        <ShieldCheck size={17} />
                        <p>
                          Primeira conclusão preservada:{" "}
                          {dateLabel(task.originalCompletedAt)} às{" "}
                          {task.originalCompletedAt.slice(11, 16)}.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {tab === "pop" && (
                  <div className="pop-content">
                    <span className="eyebrow">
                      PROCEDIMENTO DE DEMONSTRAÇÃO
                    </span>
                    <h3>{task.description}</h3>
                    <ol>
                      <li>
                        Confirme empresa, regime e competência antes de iniciar.
                      </li>
                      <li>
                        Execute o procedimento validado pelo responsável do
                        departamento.
                      </li>
                      <li>
                        Anexe a evidência correspondente à empresa e ao período.
                      </li>
                      <li>
                        Encaminhe para conferência quando o modelo exigir.
                      </li>
                    </ol>
                    <div className="info-box">
                      <FileText size={18} />
                      <p>
                        Este roteiro é ilustrativo. Os procedimentos oficiais
                        devem ser validados com a equipe antes da operação real.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <footer className="drawer-footer">
                <div className="completion-note">
                  <CircleCheck size={16} />
                  <span>
                    {task.status === "done"
                      ? "Entrega concluída e registrada"
                      : task.status === "dispensed"
                        ? "Dispensa registrada no histórico"
                        : ready
                          ? "Etapas e evidência completas"
                          : "Conclua etapas e anexe a evidência"}
                  </span>
                </div>
                <div className="drawer-footer-actions">
                  <button
                    className="button button-white"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                    }}
                  >
                    Fechar
                  </button>
                  {canEdit && ["todo", "returned"].includes(task.status) && (
                    <button
                      className="button button-primary"
                      disabled={busy}
                      onClick={() =>
                        void command({
                          type: "start",
                          expectedRevision: task.revision,
                        })
                      }
                    >
                      <Play size={16} />
                      <Busy busy={busy}>Iniciar execução</Busy>
                    </button>
                  )}
                  {canEdit && task.status === "in_progress" && (
                    <button
                      className="button button-primary"
                      disabled={busy || !ready}
                      onClick={() =>
                        void command({
                          type: task.requiresReview ? "submit" : "complete",
                          expectedRevision: task.revision,
                        })
                      }
                    >
                      <Busy busy={busy}>
                        {task.requiresReview
                          ? "Enviar para conferência"
                          : "Concluir tarefa"}
                      </Busy>
                    </button>
                  )}
                  {canReview && (
                    <>
                      <button
                        className="button button-white"
                        disabled={busy}
                        onClick={() => setAction("return")}
                      >
                        Devolver
                      </button>
                      <button
                        className="button button-teal"
                        disabled={busy || !ready}
                        onClick={() =>
                          void command({
                            type: "approve",
                            expectedRevision: task.revision,
                          })
                        }
                      >
                        <Busy busy={busy}>Aprovar entrega</Busy>
                      </button>
                    </>
                  )}
                  {canEdit && task.status === "waiting" && (
                    <button
                      className="button button-primary"
                      disabled={busy}
                      onClick={() =>
                        void command({
                          type: "resume",
                          expectedRevision: task.revision,
                        })
                      }
                    >
                      Retomar execução
                    </button>
                  )}
                  {manager && ["done", "dispensed"].includes(task.status) && (
                    <button
                      className="button button-white"
                      disabled={busy}
                      onClick={() => setAction("reopen")}
                    >
                      <RotateCcw size={15} />
                      Reabrir tarefa
                    </button>
                  )}
                </div>
                {task.status === "in_review" &&
                  task.executionActorIds.includes(actor.userId) && (
                    <p className="muted-note">
                      Aguardando conferência de outra pessoa.
                    </p>
                  )}
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
      {task && (
        <Modal
          open={!!action}
          onOpenChange={(open) => {
            if (!open && !busy) {
              setAction(undefined);
              setReason("");
            }
          }}
          title={action ? reasonTitles[action] : "Justificativa"}
          description="A justificativa será registrada no histórico da tarefa."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (stagedAction && stagedAction.taskId === task.id)
                void command({
                  type: stagedAction.type,
                  reason: reason.trim(),
                  expectedRevision: stagedAction.revision,
                });
            }}
          >
            <label className="form-label">
              Justificativa
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={8}
                maxLength={500}
                required
                rows={4}
                placeholder="Descreva o motivo e o próximo passo."
              />
            </label>
            <FormError message={error} />
            <footer className="form-actions">
              <button
                type="button"
                className="button button-white"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={busy || reason.trim().length < 8}
              >
                <Busy busy={busy}>Confirmar e registrar</Busy>
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </Dialog.Root>
  );
}
