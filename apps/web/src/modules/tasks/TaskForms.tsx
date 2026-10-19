import { SelectField } from "../../shared/ui/SelectField";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  canExecute,
  hasPermission,
  suggestedDeadlines,
  taskSchema,
} from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { Busy, FormError, Modal } from "../../shared/ui/components";
import { CompetencePicker, DatePicker } from "../../shared/ui/CompetencePicker";
export function NewTaskModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    actor,
    data,
    department,
    client,
    refresh,
    notify,
    competence,
    setCompetence,
  } = usePortal();
  // The task lands in the competence open on screen, so whoever opens the
  // portal on it finds the task (19/10/2026).
  const [taskCompetence, setTaskCompetence] = useState(competence);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canCreate = hasPermission(actor, "tasks.create");
  // Brasília dates from the server clock; the person can change both.
  const suggested = suggestedDeadlines(data.now);
  const assignees = data.users.filter(
    (user) =>
      user.active !== false &&
      user.departments.includes(department) &&
      canExecute(user),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = taskSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      companyId: form.get("companyId"),
      assigneeId: form.get("assigneeId") ?? actor.userId,
      department,
      internalDue: form.get("internalDue"),
      legalDue: form.get("legalDue"),
      requiresReview: form.get("requiresReview") === "on",
      competence: taskCompetence,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.addTask(result.data);
      await refresh();
      setCompetence(taskCompetence);
      onOpenChange(false);
      notify("Tarefa avulsa criada e atribuída.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível criar a tarefa.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open && canCreate}
      onOpenChange={(value) => {
        if (!busy) {
          setError("");
          onOpenChange(value);
        }
      }}
      title="Nova tarefa avulsa"
      description="Crie uma entrega pontual para uma empresa da sua carteira."
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          Título
          <input
            name="title"
            placeholder="Ex.: Revisar declaração retificadora"
            required
            minLength={3}
            maxLength={60}
          />
        </label>
        <label className="full">
          Descrição
          <input
            name="description"
            placeholder="O que precisa ser feito?"
            required
            maxLength={140}
          />
        </label>
        <label className="full">
          Empresa
          <SelectField name="companyId" aria-label="Empresa" required>
            <option value="">Selecione uma empresa</option>
            {data.companies
              .filter(
                (c) => c.active && (canCreate || c.ownerId === actor.userId),
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectField>
        </label>
        <label>
          Competência
          <CompetencePicker
            value={taskCompetence}
            onValueChange={setTaskCompetence}
          />
        </label>
        <label>
          Meta interna
          <DatePicker
            name="internalDue"
            label="Meta interna"
            defaultValue={suggested.internalDue}
            required
          />
        </label>
        <label>
          Prazo legal
          <DatePicker
            name="legalDue"
            label="Prazo legal"
            defaultValue={suggested.legalDue}
            required
          />
        </label>
        {canCreate && (
          <label className="full">
            Responsável
            <SelectField
              name="assigneeId"
              aria-label="Responsável"
              required
              defaultValue=""
            >
              <option value="">Selecione um responsável</option>
              {assignees.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        <label className="checkbox-field full">
          <input type="checkbox" name="requiresReview" defaultChecked />
          Exigir conferência por outra pessoa
        </label>
        <div className="full">
          <FormError message={error} />
        </div>
        <footer className="form-actions full">
          <button
            type="button"
            className="button button-white"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="button button-primary" disabled={busy}>
            <Busy busy={busy}>Criar tarefa</Busy>
          </button>
        </footer>
      </form>
    </Modal>
  );
}
