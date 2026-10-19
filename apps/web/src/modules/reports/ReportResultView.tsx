import { useState } from "react";
import { Link } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import type { ReportResult, ReportRow } from "@apice/domain";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  BoardIcon as ColumnsIcon,
} from "../../shared/icons";
import { EmptyState } from "../../shared/ui/components";
import { effectiveHidden } from "./report-columns";

const PAGE_SIZE = 25;
const linkKeys = ["task", "company"];

function taskLink(row: ReportRow) {
  const params = new URLSearchParams({ task: row.taskId! });
  if (row.department) params.set("department", row.department);
  if (row.competence) params.set("competence", row.competence);
  return `/tarefas?${params.toString()}`;
}

function Cell({
  row,
  column,
  linkKey,
  canOpenTask,
  onDrill,
}: {
  row: ReportRow;
  column: string;
  linkKey?: string;
  canOpenTask: boolean;
  onDrill?: (row: ReportRow) => void;
}) {
  const value = row.cells[column] ?? "";
  if (column === "group" && onDrill && (row.ownerId || row.companyId))
    return (
      <button
        type="button"
        className="report-row-link report-drill"
        onClick={() => onDrill(row)}
        title="Ver as atividades deste grupo"
      >
        {value}
      </button>
    );
  const tone = row.tones?.[column];
  if (tone && value !== "" && value !== "—")
    return <span className={`report-badge report-tone-${tone}`}>{value}</span>;
  if (column === linkKey && row.taskId && canOpenTask)
    return (
      <Link className="report-row-link" to={taskLink(row)}>
        {value}
      </Link>
    );
  return <>{value}</>;
}

// Lets the user keep only the columns that matter; at least one stays visible.
function ColumnPicker({
  result,
  hidden,
  onHiddenChange,
}: {
  result: ReportResult;
  hidden: string[];
  onHiddenChange: (hidden: string[]) => void;
}) {
  const active = effectiveHidden(result, hidden);
  const visible = result.columns.length - active.length;
  return (
    <Popover.Root>
      <Popover.Trigger className="button button-white report-columns-trigger">
        <ColumnsIcon size={15} />
        Colunas {visible}/{result.columns.length}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="report-columns"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <div className="report-columns-heading">
            <strong>Colunas exibidas</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => onHiddenChange([])}
              disabled={!active.length}
            >
              Mostrar todas
            </button>
          </div>
          {result.columns.map((column) => {
            const shown = !active.includes(column.key);
            return (
              <button
                key={column.key}
                type="button"
                role="checkbox"
                aria-checked={shown}
                className="report-column-option"
                disabled={shown && visible === 1}
                onClick={() =>
                  onHiddenChange(
                    shown
                      ? [...hidden, column.key]
                      : hidden.filter((key) => key !== column.key),
                  )
                }
              >
                <span className="report-column-box">
                  {shown && <CheckIcon size={11} />}
                </span>
                {column.label}
              </button>
            );
          })}
          <p>Vale para a tela, o CSV e a impressão.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// One report section. `printAll` renders every row so printing never stops at the current page.
export function ReportResultView({
  result,
  printAll,
  canOpenTask,
  hidden,
  onHiddenChange,
  skipped,
  heading,
  onDrill,
}: {
  result: ReportResult;
  printAll: boolean;
  canOpenTask: boolean;
  hidden: string[];
  onHiddenChange: (hidden: string[]) => void;
  skipped: string[];
  heading?: { eyebrow: string; icon: typeof ColumnsIcon };
  onDrill?: (row: ReportRow) => void;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = printAll
    ? result.rows
    : result.rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const shownHidden = effectiveHidden(result, hidden);
  const columns = result.columns.filter(
    (column) => !shownHidden.includes(column.key),
  );
  const linkKey = linkKeys.find((key) =>
    columns.some((column) => column.key === key),
  );
  const generated = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(result.generatedAt));
  const Icon = heading?.icon;
  return (
    <article className="report-section">
      <header className="report-section-heading">
        {Icon && (
          <span className="report-section-icon">
            <Icon size={20} />
          </span>
        )}
        <div>
          {heading && <span className="eyebrow">{heading.eyebrow}</span>}
          <h3>{result.title}</h3>
          <p>{result.dateLabel}</p>
        </div>
        <span className="report-section-count">
          <strong>{result.total}</strong>
          {result.total === 1 ? "registro" : "registros"}
        </span>
        <ColumnPicker
          result={result}
          hidden={hidden}
          onHiddenChange={onHiddenChange}
        />
      </header>
      {skipped.length > 0 && (
        <p className="report-skipped">
          Não aplicado neste relatório: {skipped.join(", ")}.
        </p>
      )}
      {result.rows.length ? (
        <>
          <div className="table-wrap report-table-wrap">
            <table className="data-table report-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td key={column.key}>
                        <Cell
                          row={row}
                          column={column.key}
                          linkKey={linkKey}
                          canOpenTask={canOpenTask}
                          onDrill={onDrill}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="table-footer report-footer">
            <span>
              {printAll
                ? `${result.rows.length} registros`
                : `${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, result.rows.length)} de ${result.rows.length} registros`}
            </span>
            {pageCount > 1 && !printAll && (
              <div className="pagination">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                >
                  <ChevronLeftIcon size={15} />
                </button>
                <span>
                  {current} / {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Próxima página"
                  disabled={current === pageCount}
                  onClick={() => setPage(current + 1)}
                >
                  <ChevronRightIcon size={15} />
                </button>
              </div>
            )}
            <span>
              <ClockIcon size={14} />
              Gerado em {generated}
            </span>
          </footer>
        </>
      ) : (
        <EmptyState
          title="Nenhum registro neste recorte"
          text="Ajuste o período ou os filtros e gere o relatório novamente."
        />
      )}
      {result.notes.length > 0 && (
        <ul className="report-notes">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
