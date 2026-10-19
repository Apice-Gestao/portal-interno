import { SelectField } from "../../shared/ui/SelectField";
import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AddIcon,
  TaskBlueprintIcon,
  ReviewIcon,
  EditIcon,
  StartIcon,
  CheckIcon,
  SearchIcon,
  RefreshIcon,
  ExportFileIcon,
} from "../../shared/icons";
import {
  DomainError,
  getTemplateWorkflow,
  hasPermission,
  templateSchema,
  updateTemplateSchema,
} from "@apice/domain";
import type { Department, TaskTemplate } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { WorkflowEditor } from "./WorkflowEditor";
import {
  CompanyWorkflowForm,
  CompanyWorkflowSection,
} from "./CompanyWorkflows";
import { customizedCompanies } from "./company-workflows";
import { DepartmentFlowsPage } from "./DepartmentFlowsPage";
import { BulkImport } from "../../shared/ui/BulkOperations";
import { downloadText } from "../../shared/downloads";
import { csvCell } from "@apice/domain";
import "./department-flows.css";
import {
  Busy,
  CompetenceSelect,
  EmptyState,
  FormError,
  Modal,
  PageHeading,
} from "../../shared/ui/components";
export default function TemplatesPage() {
  const [params, setParams] = useSearchParams();
  const flowTab = params.get("aba") === "implantacao";
  return (
    <>
      <nav className="template-module-tabs" aria-label="Tipos de modelos">
        <button
          type="button"
          aria-current={!flowTab ? "page" : undefined}
          className={!flowTab ? "active" : ""}
          onClick={() => setParams({})}
        >
          <TaskBlueprintIcon size={16} />
          Modelos de tarefas
        </button>
        <button
          type="button"
          aria-current={flowTab ? "page" : undefined}
          className={flowTab ? "active" : ""}
          onClick={() => setParams({ aba: "implantacao" })}
        >
          <RefreshIcon size={16} />
          Fluxos entre departamentos
        </button>
      </nav>
      {flowTab ? (
        <DepartmentFlowsPage
          key={params.get("empresa") ?? "flows"}
          initialCompanyId={params.get("empresa") ?? undefined}
        />
      ) : (
        <TaskTemplatesPage />
      )}
    </>
  );
}
export function TaskTemplatesPage() {
  const { actor, data, department, competence, client, refresh, notify } =
    usePortal();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{
    department: Department;
    template?: TaskTemplate;
  }>();
  const [generation, setGeneration] = useState(false);
  const [selected, setSelected] = useState<TaskTemplate>();
  const [companyEditor, setCompanyEditor] = useState<{
    template: TaskTemplate;
    companyId?: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    created: number;
    existing: number;
    blocked?: number;
  }>();
  const canManage = hasPermission(actor, "templates.manage");
  const templates = data.templates.filter(
    (t) =>
      t.department === department &&
      `${t.title} ${t.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await client.generate(competence, department);
      setResult(response);
      await refresh();
      notify(
        `${response.created} tarefas geradas; ${response.existing} existentes preservadas.${response.blocked ? ` ${response.blocked} empresas aguardam a implantação.` : ""}`,
      );
      // Companies that need a responsible stay visible until fixed.
      if (response.skipped?.length)
        setError(
          `Sem responsável válido, não geradas: ${response.skipped.join(", ")}. Ajuste a carteira e gere de novo.`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geração indisponível.");
    } finally {
      setBusy(false);
    }
  }
  const blockedCompanies = new Set(
    (data.companyOnboardings ?? [])
      .filter(
        (onboarding) =>
          onboarding.status === "active" && onboarding.blockRecurring,
      )
      .map((onboarding) => onboarding.companyId),
  );
  const eligible = data.companies.filter(
    (c) => c.active && !blockedCompanies.has(c.id),
  ).length;
  return (
    <>
      <PageHeading
        title="Modelos de tarefa"
        description="Configure as obrigações que organizam cada competência."
      >
        <button
          className="button button-white"
          onClick={() =>
            downloadText(
              "modelos-tarefas.csv",
              [
                [
                  "titulo",
                  "descricao",
                  "departamento",
                  "regime",
                  "dia_meta",
                  "dia_legal",
                  "conferencia",
                  "documento",
                  "etapas_json",
                ],
                ...templates.map((model) => [
                  model.title,
                  model.description,
                  model.department,
                  model.regime,
                  model.internalDay,
                  model.legalDay,
                  String(model.requiresReview),
                  model.requiredDocument,
                  JSON.stringify(getTemplateWorkflow(model)),
                ]),
              ]
                .map((row) => row.map(csvCell).join(";"))
                .join("\r\n"),
            )
          }
        >
          <ExportFileIcon size={16} /> Exportar
        </button>
        {canManage && <BulkImport kind="templates" />}
        {canManage && (
          <>
            <button
              className="button button-white"
              onClick={() => {
                setGeneration(true);
                setResult(undefined);
                setError("");
              }}
            >
              <StartIcon size={16} />
              Gerar competência
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                setEditor({ department });
              }}
            >
              <AddIcon size={17} />
              Novo modelo
            </button>
          </>
        )}
      </PageHeading>
      <div className="models-topline">
        <label className="search-field">
          <SearchIcon size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar modelo..."
            aria-label="Buscar modelos"
          />
        </label>
        <span>
          {templates.length} modelos · {department}
        </span>
      </div>
      <div className="model-grid">
        {templates.map((model) => (
          <button
            key={model.id}
            className="model-card"
            onClick={() => setSelected(model)}
          >
            <div className="model-card-head">
              <span className="model-icon">
                <TaskBlueprintIcon size={21} />
              </span>
              <span className="badge status-done">Ativo</span>
            </div>
            <h2>{model.title}</h2>
            <p>{model.description}</p>
            <span className="model-regime">
              {model.regime === "Todos" ? "Todos os regimes" : model.regime}
            </span>
            <div className="model-dates">
              <div>
                <span>Meta interna</span>
                <strong>
                  Dia {String(model.internalDay).padStart(2, "0")}
                </strong>
              </div>
              <div>
                <span>Prazo legal</span>
                <strong>Dia {String(model.legalDay).padStart(2, "0")}</strong>
              </div>
            </div>
            <footer>
              <span>
                <TaskBlueprintIcon size={14} />
                {getTemplateWorkflow(model).length} etapas
              </span>
              <span>
                <ReviewIcon size={14} />
                {model.requiresReview ? "Com conferência" : "Execução direta"}
              </span>
              <small>v{model.version}</small>
            </footer>
            {customizedCompanies(model, data.companies).length > 0 && (
              <span className="model-custom-count">
                {customizedCompanies(model, data.companies).length} com etapas
                próprias
              </span>
            )}
          </button>
        ))}
      </div>
      {!templates.length && <EmptyState />}
      <div className="info-box model-note">
        <RefreshIcon size={18} />
        <div>
          <strong>Geração sem duplicidade</strong>
          <p>
            Gerar novamente a mesma competência preserva as tarefas já
            existentes de cada empresa e modelo.
          </p>
        </div>
      </div>
      {editor && canManage && (
        <TemplateForm
          key={editor.template?.id ?? `new-${editor.department}`}
          department={editor.department}
          template={editor.template}
          models={data.templates.filter(
            (model) =>
              model.department === editor.department &&
              model.id !== editor.template?.id,
          )}
          onClose={() => setEditor(undefined)}
        />
      )}
      {companyEditor && canManage && (
        <CompanyWorkflowForm
          key={`${companyEditor.template.id}:${companyEditor.companyId ?? "new"}`}
          template={companyEditor.template}
          initialCompanyId={companyEditor.companyId}
          onClose={() => setCompanyEditor(undefined)}
        />
      )}
      <Modal
        open={generation && canManage}
        onOpenChange={(value) => {
          if (!busy) setGeneration(value);
        }}
        title="Gerar tarefas da competência"
        description="Revise o período e gere as rotinas vinculadas às empresas elegíveis."
      >
        <div className="generation-summary">
          <CompetenceSelect />
          <div>
            <strong>{eligible}</strong>
            <span>empresas ativas liberadas</span>
          </div>
          <div>
            <strong>
              {data.templates.filter((t) => t.department === department).length}
            </strong>
            <span>modelos de {department}</span>
          </div>
        </div>
        {blockedCompanies.size > 0 && (
          <p className="onboarding-generation-note">
            {blockedCompanies.size} empresas aguardam a conclusão da implantação
            antes de gerar rotinas. Tarefas existentes permanecem preservadas.
          </p>
        )}
        <div className="info-box">
          <ReviewIcon size={19} />
          <p>
            O processamento é idempotente: tarefas existentes serão mantidas,
            com seu histórico e versão de fluxo.
          </p>
        </div>
        {result && (
          <div className="generation-result">
            <CircleResult />
            <div>
              <strong>{result.created} novas tarefas geradas</strong>
              <p>{result.existing} tarefas já existiam e foram preservadas.</p>
              {!!result.blocked && (
                <p>{result.blocked} empresas aguardam a implantação.</p>
              )}
            </div>
          </div>
        )}
        <FormError message={error} />
        <footer className="form-actions">
          <button
            className="button button-white"
            onClick={() => setGeneration(false)}
            disabled={busy}
          >
            Fechar
          </button>
          <button
            className="button button-primary"
            onClick={() => void generate()}
            disabled={busy}
          >
            <Busy busy={busy}>
              {result ? "Verificar novamente" : "Gerar tarefas"}
            </Busy>
          </button>
        </footer>
      </Modal>
      <Modal
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(undefined);
        }}
        title={selected?.title ?? "Modelo"}
        description={selected?.description}
      >
        {selected && (
          <>
            <div className="model-detail">
              <span className="badge status-todo">
                Fluxo versão {selected.version}
              </span>
              <span className="model-regime">{selected.regime}</span>
              <h3 className="model-workflow-title">Etapas de execução</h3>
              <ol className="model-workflow-preview">
                {getTemplateWorkflow(selected).map((step, index) => (
                  <li key={step.id}>
                    <span className="workflow-step-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{step.title}</span>
                  </li>
                ))}
              </ol>
              <dl>
                <dt>Meta interna</dt>
                <dd>Dia {selected.internalDay} do mês seguinte</dd>
                <dt>Prazo legal</dt>
                <dd>Dia {selected.legalDay} do mês seguinte</dd>
                <dt>Evidência</dt>
                <dd>{selected.requiredDocument} · PDF ou XML</dd>
                <dt>Periodicidade</dt>
                <dd>Mensal</dd>
                <dt>Conferência</dt>
                <dd>
                  {selected.requiresReview
                    ? "Obrigatória por outra pessoa"
                    : "Execução direta"}
                </dd>
              </dl>
            </div>
            <p className="muted-note">
              As tarefas preservam a versão de fluxo associada na geração.
            </p>
            <CompanyWorkflowSection
              template={selected}
              canManage={canManage}
              onEdit={(companyId) => {
                setCompanyEditor({ template: selected, companyId });
                setSelected(undefined);
              }}
            />
            {canManage && (
              <footer className="form-actions">
                <button
                  className="button button-primary"
                  onClick={() => {
                    setEditor({
                      department: selected.department,
                      template: structuredClone(selected),
                    });
                    setSelected(undefined);
                  }}
                >
                  <EditIcon size={16} aria-hidden="true" />
                  Editar modelo e fluxo
                </button>
              </footer>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
function TemplateForm({
  department,
  template,
  models,
  onClose,
}: {
  department: Department;
  template?: TaskTemplate;
  models: TaskTemplate[];
  onClose: () => void;
}) {
  const { client, refresh, notify } = usePortal();
  const [steps, setSteps] = useState(() =>
    getTemplateWorkflow(template ?? { workflowSteps: undefined }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const body = {
      title: form.get("title"),
      description: form.get("description"),
      department,
      regime: form.get("regime"),
      internalDay: Number(form.get("internalDay")),
      legalDay: Number(form.get("legalDay")),
      requiresReview: form.get("requiresReview") === "on",
      requiredDocument: form.get("requiredDocument"),
      workflowSteps: steps,
    };
    const parsed = templateSchema.safeParse(body);
    const update = template
      ? updateTemplateSchema.safeParse({
          ...body,
          expectedVersion: template.version,
        })
      : undefined;
    const invalid = !parsed.success
      ? parsed
      : update && !update.success
        ? update
        : undefined;
    if (invalid) {
      const issue = invalid.error.issues[0];
      setError(
        issue?.path[0] === "workflowSteps"
          ? "Revise o fluxo: inclua de 1 a 30 etapas, com nomes de 2 a 120 caracteres."
          : (issue?.message ?? "Revise os campos."),
      );
      return;
    }
    if (!parsed.success) return;
    setBusy(true);
    setError("");
    try {
      if (template && update?.success)
        await client.updateTemplate(template.id, update.data);
      else await client.addTemplate(parsed.data);
      await refresh();
      onClose();
      notify(
        template
          ? "Modelo atualizado. O novo fluxo vale para novas tarefas; as existentes foram preservadas."
          : "Modelo criado com seu fluxo de execução.",
      );
    } catch (e) {
      setError(
        e instanceof DomainError && e.code === "CONFLICT"
          ? "Este modelo foi alterado por outra pessoa. Seu rascunho continua aqui. Anote as mudanças e reabra o modelo atualizado antes de salvar."
          : e instanceof Error
            ? e.message
            : "Não foi possível salvar.",
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
      title={template ? "Editar modelo e fluxo" : "Novo modelo de tarefa"}
      description={`${department}${template ? ` · versão ${template.version}` : " · rotina mensal"}`}
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="template-fields form-grid" disabled={busy}>
          <label className="full">
            Nome / sigla
            <input
              name="title"
              required
              minLength={2}
              maxLength={40}
              defaultValue={template?.title}
              placeholder="Ex.: Apuração de tributos"
            />
          </label>
          <label className="full">
            Descrição
            <input
              name="description"
              required
              minLength={3}
              maxLength={140}
              defaultValue={template?.description}
            />
          </label>
          <label className="full">
            Regime tributário
            <SelectField
              name="regime"
              aria-label="Regime tributário"
              defaultValue={template?.regime ?? "Todos"}
              disabled={busy}
            >
              <option>Todos</option>
              <option>Simples Nacional</option>
              <option>Lucro Presumido</option>
              <option>Lucro Real</option>
            </SelectField>
          </label>
          <label>
            Dia da meta interna
            <input
              name="internalDay"
              type="number"
              min={1}
              max={28}
              defaultValue={template?.internalDay ?? 15}
              required
            />
          </label>
          <label>
            Dia do prazo legal
            <input
              name="legalDay"
              type="number"
              min={1}
              max={28}
              defaultValue={template?.legalDay ?? 20}
              required
            />
          </label>
          <WorkflowEditor
            value={steps}
            onChange={setSteps}
            models={models}
            disabled={busy}
          />
          <label className="full">
            Evidência obrigatória
            <input
              name="requiredDocument"
              placeholder="Ex.: Guia de recolhimento"
              required
              minLength={3}
              maxLength={100}
              defaultValue={template?.requiredDocument}
            />
          </label>
          <label className="checkbox-field full">
            <input
              name="requiresReview"
              type="checkbox"
              defaultChecked={template?.requiresReview ?? true}
            />
            Exigir conferência por outra pessoa
          </label>
          {template ? (
            <label className="checkbox-field template-preservation full">
              <input type="checkbox" required />
              Aplicar a nova versão somente às novas tarefas. As tarefas já
              geradas mantêm etapas, progresso e histórico.
            </label>
          ) : (
            <p className="template-preservation full">
              O fluxo será copiado para as tarefas ao gerar a competência.
            </p>
          )}
          <p className="muted-note full">
            Prazos oficiais e regras de feriados ainda precisam de validação
            antes da operação real.
          </p>
          <div className="full">
            <FormError message={error} />
          </div>
          <footer className="form-actions full">
            <button
              className="button button-white"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy}>
              <Busy busy={busy}>
                {template ? "Salvar alterações" : "Criar modelo"}
              </Busy>
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}
function CircleResult() {
  return (
    <span className="result-check">
      <CheckIcon size={22} />
    </span>
  );
}
