import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import {
  availableReports,
  hasPermission,
  REPORT_DEFINITIONS,
  statusLabels,
} from "@apice/domain";
import type {
  ReportDateBasis,
  ReportFilters,
  ReportId,
  ReportResult,
  ReportSupports,
} from "@apice/domain";
import { usePortal } from "../../app/usePortal";
import { downloadBlob } from "../../shared/downloads";
import { reportPdf, reportWorkbook } from "./report-files";
import {
  CloseIcon,
  ExportFileIcon,
  LoadingIcon,
  PrintIcon,
  RefreshIcon,
} from "../../shared/icons";
import { EmptyState, PageHeading } from "../../shared/ui/components";
import { ReportCatalog } from "./ReportCatalog";
import { ReportFiltersForm } from "./ReportFiltersForm";
import { ReportResultView } from "./ReportResultView";
import { effectiveHidden } from "./report-columns";
import { categoryLabels, dateBasisLabels, reportIcons } from "./report-catalog";
import "./reports.css";

type Definition = (typeof REPORT_DEFINITIONS)[number];
const BASIS_ORDER: ReportDateBasis[] = [
  "competence",
  "internalDue",
  "legalDue",
  "completedAt",
  "startedAt",
  "recordedAt",
];
const FILTER_LABELS: Record<string, string> = {
  companyId: "empresa",
  ownerId: "responsável",
  regime: "regime",
  status: "situação",
  search: "busca",
  groupBy: "agrupamento",
};

// Drops empty values so the request carries only filters the user actually chose.
function clean(filters: ReportFilters): ReportFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  ) as unknown as ReportFilters;
}

const stable = (filters: ReportFilters) =>
  JSON.stringify(
    Object.entries(clean(filters)).sort(([a], [b]) => a.localeCompare(b)),
  );

// One form serves several reports: it offers the union of what they support.
function mergeDefinitions(items: Definition[]): Definition {
  const first = items[0]!;
  if (items.length === 1) return first;
  const bases = BASIS_ORDER.filter((basis) =>
    items.some((item) => item.supports.dateBases.includes(basis)),
  );
  const supports: ReportSupports = {
    dateBases: bases,
    company: items.some((item) => item.supports.company),
    owner: items.some((item) => item.supports.owner),
    regime: items.some((item) => item.supports.regime),
    status: items.some((item) => item.supports.status),
    search: items.some((item) => item.supports.search),
    scope: items.some((item) => item.supports.scope),
    group: items.some((item) => item.supports.group),
  };
  return {
    ...first,
    title: `${items.length} relatórios selecionados`,
    caption: items.map((item) => item.title).join(" · "),
    dateBasis: bases.includes("competence")
      ? "competence"
      : (bases[0] ?? first.dateBasis),
    supports,
  } as Definition;
}

// Shared filters become each report's own request; what a report cannot use is reported, never hidden.
function adapt(
  shared: ReportFilters,
  item: Definition,
): { filters: ReportFilters; skipped: string[] } {
  const skipped: string[] = [];
  const filters: ReportFilters = {
    id: item.id,
    scope: shared.scope,
    department: shared.department,
    dateBasis: item.dateBasis,
  };
  if (item.supports.dateBases.includes(shared.dateBasis)) {
    filters.dateBasis = shared.dateBasis;
    filters.competence = shared.competence;
    filters.from = shared.from;
    filters.to = shared.to;
  } else if (shared.competence || shared.from || shared.to) {
    skipped.push(
      `período por ${dateBasisLabels[shared.dateBasis].toLowerCase()}`,
    );
  }
  for (const [key, support] of [
    ["companyId", "company"],
    ["ownerId", "owner"],
    ["regime", "regime"],
    ["status", "status"],
    ["search", "search"],
    ["groupBy", "group"],
  ] as const) {
    if (!shared[key]) continue;
    if (item.supports[support])
      (filters as unknown as Record<string, unknown>)[key] = shared[key];
    else skipped.push(FILTER_LABELS[key]!);
  }
  return { filters: clean(filters), skipped };
}

function readHidden(id: ReportId): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`apice.reports.columns:${id}`) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export default function ReportsPage() {
  const { actor, client, data, department, competence, notify } = usePortal();
  const [params, setParams] = useSearchParams();
  const reports = availableReports(actor);
  const requested = (params.get("tipo") ?? "")
    .split(",")
    .filter((id) => reports.some((item) => item.id === id)) as ReportId[];
  // Nothing comes preselected: the user picks the report(s) in the catalog.
  const selection: ReportId[] = requested;
  const selectedDefinitions = selection
    .map((id) => reports.find((item) => item.id === id))
    .filter((item): item is Definition => !!item);
  const key = selection.join(",");
  const departments = actor.departments.map((id) => ({
    id,
    name: data.workspace.departments.find((item) => item.id === id)?.name ?? id,
  }));
  const definition = selectedDefinitions.length
    ? mergeDefinitions(selectedDefinitions)
    : undefined;
  const defaults = (item: Definition): ReportFilters => {
    const inScope = actor.departments.includes(department);
    return clean({
      id: item.id,
      scope: inScope && departments.length > 1 ? "department" : "all",
      department: inScope && departments.length > 1 ? department : undefined,
      dateBasis: item.dateBasis,
      competence:
        item.dateBasis === "competence" && item.supports.dateBases.length
          ? competence
          : undefined,
    });
  };
  const [applied, setApplied] = useState<{
    key: string;
    filters: ReportFilters;
  }>();
  const [draft, setDraft] = useState<{ key: string; filters: ReportFilters }>();
  const [hidden, setHidden] = useState<Partial<Record<ReportId, string[]>>>({});
  const [exportingPdf, setExportingPdf] = useState(false);
  const current =
    definition &&
    (applied?.key === key ? applied.filters : defaults(definition));
  const currentDraft =
    definition && (draft?.key === key ? draft.filters : current);
  const sections = selectedDefinitions.map((item) => ({
    item,
    ...adapt(current ?? defaults(item), item),
  }));
  const queries = useQueries({
    queries: sections.map((section) => ({
      queryKey: [
        "report",
        actor.tenantId,
        actor.userId,
        actor.permissions ?? "legacy",
        actor.departments,
        section.filters,
      ],
      queryFn: () => client.report(section.filters),
      retry: false,
    })),
  });
  const setSelection = (ids: ReportId[]) => {
    const next = new URLSearchParams(params);
    if (ids.length) next.set("tipo", ids.join(","));
    else next.delete("tipo");
    setParams(next, { replace: true });
  };
  const toggle = (id: ReportId) =>
    setSelection(
      selection.includes(id)
        ? selection.filter((item) => item !== id)
        : [...selection, id],
    );
  const selectMany = (ids: ReportId[], selected: boolean) =>
    setSelection(
      selected
        ? [...selection, ...ids.filter((id) => !selection.includes(id))]
        : selection.filter((id) => !ids.includes(id)),
    );
  if (!reports.length)
    return (
      <>
        <PageHeading title="Relatórios" />
        <EmptyState
          title="Nenhum relatório liberado"
          text="Peça ao administrador para conceder os relatórios de que você precisa."
        />
      </>
    );
  if (!definition || !current || !currentDraft)
    return (
      <>
        <PageHeading
          title="Relatórios"
          description="Escolha um ou vários relatórios, ajuste o recorte e as colunas e gere o resultado."
        />
        <div className="report-layout">
          <ReportCatalog
            reports={reports}
            selection={selection}
            onOpen={(id) => setSelection([id])}
            onToggle={toggle}
            onSelectMany={selectMany}
          />
          <section className="surface report-surface report-empty-choice">
            <h2>Como montar um relatório</h2>
            <ol className="report-empty-steps">
              <li>
                <b>1</b>
                <div>
                  Escolha no catálogo ao lado.{" "}
                  <span>
                    Clique no nome para abrir um, ou marque a caixa de vários
                    para combiná-los.
                  </span>
                </div>
              </li>
              <li>
                <b>2</b>
                <div>
                  Ajuste o recorte.{" "}
                  <span>Período, setor, empresa, pessoa e agrupamento.</span>
                </div>
              </li>
              <li>
                <b>3</b>
                <div>
                  Gere o resultado.{" "}
                  <span>Escolha as colunas e baixe em PDF ou Excel.</span>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </>
    );
  const hiddenFor = (id: ReportId) => hidden[id] ?? readHidden(id);
  const changeHidden = (id: ReportId, next: string[]) => {
    setHidden((currentHidden) => ({ ...currentHidden, [id]: next }));
    try {
      localStorage.setItem(`apice.reports.columns:${id}`, JSON.stringify(next));
    } catch {
      // Column choice is a convenience; the report still works without storage.
    }
  };
  const dirty = stable(currentDraft) !== stable(current);
  const fetching = queries.some((query) => query.isFetching);
  const results = queries.map((query) => query.data);
  const canUseResult =
    !fetching &&
    !dirty &&
    queries.every((query) => !query.isError) &&
    results.every((result) => !!result);
  const generate = () => {
    const next = clean(currentDraft);
    setApplied({ key, filters: next });
    setDraft({ key, filters: next });
    if (stable(next) === stable(current))
      queries.forEach((query) => void query.refetch());
  };
  const visibleResult = (result: ReportResult, id: ReportId): ReportResult => {
    const hiddenNow = effectiveHidden(result, hiddenFor(id));
    return {
      ...result,
      columns: result.columns.filter(
        (column) => !hiddenNow.includes(column.key),
      ),
    };
  };
  const fileSections = () =>
    sections.map((section, index) => ({
      title: section.item.title,
      result: visibleResult(results[index]!, section.item.id),
    }));
  const fileName = (extension: string) =>
    `apice-${sections.length > 1 ? "relatorio-combinado" : selection[0]}-${results[0]!.generatedAt.slice(0, 10)}.${extension}`;
  const total = () =>
    results.reduce((sum, result) => sum + (result?.total ?? 0), 0);
  // Real files: an .xlsx workbook (one sheet per report) and a paginated PDF,
  // both with the visible columns and every row of the current cut.
  const exportXlsx = () => {
    if (!canUseResult) return;
    if (downloadBlob(fileName("xlsx"), reportWorkbook(fileSections())))
      notify(`Planilha Excel gerada com ${total()} registros do recorte atual.`);
  };
  const exportPdf = async () => {
    if (!canUseResult || exportingPdf) return;
    setExportingPdf(true);
    try {
      if (downloadBlob(fileName("pdf"), await reportPdf(fileSections())))
        notify(`PDF gerado com ${total()} registros do recorte atual.`);
    } catch {
      notify("Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setExportingPdf(false);
    }
  };
  const single = selectedDefinitions.length === 1;
  const Icon = reportIcons[selectedDefinitions[0]!.id];
  return (
    <>
      <PageHeading
        title="Relatórios"
        description="Escolha um ou vários relatórios, ajuste o recorte e as colunas e gere o resultado."
      >
        <button
          type="button"
          className="button button-white"
          onClick={() => void exportPdf()}
          disabled={!canUseResult || exportingPdf}
        >
          <PrintIcon size={16} />
          {exportingPdf ? "Gerando PDF…" : "Baixar PDF"}
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={exportXlsx}
          disabled={!canUseResult}
        >
          <ExportFileIcon size={16} />
          Baixar Excel
        </button>
      </PageHeading>
      <div className="report-layout">
        <ReportCatalog
          reports={reports}
          selection={selection}
          onOpen={(id) => setSelection([id])}
          onToggle={toggle}
          onSelectMany={selectMany}
        />
        <section className="surface report-surface" aria-live="polite">
          <div className="surface-heading report-heading">
            <div>
              <span className="eyebrow">
                {single
                  ? categoryLabels[selectedDefinitions[0]!.category]
                  : "Relatório combinado"}
              </span>
              <h2>{definition.title}</h2>
              {single && <p className="report-caption">{definition.caption}</p>}
            </div>
            {single && <Icon size={24} />}
          </div>
          {!single && (
            <div className="report-selection">
              {selectedDefinitions.map((item) => {
                const ItemIcon = reportIcons[item.id];
                return (
                  <span key={item.id} className="report-selection-chip">
                    <ItemIcon size={14} />
                    {item.title}
                    <button
                      type="button"
                      aria-label={`Remover ${item.title}`}
                      onClick={() => toggle(item.id)}
                    >
                      <CloseIcon size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <p className="report-step report-step-inline">
            <b>2</b>Ajuste o recorte
          </p>
          <ReportFiltersForm
            key={key}
            definition={definition}
            draft={currentDraft}
            onChange={(filters) => setDraft({ key, filters })}
            onSubmit={generate}
            onReset={() => {
              setApplied(undefined);
              setDraft(undefined);
            }}
            dirty={dirty}
            data={data}
            departments={departments}
            fallbackCompetence={competence}
          />
          {!fetching && results.some(Boolean) && (
            <p className="report-recorte">
              {current.scope === "all"
                ? "Todos os departamentos autorizados"
                : departments.find((item) => item.id === current.department)
                    ?.name}
              {current.companyId && (
                <>
                  {" "}
                  · Empresa:{" "}
                  {data.companies.find((item) => item.id === current.companyId)
                    ?.name ?? current.companyId}
                </>
              )}
              {current.ownerId && (
                <>
                  {" "}
                  · Pessoa:{" "}
                  {data.users.find((item) => item.userId === current.ownerId)
                    ?.name ?? current.ownerId}
                </>
              )}
              {current.regime && <> · Regime: {current.regime}</>}
              {current.status && (
                <> · Situação: {statusLabels[current.status]}</>
              )}
              {current.search && <> · Busca: “{current.search}”</>}
            </p>
          )}
          <p className="report-step report-step-inline">
            <b>3</b>Resultado
          </p>
          {fetching ? (
            <div className="report-loading" role="status">
              <LoadingIcon className="spin" size={20} />
              {single
                ? "Gerando relatório..."
                : `Gerando ${sections.length} relatórios...`}
            </div>
          ) : (
            <div className="report-sections">
              {sections.map((section, index) => {
                const query = queries[index]!;
                if (query.isError)
                  return (
                    <EmptyState
                      key={section.item.id}
                      title={`Não foi possível gerar ${section.item.title}`}
                      text={
                        query.error instanceof Error
                          ? query.error.message
                          : "Tente novamente em instantes."
                      }
                      action={
                        <button
                          type="button"
                          className="button button-white"
                          onClick={() => void query.refetch()}
                        >
                          <RefreshIcon size={16} />
                          Tentar novamente
                        </button>
                      }
                    />
                  );
                return query.data ? (
                  <ReportResultView
                    key={`${section.item.id}:${stable(section.filters)}`}
                    result={query.data}
                    printAll={false}
                    canOpenTask={hasPermission(actor, "tasks.view")}
                    hidden={hiddenFor(section.item.id)}
                    onHiddenChange={(next) =>
                      changeHidden(section.item.id, next)
                    }
                    skipped={section.skipped}
                    onDrill={(row) => {
                      // A grouped row opens the same report listing that group's tasks.
                      const next = clean({
                        ...(current ?? defaults(section.item)),
                        groupBy: undefined,
                        ownerId: row.ownerId ?? current?.ownerId,
                        companyId: row.companyId ?? current?.companyId,
                      });
                      setApplied({ key, filters: next });
                      setDraft({ key, filters: next });
                    }}
                    heading={{
                      eyebrow: categoryLabels[section.item.category],
                      icon: reportIcons[section.item.id],
                    }}
                  />
                ) : null;
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
