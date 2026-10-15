import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { getTemplateWorkflow } from "@apice/domain";
import type { TaskTemplate, WorkflowStep } from "@apice/domain";
import { SelectField } from "../../shared/ui/SelectField";
import "./workflow-editor.css";

export function WorkflowEditor({
  value,
  onChange,
  models,
  disabled = false,
}: {
  value: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  models: TaskTemplate[];
  disabled?: boolean;
}) {
  const fieldId = useId();
  const [source, setSource] = useState("standard");
  const [announcement, setAnnouncement] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusStep = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (focusStep.current) {
      inputs.current.get(focusStep.current)?.focus();
      focusStep.current = undefined;
    }
  }, [value]);

  function move(index: number, direction: -1 | 1) {
    const steps = [...value];
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    [steps[index], steps[destination]] = [steps[destination]!, steps[index]!];
    onChange(steps);
    setAnnouncement(`Etapa movida para a posição ${destination + 1}.`);
  }

  function add() {
    if (value.length >= 30) return;
    const id = `step-${crypto.randomUUID()}`;
    focusStep.current = id;
    onChange([...value, { id, title: "" }]);
    setAnnouncement(`Etapa ${value.length + 1} adicionada.`);
  }

  function copyFlow() {
    const model = models.find((item) => item.id === source);
    if (source !== "standard" && !model) return;
    const steps = getTemplateWorkflow(model ?? { workflowSteps: undefined });
    onChange(steps);
    setAnnouncement("Fluxo copiado. Você pode editar as etapas livremente.");
  }

  return (
    <section
      className="workflow-editor full"
      aria-labelledby={`${fieldId}-heading`}
    >
      <div className="workflow-editor-heading">
        <div>
          <h3 id={`${fieldId}-heading`}>Etapas de execução</h3>
          <p>Defina o que será marcado pelo responsável, na ordem desejada.</p>
        </div>
        <span>{value.length} / 30</span>
      </div>
      <div className="workflow-copy-row">
        <SelectField
          id={`${fieldId}-source`}
          label="Copiar fluxo de"
          value={source}
          onValueChange={setSource}
          disabled={disabled}
        >
          <option value="standard">Fluxo padrão</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.title}
            </option>
          ))}
        </SelectField>
        <button
          type="button"
          className="button button-white"
          disabled={disabled}
          onClick={copyFlow}
        >
          <Copy size={15} aria-hidden="true" />
          Aplicar fluxo
        </button>
      </div>
      <ol className="workflow-step-list">
        {value.map((step, index) => (
          <li key={step.id} className="workflow-editor-step">
            <span className="workflow-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <label
              htmlFor={`${fieldId}-${step.id}`}
              className="workflow-step-field"
            >
              <span className="sr-only">Etapa {index + 1}</span>
              <input
                id={`${fieldId}-${step.id}`}
                ref={(element) => {
                  if (element) inputs.current.set(step.id, element);
                  else inputs.current.delete(step.id);
                }}
                value={step.title}
                onChange={(event) =>
                  onChange(
                    value.map((item) =>
                      item.id === step.id
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Descreva a etapa"
                minLength={2}
                maxLength={120}
                required
                disabled={disabled}
              />
            </label>
            <div className="workflow-step-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={`Subir etapa ${index + 1}`}
                title="Subir etapa"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Descer etapa ${index + 1}`}
                title="Descer etapa"
                disabled={disabled || index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover etapa ${index + 1}`}
                title="Remover etapa"
                disabled={disabled || value.length === 1}
                onClick={() => {
                  const next = value.filter((item) => item.id !== step.id);
                  focusStep.current =
                    next[Math.min(index, next.length - 1)]?.id;
                  onChange(next);
                  setAnnouncement(
                    `Etapa removida. ${next.length} ${next.length === 1 ? "etapa" : "etapas"} no fluxo.`,
                  );
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="workflow-editor-bottom">
        <button
          type="button"
          className="button button-white"
          disabled={disabled || value.length >= 30}
          onClick={add}
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar etapa
        </button>
        <span className="workflow-editor-feedback" role="status">
          {announcement}
        </span>
      </div>
    </section>
  );
}
