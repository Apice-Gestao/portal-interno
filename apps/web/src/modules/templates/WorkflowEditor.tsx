import { Fragment, useEffect, useId, useRef, useState } from "react";
import {
  MoveDownIcon,
  MoveUpIcon,
  DuplicateIcon,
  AddIcon,
  DeleteIcon,
  DragHandleIcon,
  StartIcon,
  CompletedIcon,
} from "../../shared/icons";
import { getTemplateWorkflow } from "@apice/domain";
import type { TaskTemplate, WorkflowStep } from "@apice/domain";
import { SelectField } from "../../shared/ui/SelectField";
import "./workflow-editor.css";

// Visual flow editor: start and delivery markers, connected step cards, "+" to insert
// between steps and drag-and-drop ordering (buttons keep keyboard ordering).
export function WorkflowEditor({
  value,
  onChange,
  models,
  disabled = false,
  heading = "Etapas de execução",
  description = "Defina o que será marcado pelo responsável, na ordem desejada.",
}: {
  value: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  models: TaskTemplate[];
  disabled?: boolean;
  heading?: string;
  description?: string;
}) {
  const fieldId = useId();
  const [source, setSource] = useState("standard");
  const [announcement, setAnnouncement] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusStep = useRef<string | undefined>(undefined);
  const [dragged, setDragged] = useState<number>();
  const [target, setTarget] = useState<number>();

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

  function insertAt(position: number) {
    if (value.length >= 30) return;
    const id = `step-${crypto.randomUUID()}`;
    focusStep.current = id;
    const steps = [...value];
    steps.splice(position, 0, { id, title: "" });
    onChange(steps);
    setAnnouncement(`Etapa ${position + 1} adicionada.`);
  }
  const add = () => insertAt(value.length);

  function drop(destination: number) {
    if (dragged === undefined || dragged === destination) return;
    const steps = [...value];
    const [item] = steps.splice(dragged, 1);
    steps.splice(destination, 0, item!);
    onChange(steps);
    setAnnouncement(`Etapa movida para a posição ${destination + 1}.`);
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
          <h3 id={`${fieldId}-heading`}>{heading}</h3>
          <p>{description}</p>
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
          <DuplicateIcon size={15} aria-hidden="true" />
          Aplicar fluxo
        </button>
      </div>
      <ol className="workflow-flow">
        <li className="workflow-terminal" aria-label="Início">
          <StartIcon size={16} aria-hidden="true" />
          Início · tarefa gerada
        </li>
        {value.map((step, index) => (
          <Fragment key={step.id}>
            <li className="workflow-connector">
              <button
                type="button"
                className="workflow-insert"
                aria-label={`Inserir etapa antes da etapa ${index + 1}`}
                title="Inserir etapa aqui"
                disabled={disabled || value.length >= 30}
                onClick={() => insertAt(index)}
              >
                <AddIcon size={12} aria-hidden="true" />
              </button>
            </li>
            <li
              className={`workflow-editor-step ${dragged === index ? "is-dragging" : ""} ${target === index && dragged !== index ? "is-target" : ""}`}
              draggable={!disabled}
              onDragStart={(event) => {
                setDragged(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", step.id);
              }}
              onDragOver={(event) => {
                if (dragged === undefined) return;
                event.preventDefault();
                setTarget(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop(index);
                setDragged(undefined);
                setTarget(undefined);
              }}
              onDragEnd={() => {
                setDragged(undefined);
                setTarget(undefined);
              }}
            >
              <span className="workflow-drag" aria-hidden="true">
                <DragHandleIcon size={16} />
              </span>
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
                  draggable={false}
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
                  <MoveUpIcon size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Descer etapa ${index + 1}`}
                  title="Descer etapa"
                  disabled={disabled || index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <MoveDownIcon size={16} aria-hidden="true" />
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
                  <DeleteIcon size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          </Fragment>
        ))}
        <li className="workflow-connector">
          <button
            type="button"
            className="workflow-insert"
            aria-label="Inserir etapa no fim"
            title="Inserir etapa aqui"
            disabled={disabled || value.length >= 30}
            onClick={add}
          >
            <AddIcon size={12} aria-hidden="true" />
          </button>
        </li>
        <li className="workflow-terminal is-end" aria-label="Entrega">
          <CompletedIcon size={16} aria-hidden="true" />
          Entrega · conclusão da tarefa
        </li>
      </ol>
      <div className="workflow-editor-bottom">
        <button
          type="button"
          className="button button-white"
          disabled={disabled || value.length >= 30}
          onClick={add}
        >
          <AddIcon size={16} aria-hidden="true" />
          Adicionar etapa
        </button>
        <span className="workflow-editor-feedback" role="status">
          {announcement}
        </span>
      </div>
    </section>
  );
}
