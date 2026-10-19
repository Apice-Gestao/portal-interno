import { useState } from "react";
import type {
  REPORT_DEFINITIONS,
  ReportCategory,
  ReportId,
} from "@apice/domain";
import {
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  SecurityIcon,
} from "../../shared/icons";
import { SelectField } from "../../shared/ui/SelectField";
import { categoryLabels, normalizeSearch, reportIcons } from "./report-catalog";

type Definition = (typeof REPORT_DEFINITIONS)[number];

// Essentials stay visible; only one other category is open at a time so the list stays short.
// Clicking a name opens that report alone; the check box adds it to a combined report.
export function ReportCatalog({
  reports,
  selection,
  onOpen,
  onToggle,
  onSelectMany,
}: {
  reports: Definition[];
  selection: ReportId[];
  onOpen: (id: ReportId) => void;
  onToggle: (id: ReportId) => void;
  onSelectMany: (ids: ReportId[], selected: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const firstCategory = reports.find(
    (item) => item.id === selection[0],
  )?.category;
  const [open, setOpen] = useState<ReportCategory | undefined>(
    firstCategory && firstCategory !== "essential" ? firstCategory : undefined,
  );
  const term = normalizeSearch(search.trim());
  const matches = term
    ? reports.filter((item) =>
        normalizeSearch(`${item.title} ${item.caption}`).includes(term),
      )
    : reports;
  const categories = (Object.keys(categoryLabels) as ReportCategory[]).filter(
    (category) => matches.some((item) => item.category === category),
  );
  return (
    <>
      <aside className="report-catalog" aria-label="Relatórios disponíveis">
        <p className="report-step">
          <b>1</b>Escolha o relatório
        </p>
        <label className="search-field report-catalog-search">
          <SearchIcon size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar relatório..."
            aria-label="Buscar relatório"
          />
        </label>
        {categories.map((category) => {
          const items = matches.filter((item) => item.category === category);
          const expanded =
            category === "essential" || !!term || open === category;
          const chosen = items.filter((item) => selection.includes(item.id));
          const allChosen = chosen.length === items.length;
          return (
            <section key={category} className="report-category">
              {category === "essential" ? (
                <span className="eyebrow">{categoryLabels[category]}</span>
              ) : (
                <button
                  type="button"
                  className="report-category-toggle"
                  aria-expanded={expanded}
                  onClick={() =>
                    setOpen((current) =>
                      current === category ? undefined : category,
                    )
                  }
                  disabled={!!term}
                >
                  <span>{categoryLabels[category]}</span>
                  {chosen.length > 0 && (
                    <em className="report-category-chosen">
                      {chosen.length} marcado{chosen.length > 1 ? "s" : ""}
                    </em>
                  )}
                  <small>
                    {items.length}{" "}
                    {items.length === 1 ? "relatório" : "relatórios"}
                  </small>
                  <ChevronDownIcon size={13} />
                </button>
              )}
              {expanded && (
                <>
                  <button
                    type="button"
                    className="report-select-all"
                    onClick={() =>
                      onSelectMany(
                        items.map((item) => item.id),
                        !allChosen,
                      )
                    }
                  >
                    {allChosen ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                  {items.map((item) => {
                    const Icon = reportIcons[item.id];
                    const checked = selection.includes(item.id);
                    const only = checked && selection.length === 1;
                    return (
                      <div
                        key={item.id}
                        className={`report-option ${checked ? "active" : ""} ${only ? "only" : ""}`}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`Incluir ${item.title} no relatório`}
                          className="report-option-check"
                          onClick={() => onToggle(item.id)}
                        >
                          {checked && <CheckIcon size={12} />}
                        </button>
                        <button
                          type="button"
                          className="report-option-open"
                          aria-current={only ? "true" : undefined}
                          onClick={() => onOpen(item.id)}
                        >
                          <Icon size={18} />
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.caption}</small>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          );
        })}
        {!categories.length && (
          <p className="report-catalog-empty">Nenhum relatório encontrado.</p>
        )}
        <div className="report-scope">
          <SecurityIcon size={17} />
          <p>
            Só aparecem os relatórios liberados para sua conta. Os resultados
            respeitam seus departamentos e permissões.
          </p>
        </div>
      </aside>
      <div className="report-catalog-compact">
        <SelectField
          label="Relatório"
          aria-label="Escolher relatório"
          value={selection[0]}
          onValueChange={(value) => onOpen(value as ReportId)}
          options={reports.map((item) => ({
            value: item.id,
            label: `${categoryLabels[item.category]} · ${item.title}`,
          }))}
        />
      </div>
    </>
  );
}
