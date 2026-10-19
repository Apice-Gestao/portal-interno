import { useState } from "react";
import {
  DomainError,
  getCompanyWorkflow,
  getTemplateWorkflow,
  isWorkflowOverrideOutdated,
} from "@apice/domain";
import type { Company, TaskTemplate, WorkflowStep } from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import {
  AddIcon,
  EditIcon,
  RefreshIcon,
  DeadlineWarningIcon,
} from "../../shared/icons";
import { SelectField } from "../../shared/ui/SelectField";
import { Busy, FormError, Modal } from "../../shared/ui/components";
import { WorkflowEditor } from "./WorkflowEditor";
import { applicableCompanies, customizedCompanies } from "./company-workflows";

// Section inside the template detail: companies with their own steps for this template,
// warning when the general template changed after the customization (17/10/2026).
export function CompanyWorkflowSection({
  template,
  canManage,
  onEdit,
}: {
  template: TaskTemplate;
  canManage: boolean;
  onEdit: (companyId?: string) => void;
}) {
  const { data, client, refresh, notify, actor } = usePortal();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const customized = customizedCompanies(template, data.companies);
  const userName = (id: string) =>
    id === actor.userId
      ? "você"
      : (data.users.find((user) => user.userId === id)?.name ?? "gestor");

  async function act(company: Company, action: "acknowledge" | "reset") {
    setBusy(`${company.id}:${action}`);
    setError("");
    try {
      await client.setCompanyWorkflow({
        companyId: company.id,
        templateId: template.id,
        action,
        expectedRevision: company.revision ?? 1,
        // The version shown in the warning is the one being kept.
        expectedTemplateVersion: template.version,
      });
      await refresh();
      notify(
        action === "reset"
          ? `${company.name} volta a seguir o modelo geral nas próximas tarefas.`
          : `${company.name} mantém as etapas próprias.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section
      className="company-workflows"
      aria-labelledby="company-workflows-title"
    >
      <div className="company-workflows-head">
        <h3 id="company-workflows-title">Etapas por empresa</h3>
        <p>
          {customized.length
            ? `${customized.length} ${customized.length === 1 ? "empresa usa" : "empresas usam"} etapas próprias neste modelo.`
            : "Todas as empresas seguem o modelo geral."}
        </p>
      </div>
      {customized.length > 0 && (
        <ul className="company-workflow-list">
          {customized.map((company) => {
            const override = company.workflowOverrides![template.id]!;
            const outdated = isWorkflowOverrideOutdated(template, company);
            return (
              <li key={company.id} className={outdated ? "is-outdated" : ""}>
                <div className="company-workflow-info">
                  <strong>{company.name}</strong>
                  <span>
                    {override.steps.length} etapas · ajustado por{" "}
                    {userName(override.updatedBy)} em{" "}
                    {new Date(override.updatedAt).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </span>
                  {outdated && (
                    <span className="company-workflow-warning" role="status">
                      <DeadlineWarningIcon size={14} aria-hidden="true" />O
                      modelo geral mudou (v{override.baseVersion} → v
                      {template.version}). Revise se quer incorporar.
                    </span>
                  )}
                </div>
                {canManage && (
                  <div className="company-workflow-actions">
                    {outdated && (
                      <button
                        type="button"
                        className="button button-white"
                        disabled={!!busy}
                        onClick={() => void act(company, "acknowledge")}
                      >
                        <Busy busy={busy === `${company.id}:acknowledge`}>
                          Manter minha versão
                        </Busy>
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-white"
                      disabled={!!busy}
                      onClick={() => onEdit(company.id)}
                    >
                      <EditIcon size={14} aria-hidden="true" />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="button button-white"
                      disabled={!!busy}
                      onClick={() => void act(company, "reset")}
                    >
                      <Busy busy={busy === `${company.id}:reset`}>
                        <RefreshIcon size={14} aria-hidden="true" />
                        Voltar ao modelo geral
                      </Busy>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FormError message={error} />
      {canManage && (
        <button
          type="button"
          className="button button-white company-workflow-add"
          onClick={() => onEdit()}
        >
          <AddIcon size={16} aria-hidden="true" />
          Personalizar etapas para uma empresa
        </button>
      )}
    </section>
  );
}

// Modal with the visual editor for one company's steps.
export function CompanyWorkflowForm({
  template,
  initialCompanyId,
  onClose,
}: {
  template: TaskTemplate;
  initialCompanyId?: string;
  onClose: () => void;
}) {
  const { data, client, refresh, notify } = usePortal();
  const companies = applicableCompanies(template, data.companies);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const company = data.companies.find((item) => item.id === companyId);
  const [steps, setSteps] = useState<WorkflowStep[]>(() =>
    company
      ? getCompanyWorkflow(template, company)
      : getTemplateWorkflow(template),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Template version the manager is looking at; a newer one saved meanwhile
  // must be seen before these steps are stored (R08).
  const [reviewedVersion, setReviewedVersion] = useState(template.version);

  function choose(id: string) {
    setCompanyId(id);
    setReviewedVersion(template.version);
    const next = data.companies.find((item) => item.id === id);
    setSteps(
      next ? getCompanyWorkflow(template, next) : getTemplateWorkflow(template),
    );
  }

  async function save() {
    if (!company) return setError("Escolha a empresa.");
    if (steps.some((step) => step.title.trim().length < 2))
      return setError("Descreva todas as etapas (mínimo de 2 caracteres).");
    setBusy(true);
    setError("");
    try {
      await client.setCompanyWorkflow({
        companyId: company.id,
        templateId: template.id,
        action: "save",
        workflowSteps: steps.map((step) => ({
          ...step,
          title: step.title.trim(),
        })),
        expectedRevision: company.revision ?? 1,
        expectedTemplateVersion: reviewedVersion,
      });
      await refresh();
      notify(
        `Etapas próprias de ${company.name} salvas. Valem para as próximas tarefas geradas.`,
      );
      onClose();
    } catch (e) {
      // The draft stays; saving again confirms the newer template was seen.
      if (e instanceof DomainError && e.code === "TEMPLATE_CHANGED")
        setReviewedVersion(template.version);
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`Etapas por empresa · ${template.title}`}
      description="A empresa passa a usar estas etapas nas próximas tarefas geradas deste modelo. Tarefas já abertas não mudam."
    >
      <div className="company-workflow-form">
        <SelectField
          label="Empresa"
          aria-label="Empresa"
          value={companyId}
          onValueChange={choose}
          disabled={busy || !!initialCompanyId}
          placeholder="Escolha a empresa"
          options={companies.map((item) => ({
            value: item.id,
            label: item.workflowOverrides?.[template.id]
              ? `${item.name} · personalizada`
              : item.name,
          }))}
        />
        {company && (
          <WorkflowEditor
            value={steps}
            onChange={setSteps}
            models={data.templates.filter(
              (model) =>
                model.department === template.department &&
                model.id !== template.id,
            )}
            disabled={busy}
            heading={`Etapas de ${company.name}`}
            description="Arraste pela alça ou use as setas para ordenar. O “+” insere uma etapa no ponto escolhido."
          />
        )}
      </div>
      <FormError message={error} />
      <footer className="form-actions">
        <button
          type="button"
          className="button button-white"
          onClick={onClose}
          disabled={busy}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => void save()}
          disabled={busy || !company}
        >
          <Busy busy={busy}>Salvar etapas da empresa</Busy>
        </button>
      </footer>
    </Modal>
  );
}
