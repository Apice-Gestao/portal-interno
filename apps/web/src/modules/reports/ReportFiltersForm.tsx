import type { FormEvent } from "react";
import { statusLabels } from "@apice/domain";
import type {
  REPORT_DEFINITIONS,
  ReportDateBasis,
  ReportFilters,
  Snapshot,
  TaskStatus,
} from "@apice/domain";
import { AnalyticsIcon, CloseIcon, SearchIcon } from "../../shared/icons";
import { CompetencePicker, DatePicker } from "../../shared/ui/CompetencePicker";
import { SelectField } from "../../shared/ui/SelectField";
import { dateBasisLabels } from "./report-catalog";

type Definition = (typeof REPORT_DEFINITIONS)[number];
const regimes = ["Simples Nacional", "Lucro Presumido", "Lucro Real"];

// Only filters the selected report supports are rendered, so none is silently ignored.
export function ReportFiltersForm({
  definition,
  draft,
  onChange,
  onSubmit,
  onReset,
  dirty,
  data,
  departments,
  fallbackCompetence,
}: {
  definition: Definition;
  draft: ReportFilters;
  onChange: (next: ReportFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
  dirty: boolean;
  data: Snapshot;
  departments: { id: string; name: string }[];
  fallbackCompetence: string;
}) {
  const supports = definition.supports;
  const set = (patch: Partial<ReportFilters>) =>
    onChange({ ...draft, ...patch });
  const setBasis = (basis: ReportDateBasis) =>
    set(
      basis === "competence"
        ? {
            dateBasis: basis,
            from: undefined,
            to: undefined,
            competence: fallbackCompetence,
          }
        : { dateBasis: basis, competence: undefined },
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const companies = [...data.companies].sort((left, right) =>
    left.name.localeCompare(right.name, "pt-BR"),
  );
  const users = [...data.users].sort((left, right) =>
    left.name.localeCompare(right.name, "pt-BR"),
  );
  const ownerLabel =
    definition.id === "activity"
      ? "Autor"
      : definition.id === "company-changes"
        ? "Proposta por"
        : definition.category === "access"
          ? "Colaborador"
          : "Responsável";
  return (
    <form className="report-filters" onSubmit={submit}>
      {supports.dateBases.length > 0 && (
        <fieldset className="report-filter-group">
          <legend>Período</legend>
          <p className="report-filter-hint">Qual data define o recorte.</p>
          <div className="report-filter-grid">
            {supports.dateBases.length > 1 && (
              <label>
                Recorte por
                <SelectField
                  aria-label="Base de datas"
                  value={draft.dateBasis}
                  onValueChange={(value) => setBasis(value as ReportDateBasis)}
                >
                  {supports.dateBases.map((basis) => (
                    <option key={basis} value={basis}>
                      {dateBasisLabels[basis]}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            {supports.dateBases.length > 0 &&
              (draft.dateBasis === "competence" ? (
                <div className="report-filter-field">
                  <span>Competência</span>
                  {draft.competence ? (
                    <div className="report-competence">
                      <CompetencePicker
                        value={draft.competence}
                        onValueChange={(competence) => set({ competence })}
                      />
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => set({ competence: undefined })}
                      >
                        Todas
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="report-all-competences"
                      onClick={() => set({ competence: fallbackCompetence })}
                    >
                      Todas as competências · escolher mês
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <label>
                    {dateBasisLabels[draft.dateBasis]} de
                    <DatePicker
                      label={`${dateBasisLabels[draft.dateBasis]} — início`}
                      placeholder="Desde o início"
                      value={draft.from}
                      onValueChange={(from) => set({ from })}
                    />
                  </label>
                  <label>
                    até
                    <DatePicker
                      label={`${dateBasisLabels[draft.dateBasis]} — fim`}
                      placeholder="Até hoje"
                      value={draft.to}
                      onValueChange={(to) => set({ to })}
                    />
                  </label>
                </>
              ))}
          </div>
        </fieldset>
      )}
      {(departments.length > 1 ||
        supports.company ||
        supports.owner ||
        supports.regime ||
        supports.status) && (
        <fieldset className="report-filter-group">
          <legend>Quem e o quê</legend>
          <p className="report-filter-hint">
            Limite por setor, empresa, pessoa ou situação.
          </p>
          <div className="report-filter-grid">
            {departments.length > 1 && (
              <label>
                Abrangência
                <SelectField
                  aria-label="Abrangência do relatório"
                  value={
                    draft.scope === "all" ? "all" : (draft.department ?? "")
                  }
                  onValueChange={(value) =>
                    set(
                      value === "all"
                        ? { scope: "all", department: undefined }
                        : { scope: "department", department: value },
                    )
                  }
                >
                  <option value="all">Todos os meus departamentos</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            {supports.company && companies.length > 0 && (
              <label>
                Empresa
                <SelectField
                  aria-label="Filtrar empresa"
                  value={draft.companyId ?? ""}
                  onValueChange={(value) =>
                    set({ companyId: value || undefined })
                  }
                >
                  <option value="">Todas as empresas</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.code ? `${company.code} · ` : ""}
                      {company.name}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            {supports.owner && users.length > 1 && (
              <label>
                {ownerLabel}
                <SelectField
                  aria-label={`Filtrar ${ownerLabel.toLocaleLowerCase("pt-BR")}`}
                  value={draft.ownerId ?? ""}
                  onValueChange={(value) =>
                    set({ ownerId: value || undefined })
                  }
                >
                  <option value="">Todos</option>
                  {users.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            {supports.regime && (
              <label>
                Regime cadastral atual
                <SelectField
                  aria-label="Filtrar regime"
                  value={draft.regime ?? ""}
                  onValueChange={(value) => set({ regime: value || undefined })}
                >
                  <option value="">Todos os regimes</option>
                  {regimes.map((regime) => (
                    <option key={regime} value={regime}>
                      {regime}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            {supports.status && (
              <label>
                Situação
                <SelectField
                  aria-label="Filtrar situação"
                  value={draft.status ?? ""}
                  onValueChange={(value) =>
                    set({
                      status: (value || undefined) as TaskStatus | undefined,
                    })
                  }
                >
                  <option value="">Todas as situações</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
          </div>
        </fieldset>
      )}
      {(supports.group || supports.search) && (
        <fieldset className="report-filter-group">
          <legend>Apresentação</legend>
          <p className="report-filter-hint">Como o resultado é organizado.</p>
          <div className="report-filter-grid">
            {supports.group && (
              <label>
                Agrupar por
                <SelectField
                  aria-label="Agrupar resultado"
                  value={draft.groupBy ?? "task"}
                  onValueChange={(value) =>
                    set({
                      groupBy:
                        value === "task"
                          ? undefined
                          : (value as ReportFilters["groupBy"]),
                    })
                  }
                >
                  <option value="task">Tarefa</option>
                  <option value="owner">Colaborador</option>
                  <option value="company">Empresa</option>
                </SelectField>
              </label>
            )}
            {supports.search && (
              <label className="report-filter-search">
                Buscar no resultado
                <span className="search-field">
                  <SearchIcon size={16} />
                  <input
                    value={draft.search ?? ""}
                    maxLength={200}
                    placeholder="Empresa, atividade, nome..."
                    onChange={(event) =>
                      set({ search: event.target.value || undefined })
                    }
                  />
                </span>
              </label>
            )}
          </div>
        </fieldset>
      )}
      <div className="report-filter-actions">
        {dirty && (
          <span className="report-dirty" role="status">
            Filtros alterados — gere o relatório para aplicar.
          </span>
        )}
        <button type="button" className="text-button" onClick={onReset}>
          <CloseIcon size={14} />
          Restaurar padrão
        </button>
        <button type="submit" className="button button-primary">
          <AnalyticsIcon size={16} />
          Gerar relatório
        </button>
      </div>
    </form>
  );
}
