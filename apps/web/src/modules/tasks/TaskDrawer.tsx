import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloseIcon,
  CalendarIcon,
  CheckIcon,
  UploadIcon,
  DocumentIcon,
  ReviewIcon,
  CompletedIcon,
  ClockIcon,
  MoreActionsIcon,
  DownloadIcon,
  StartIcon,
  ReturnedIcon,
  TransferIcon,
} from "../../shared/icons";
import {
  dateLabel,
  businessTime,
  demoPdf,
  canExecute,
  hasPermission,
  isManager,
  statusLabels,
  businessDate,
} from "@apice/domain";
import type { TaskCommand } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { Busy, FormError, Modal } from "../../shared/ui/components";
import {
  TaskDeadlineBadge,
  TaskWorkflowLabel,
} from "../../shared/ui/TaskStatus";
import { SelectField } from "../../shared/ui/SelectField";
import { documentsReady, latestDocuments } from "../documents/document-utils";
import { downloadBlob } from "../../shared/downloads";
import "../documents/documents.css";
type ReasonAction =
  | "return"
  | "wait"
  | "request_dispense"
  | "dispense"
  | "reopen"
  | "cancel"
  | "retain_applicability";
const reasonTitles = {
  return: "Devolver para correção",
  wait: "Registrar espera pelo cliente",
  request_dispense: "Solicitar dispensa",
  dispense: "Aprovar dispensa",
  reopen: "Reabrir tarefa",
  cancel: "Cancelar tarefa",
  retain_applicability: "Confirmar que a tarefa continua aplicável",
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
  // Transfer dialog: undefined = closed, "" = open without a choice yet.
  const [transferTo, setTransferTo] = useState<string>();
  const [comment, setComment] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [logicalId, setLogicalId] = useState("");
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
  const canAssign = hasPermission(actor, "tasks.assign");
  const canDispense = hasPermission(actor, "tasks.dispense");
  const canReopen = hasPermission(actor, "tasks.reopen");
  const canCancel = hasPermission(actor, "tasks.cancel");
  // Any account granted "tasks.assign" may transfer (cargo is not a ceiling).
  const canTransfer =
    canAssign &&
    !!task &&
    !["done", "dispensed", "cancelled"].includes(task.status);
  const transferCandidates = task
    ? data.users.filter(
        (u) =>
          u.active !== false &&
          canExecute(u) &&
          u.departments.includes(task.department) &&
          u.userId !== task.assigneeId,
      )
    : [];
  const writable = canExecute(actor);
  const queue = task?.assigneeId === `department:${task?.department}`;
  const canEdit =
    writable &&
    !task?.applicabilityReview &&
    (task?.assigneeId === actor.userId || manager);
  const canStart =
    writable &&
    !task?.applicabilityReview &&
    (task?.assigneeId === actor.userId || queue || manager);
  const canClaim =
    writable &&
    queue &&
    !task?.applicabilityReview &&
    !!task &&
    ["in_progress", "waiting", "in_review"].includes(task.status);
  const canAttach =
    hasPermission(actor, "tasks.attach") &&
    (task?.assigneeId === actor.userId || manager);
  const canReview =
    !task?.applicabilityReview &&
    (actor.permissions === undefined
      ? writable
      : hasPermission(actor, "tasks.review")) &&
    task?.status === "in_review" &&
    !task.executionActorIds.includes(actor.userId);
  const ready =
    !!task && task.steps.every((s) => s.completed) && documentsReady(task);
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
      setTransferTo(undefined);
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
      await client.attach(task.id, task.revision, file, {
        logicalId: logicalId || undefined,
        documentTypeId: documentTypeId || undefined,
      });
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
      downloadBlob(name, blob);
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
        <Dialog.Content
          className="drawer-content"
          // TEMPORARY demo tour: its balloon sits outside the drawer.
          onInteractOutside={(event) => {
            if ((event.target as HTMLElement | null)?.closest?.(".demo-tour"))
              event.preventDefault();
          }}
        >
          <div className="drawer-topline">
            <span className="eyebrow">DETALHE DA TAREFA</span>
            <Dialog.Close
              className="icon-button"
              aria-label="Fechar tarefa"
              disabled={busy}
            >
              <CloseIcon size={20} />
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
                <TaskDeadlineBadge task={task} today={businessDate(data.now)} />
                {!["done", "dispensed"].includes(task.status) && (
                  <TaskWorkflowLabel status={task.status} />
                )}
                <span className="small-text">{task.department}</span>
                {task.onboardingId && (
                  <span className="badge status-in_progress">
                    Implantação inicial
                  </span>
                )}
                {(canEdit ||
                  canAssign ||
                  canDispense ||
                  canCancel ||
                  canReopen) && (
                  <button
                    className="icon-button"
                    aria-label="Mais ações da tarefa"
                    onClick={() => setMore(!more)}
                    disabled={busy}
                  >
                    <MoreActionsIcon size={20} />
                  </button>
                )}
              </div>
              {more && (
                <div className="more-actions">
                  {canEdit && task.status === "in_progress" && (
                    <button onClick={() => setAction("wait")}>
                      Aguardar cliente
                    </button>
                  )}
                  {(canDispense || canEdit) &&
                    !["done", "dispensed"].includes(task.status) &&
                    !task.dispenseRequested && (
                      <button
                        onClick={() =>
                          setAction(
                            canDispense ? "dispense" : "request_dispense",
                          )
                        }
                      >
                        {canDispense
                          ? "Dispensar tarefa"
                          : "Solicitar dispensa"}
                      </button>
                    )}
                  {canReopen &&
                    !task.onboardingId &&
                    ["done", "dispensed"].includes(task.status) && (
                      <button onClick={() => setAction("reopen")}>
                        Reabrir tarefa
                      </button>
                    )}
                  {canCancel &&
                    !task.onboardingId &&
                    !["done", "dispensed"].includes(task.status) && (
                      <button onClick={() => setAction("cancel")}>
                        Cancelar com justificativa
                      </button>
                    )}
                  {canTransfer && (
                    <button
                      onClick={() => {
                        setMore(false);
                        setError("");
                        setTransferTo("");
                      }}
                    >
                      Transferir tarefa
                    </button>
                  )}
                </div>
              )}
              {task.applicabilityReview && (
                <div className="info-box" role="status">
                  <strong>Revisão de aplicabilidade necessária</strong>
                  <p>{task.applicabilityReview.reason}</p>
                  <p>
                    A execução aguarda o gestor confirmar a necessidade da
                    tarefa ou cancelá-la com justificativa.
                  </p>
                  {hasPermission(actor, "tasks.manage") && (
                    <button
                      className="button button-white"
                      disabled={busy}
                      onClick={() => setAction("retain_applicability")}
                    >
                      Manter tarefa com justificativa
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="button button-white"
                      disabled={busy}
                      onClick={() => setAction("cancel")}
                    >
                      Cancelar tarefa
                    </button>
                  )}
                </div>
              )}
              <div className="deadline-cards">
                <div>
                  <span>
                    <CalendarIcon size={15} />
                    Meta interna
                  </span>
                  <strong>
                    {dateLabel(task.internalDue)}
                    <small> / {task.internalDue.slice(0, 4)}</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <ReviewIcon size={15} />
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
                  <strong>
                    {user?.name ??
                      (task.assigneeId.startsWith("department:")
                        ? `Fila de ${task.department}`
                        : "Responsável indisponível")}
                  </strong>
                </div>
                {canTransfer && (
                  <button
                    type="button"
                    className="button button-white drawer-transfer"
                    onClick={() => {
                      setError("");
                      setTransferTo("");
                    }}
                    disabled={busy}
                  >
                    <TransferIcon size={15} aria-hidden="true" />
                    Transferir
                  </button>
                )}
                {task.startedAt && (
                  <span className="small-text">
                    <ClockIcon size={14} />
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
                  {
                    id: "comments",
                    label: `Comentários (${task.comments?.length ?? 0})`,
                  },
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
                            {step.completed && <CheckIcon size={13} />}
                          </span>
                          <span>
                            <small>Etapa {i + 1}</small>
                            <strong>{step.title}</strong>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="section-heading evidence-heading">
                      <h3>
                        {task.evidenceRequired === false
                          ? "Evidência complementar"
                          : "Evidência obrigatória"}
                      </h3>
                      <span
                        className={
                          task.documents.length
                            ? "success-text"
                            : "warning-text"
                        }
                      >
                        {task.documents.length
                          ? "Anexada"
                          : task.evidenceRequired === false
                            ? "Opcional"
                            : "Pendente"}
                      </span>
                    </div>
                    <div className="task-requirements">
                      {(task.requiredDocumentTypeIds ?? []).map((id) => (
                        <span
                          key={id}
                          className={`badge ${latestDocuments(task.documents).some((doc) => doc.documentTypeId === id) ? "status-done" : "status-waiting"}`}
                        >
                          {data.workspace.documentTypes.find(
                            (type) => type.id === id,
                          )?.name ?? id}
                        </span>
                      ))}
                    </div>
                    <div className="required-document">
                      <DocumentIcon size={24} />
                      <div>
                        <strong>
                          {task.documentLabel || "Documento da parametrização"}
                        </strong>
                        <p>PDF ou XML · até 5 MB por arquivo</p>
                      </div>
                      {task.documents.length ? (
                        <CompletedIcon size={19} className="success-text" />
                      ) : (
                        <span className="required-label">
                          {task.evidenceRequired === false
                            ? "Opcional"
                            : "Obrigatório"}
                        </span>
                      )}
                    </div>
                    {canAttach && task.status === "in_progress" && (
                      <>
                        <div className="task-attachment-options">
                          <SelectField
                            label="Tipo do documento"
                            value={documentTypeId}
                            onValueChange={setDocumentTypeId}
                          >
                            <option value="">Documento complementar</option>
                            {data.workspace.documentTypes.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.name}
                              </option>
                            ))}
                          </SelectField>
                          <SelectField
                            label="Anexação"
                            value={logicalId}
                            onValueChange={(value) => {
                              setLogicalId(value);
                              const doc = task.documents.find(
                                (item) => item.logicalId === value,
                              );
                              if (doc)
                                setDocumentTypeId(doc.documentTypeId ?? "");
                            }}
                          >
                            <option value="">
                              Novo documento independente
                            </option>
                            {latestDocuments(task.documents)
                              .filter((doc) => doc.logicalId)
                              .map((doc) => (
                                <option key={doc.id} value={doc.logicalId}>
                                  Nova versão de {doc.name}
                                </option>
                              ))}
                          </SelectField>
                        </div>
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
                          <UploadIcon size={21} />
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
                        <ReviewIcon size={18} />
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
                        <ClockIcon size={18} />
                        <div>
                          <strong>Dispensa aguardando aprovação</strong>
                          <p>
                            Um coordenador deve analisar a justificativa no
                            histórico.
                          </p>
                          {canDispense && (
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
                      <h3>Documentos e versões</h3>
                      <span>{task.documents.length} arquivos</span>
                    </div>
                    {task.documents.length ? (
                      [...task.documents].reverse().map((doc) => (
                        <div className="document-version" key={doc.id}>
                          <span className="file-icon">
                            <DocumentIcon size={21} />
                          </span>
                          <div>
                            <strong>{doc.name}</strong>
                            <p>
                              Versão {doc.logicalVersion ?? doc.version} ·{" "}
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
                              <DownloadIcon size={17} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty-document">
                        <DocumentIcon size={28} />
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
                {tab === "comments" && (
                  <section className="task-comments">
                    {(task.comments ?? []).map((item) => (
                      <article key={item.id} className="task-comment">
                        <header>
                          <strong>{item.authorName}</strong>
                          <small>
                            {dateLabel(item.at)} · {businessTime(item.at)}
                          </small>
                        </header>
                        <p>{item.text}</p>
                      </article>
                    ))}
                    {!task.comments?.length && (
                      <p className="muted-note">
                        Nenhum comentário nesta tarefa.
                      </p>
                    )}
                    {hasPermission(actor, "tasks.comment") && (
                      <form
                        className="task-comment-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (busy || !comment.trim()) return;
                          setBusy(true);
                          setError("");
                          void client
                            .addTaskComment(task.id, {
                              expectedRevision: task.revision,
                              text: comment,
                            })
                            .then(async () => {
                              setComment("");
                              await refresh();
                              notify("Comentário registrado.");
                            })
                            .catch((cause) =>
                              setError(
                                cause instanceof Error
                                  ? cause.message
                                  : "Falha ao comentar.",
                              ),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        <label className="form-label">
                          Comentário interno
                          <textarea
                            required
                            maxLength={2000}
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            rows={4}
                          />
                        </label>
                        <button
                          className="button button-primary"
                          disabled={busy || !comment.trim()}
                        >
                          Publicar comentário
                        </button>
                      </form>
                    )}
                  </section>
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
                            {businessTime(e.at)}
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
                        <ReviewIcon size={17} />
                        <p>
                          Primeira conclusão preservada:{" "}
                          {dateLabel(task.originalCompletedAt)} às{" "}
                          {businessTime(task.originalCompletedAt)}.
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
                      <DocumentIcon size={18} />
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
                  <CompletedIcon size={16} />
                  <span>
                    {task.status === "done"
                      ? "Entrega concluída e registrada"
                      : task.status === "dispensed"
                        ? "Dispensa registrada no histórico"
                        : ready
                          ? task.evidenceRequired === false
                            ? "Etapas concluídas"
                            : "Etapas e evidência completas"
                          : task.evidenceRequired === false
                            ? "Conclua as etapas"
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
                  {canClaim && (
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
                      <StartIcon size={16} />
                      <Busy busy={busy}>Assumir tarefa</Busy>
                    </button>
                  )}
                  {canStart && ["todo", "returned"].includes(task.status) && (
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
                      <StartIcon size={16} />
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
                  {canReopen &&
                    !task.onboardingId &&
                    ["done", "dispensed"].includes(task.status) && (
                      <button
                        className="button button-white"
                        disabled={busy}
                        onClick={() => setAction("reopen")}
                      >
                        <ReturnedIcon size={15} />
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
      {task && (
        <Modal
          open={transferTo !== undefined}
          onOpenChange={(open) => {
            if (!open && !busy) setTransferTo(undefined);
          }}
          title="Transferir tarefa"
          description={`${company?.name ?? "Empresa"} · ${task.title}. A transferência fica registrada no histórico.`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!transferTo) return;
              void command({
                type: "assign",
                assigneeId: transferTo,
                expectedRevision: task.revision,
              });
            }}
          >
            <p className="transfer-current">
              Hoje com{" "}
              <strong>
                {user?.name ??
                  (queue ? `a fila de ${task.department}` : "ninguém")}
              </strong>
            </p>
            <div
              className="transfer-options"
              role="radiogroup"
              aria-label="Novo responsável"
            >
              {transferCandidates.map((candidate) => {
                const open = data.tasks.filter(
                  (item) =>
                    item.assigneeId === candidate.userId &&
                    !["done", "dispensed", "cancelled"].includes(item.status),
                ).length;
                return (
                  <label
                    key={candidate.userId}
                    className={`transfer-option ${transferTo === candidate.userId ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="transfer-to"
                      value={candidate.userId}
                      checked={transferTo === candidate.userId}
                      onChange={() => setTransferTo(candidate.userId)}
                      disabled={busy}
                    />
                    <span className="avatar avatar-small">
                      {candidate.initials}
                    </span>
                    <span className="transfer-option-name">
                      <strong>{candidate.name}</strong>
                      <small>
                        {open}{" "}
                        {open === 1 ? "tarefa aberta" : "tarefas abertas"}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            {!transferCandidates.length && (
              <p className="muted-note">
                Não há outra pessoa ativa em {task.department} para receber a
                tarefa.
              </p>
            )}
            <FormError message={error} />
            <footer className="form-actions">
              <button
                type="button"
                className="button button-white"
                disabled={busy}
                onClick={() => setTransferTo(undefined)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={busy || !transferTo}
              >
                <TransferIcon size={16} aria-hidden="true" />
                <Busy busy={busy}>Transferir</Busy>
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </Dialog.Root>
  );
}
