import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "../icons";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./competence-picker.css";

const months = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"];
const TURN_MS = 650;
// The calendar starts in 2000 at the user's request (17/10/2026).
const MIN_YEAR = 2000;
const MAX_YEAR = 9999;
const blockStart = (year: number) =>
  MIN_YEAR + Math.floor((year - MIN_YEAR) / 12) * 12;

const pad = (value: number, size = 2) => String(value).padStart(size, "0");
const format = (year: number, month: number) =>
  `${pad(year, 4)}-${pad(month + 1)}`;
const parse = (value: string) => ({
  year: Number(value.slice(0, 4)),
  month: Number(value.slice(5, 7)) - 1,
});
const shift = (value: string, delta: number) => {
  const { year, month } = parse(value);
  const total = year * 12 + month + delta;
  return format(Math.floor(total / 12), ((total % 12) + 12) % 12);
};
const daysIn = (year: number, month: number) => {
  if (month !== 1) return new Date(Date.UTC(2001, month + 1, 0)).getUTCDate();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return leap ? 29 : 28;
};
const firstWeekday = (year: number, month: number) => {
  const first = new Date(Date.UTC(2000, month, 1));
  // Date.UTC maps years 0–99 to the 1900s, so the year is set explicitly.
  first.setUTCFullYear(year);
  return first.getUTCDay();
};
const todayIso = () => {
  const now = new Date();
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const brazilianDate = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Panel = "days" | "months" | "years";

// One calendar sheet. Only the sheet on top of the pad is interactive; animated copies are decorative.
function CalendarSheet({
  value,
  className = "",
  interactive = false,
  panel = "days",
  selectedDay,
  daySelectable = false,
  onPanel,
  onDay,
  onMonth,
  onYear,
}: {
  value: string;
  className?: string;
  interactive?: boolean;
  panel?: Panel;
  selectedDay?: string;
  daySelectable?: boolean;
  onPanel?: (panel: Panel) => void;
  onDay?: (day: string) => void;
  onMonth?: (month: number) => void;
  onYear?: (year: number) => void;
}) {
  const { year, month } = parse(value);
  const [decade, setDecade] = useState(blockStart(year));
  const today = todayIso();
  const offset = firstWeekday(year, month);
  const total = daysIn(year, month);
  const headMonth = interactive ? (
    <button
      type="button"
      className="calendar-sheet-pick"
      aria-expanded={panel === "months"}
      onClick={() => onPanel?.(panel === "months" ? "days" : "months")}
    >
      {months[month]}
      <ChevronDownIcon size={14} aria-hidden="true" />
    </button>
  ) : (
    <strong>{months[month]}</strong>
  );
  const headYear = interactive ? (
    <button
      type="button"
      className="calendar-sheet-pick calendar-sheet-year"
      aria-expanded={panel === "years"}
      onClick={() => {
        setDecade(blockStart(year));
        onPanel?.(panel === "years" ? "days" : "years");
      }}
    >
      {pad(year, 4)}
      <ChevronDownIcon size={12} aria-hidden="true" />
    </button>
  ) : (
    <span>{pad(year, 4)}</span>
  );
  let body: ReactNode;
  if (interactive && panel === "months") {
    body = (
      <div className="calendar-picklist" role="listbox" aria-label="Meses">
        {months.map((name, index) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={index === month}
            onClick={() => onMonth?.(index)}
          >
            {name.slice(0, 3)}
          </button>
        ))}
      </div>
    );
  } else if (interactive && panel === "years") {
    body = (
      <div className="calendar-yearlist">
        <div className="calendar-yearlist-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Anos anteriores"
            disabled={decade <= MIN_YEAR}
            onClick={() => setDecade(Math.max(MIN_YEAR, decade - 12))}
          >
            <ChevronLeftIcon size={15} />
          </button>
          <span>
            {pad(decade, 4)}–{pad(Math.min(MAX_YEAR, decade + 11), 4)}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Próximos anos"
            disabled={decade + 12 > MAX_YEAR}
            onClick={() => setDecade(decade + 12)}
          >
            <ChevronRightIcon size={15} />
          </button>
        </div>
        <div className="calendar-picklist" role="listbox" aria-label="Anos">
          {Array.from({ length: 12 }, (_, index) => decade + index)
            .filter((item) => item >= MIN_YEAR && item <= MAX_YEAR)
            .map((item) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={item === year}
                onClick={() => onYear?.(item)}
              >
                {pad(item, 4)}
              </button>
            ))}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="calendar-sheet-days">
        {weekdays.map((day, index) => (
          <span key={index} className="calendar-weekday">
            {day}
          </span>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: total }, (_, index) => {
          const iso = `${value}-${pad(index + 1)}`;
          const classes = [
            iso === today ? "is-today" : "",
            iso === selectedDay ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return interactive && daySelectable ? (
            <button
              key={iso}
              type="button"
              className={classes}
              aria-pressed={iso === selectedDay}
              aria-label={brazilianDate(iso)}
              onClick={() => onDay?.(iso)}
            >
              {index + 1}
            </button>
          ) : (
            <span key={iso} className={classes}>
              {index + 1}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div
      className={`calendar-sheet ${className}`}
      aria-hidden={interactive ? undefined : true}
    >
      <div className="calendar-sheet-head">
        {headMonth}
        {headYear}
      </div>
      <div className="calendar-sheet-competence">
        {selectedDay?.startsWith(value)
          ? `Dia ${brazilianDate(selectedDay)}`
          : `Competência ${pad(month + 1)}/${pad(year, 4)}`}
      </div>
      {body}
    </div>
  );
}

// Shared tear-off pad: moving forward tears the sheet away, moving back puts it back on the pad.
function TearOffPad({
  month,
  onMonthChange,
  selectedDay,
  daySelectable,
  onDay,
}: {
  month: string;
  onMonthChange: (next: string) => void;
  selectedDay?: string;
  daySelectable: boolean;
  onDay: (day: string) => void;
}) {
  const [shown, setShown] = useState(month);
  const [panel, setPanel] = useState<Panel>("days");
  const [turn, setTurn] = useState<{
    from: string;
    direction: "forward" | "back";
    key: number;
  }>();
  const [yearDraft, setYearDraft] = useState(month.slice(0, 4));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Keep the pad in sync when the parent moves the month (e.g. the year field).
  if (month !== shown && !turn) {
    setShown(month);
    setYearDraft(month.slice(0, 4));
  }
  const current = parse(month);
  function go(next: string) {
    const { year } = parse(next);
    if (next === month || year < MIN_YEAR || year > MAX_YEAR) return;
    window.clearTimeout(timer.current);
    setTurn({
      from: month,
      direction: next > month ? "forward" : "back",
      key: Date.now(),
    });
    setShown(next);
    setYearDraft(next.slice(0, 4));
    onMonthChange(next);
    timer.current = window.setTimeout(() => setTurn(undefined), TURN_MS);
  }
  function commitYear() {
    const next = Number(yearDraft);
    if (/^\d{1,4}$/.test(yearDraft) && next >= MIN_YEAR && next <= MAX_YEAR)
      go(format(next, current.month));
    else setYearDraft(pad(current.year, 4));
  }
  return (
    <>
      <div className="calendar-stage">
        <button
          type="button"
          className="calendar-turn"
          aria-label="Mês anterior"
          onClick={() => go(shift(month, -1))}
          disabled={month <= `${MIN_YEAR}-01`}
        >
          <ChevronLeftIcon size={20} />
        </button>
        <div className="calendar-pad">
          <div className="calendar-binding" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="calendar-stack" aria-hidden="true" />
          <div className="calendar-pages">
            {turn?.direction === "back" && <CalendarSheet value={turn.from} />}
            <CalendarSheet
              key={turn?.direction === "back" ? turn.key : "current"}
              value={month}
              className={turn?.direction === "back" ? "is-returning" : ""}
              interactive
              panel={panel}
              selectedDay={selectedDay}
              daySelectable={daySelectable}
              onPanel={setPanel}
              onDay={onDay}
              onMonth={(index) => {
                setPanel("days");
                go(format(current.year, index));
              }}
              onYear={(year) => {
                setPanel("days");
                go(format(year, current.month));
              }}
            />
            {turn?.direction === "forward" && (
              <CalendarSheet
                key={turn.key}
                value={turn.from}
                className="is-tearing"
              />
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {months[current.month]} de {current.year}
          </p>
        </div>
        <button
          type="button"
          className="calendar-turn"
          aria-label="Próximo mês"
          onClick={() => go(shift(month, 1))}
          disabled={month >= `${MAX_YEAR}-12`}
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>
      <div className="competence-year">
        <button
          type="button"
          className="icon-button"
          aria-label="Ano anterior"
          disabled={current.year <= MIN_YEAR}
          onClick={() => go(format(current.year - 1, current.month))}
        >
          <ChevronLeftIcon size={17} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{1,4}"
          maxLength={4}
          aria-label="Ano"
          value={yearDraft}
          onChange={(event) => {
            if (/^\d{0,4}$/.test(event.target.value))
              setYearDraft(event.target.value);
          }}
          onBlur={commitYear}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitYear();
            }
          }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Próximo ano"
          disabled={current.year >= MAX_YEAR}
          onClick={() => go(format(current.year + 1, current.month))}
        >
          <ChevronRightIcon size={17} />
        </button>
      </div>
    </>
  );
}

function PickerDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger}
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay competence-overlay" />
        <Dialog.Content
          className="competence-dialog"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="competence-dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Fechar janela">
              <CloseIcon size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {description}
          </Dialog.Description>
          {children}
          <div className="competence-actions">{actions}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Month (competence) picker. When `dayAction` is given, a day can be picked too and the action receives it.
export function CompetencePicker({
  value,
  onValueChange,
  dayAction,
}: {
  value: string;
  onValueChange: (value: string) => void;
  dayAction?: { label: string; onSelect: (day: string) => void };
}) {
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [day, setDay] = useState<string>();
  const valueId = useId();
  const current = parse(draft);
  const dayInMonth = day?.startsWith(draft) ? day : undefined;
  function openChange(next: boolean) {
    if (next) {
      setDraft(value);
      setDay(undefined);
    }
    setOpen(next);
  }
  function apply() {
    onValueChange(draft);
    if (dayInMonth && dayAction) dayAction.onSelect(dayInMonth);
    setOpen(false);
  }
  return (
    <PickerDialog
      open={open}
      onOpenChange={openChange}
      title="Selecionar competência"
      description="Avance ou volte as folhas do calendário, escolha mês, ano ou dia e confirme."
      trigger={
        <Dialog.Trigger
          className="competence-trigger"
          aria-label="Competência"
          aria-describedby={valueId}
          title="Selecionar competência"
        >
          <CalendarIcon size={16} aria-hidden="true" />
          <span id={valueId}>
            {months[selected.month]} {pad(selected.year, 4)}
          </span>
          <ChevronDownIcon size={15} aria-hidden="true" />
        </Dialog.Trigger>
      }
      actions={
        <>
          <Dialog.Close className="button button-white">Cancelar</Dialog.Close>
          <button
            type="button"
            className="button button-primary"
            onClick={apply}
          >
            <CalendarIcon size={16} />
            {dayInMonth && dayAction
              ? `${dayAction.label} ${brazilianDate(dayInMonth)}`
              : `Usar ${pad(current.month + 1)}/${pad(current.year, 4)}`}
          </button>
        </>
      }
    >
      <TearOffPad
        month={draft}
        onMonthChange={setDraft}
        selectedDay={dayInMonth}
        daySelectable={!!dayAction}
        onDay={(next) => setDay(next === day ? undefined : next)}
      />
      {dayAction && (
        <p className="competence-day-hint">
          {dayInMonth
            ? "Toque no dia de novo para desmarcar."
            : "Toque em um dia para ver os vencimentos dessa data."}
        </p>
      )}
    </PickerDialog>
  );
}

// Date field that opens the same tear-off calendar; submits YYYY-MM-DD through a hidden input.
export function DatePicker({
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  label,
  placeholder = "Selecionar data",
  clearable = !required,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
  name?: string;
  required?: boolean;
  label: string;
  placeholder?: string;
  clearable?: boolean;
}) {
  // Controlled when the parent listens without a default: `value` alone is
  // the truth, so clearing (undefined) never falls back to an older pick (R11).
  const controlled = onValueChange !== undefined && defaultValue === undefined;
  const [local, setLocal] = useState(defaultValue);
  const current = controlled ? value : local;
  const [open, setOpen] = useState(false);
  const [draftMonth, setDraftMonth] = useState(
    (current ?? todayIso()).slice(0, 7),
  );
  const [draftDay, setDraftDay] = useState(current);
  function openChange(next: boolean) {
    if (next) {
      setDraftMonth((current ?? todayIso()).slice(0, 7));
      setDraftDay(current);
    }
    setOpen(next);
  }
  function commit(next: string | undefined) {
    if (!controlled) setLocal(next);
    onValueChange?.(next);
    setOpen(false);
  }
  return (
    <PickerDialog
      open={open}
      onOpenChange={openChange}
      title={label}
      description="Escolha o dia na folha do calendário e confirme."
      trigger={
        <>
          {name && <input type="hidden" name={name} value={current ?? ""} />}
          <Dialog.Trigger
            className="competence-trigger date-picker-trigger"
            aria-label={`${label}: ${current ? brazilianDate(current) : "não definida"}`}
          >
            <CalendarIcon size={16} aria-hidden="true" />
            <span className={current ? "" : "date-picker-placeholder"}>
              {current ? brazilianDate(current) : placeholder}
            </span>
            <ChevronDownIcon size={15} aria-hidden="true" />
          </Dialog.Trigger>
        </>
      }
      actions={
        <>
          {clearable && current ? (
            <button
              type="button"
              className="button button-white"
              onClick={() => commit(undefined)}
            >
              Limpar
            </button>
          ) : (
            <Dialog.Close className="button button-white">
              Cancelar
            </Dialog.Close>
          )}
          <button
            type="button"
            className="button button-primary"
            disabled={!draftDay}
            onClick={() => commit(draftDay)}
          >
            <CalendarIcon size={16} />
            {draftDay ? `Usar ${brazilianDate(draftDay)}` : "Escolha um dia"}
          </button>
        </>
      }
    >
      <TearOffPad
        month={draftMonth}
        onMonthChange={setDraftMonth}
        selectedDay={draftDay}
        daySelectable
        onDay={setDraftDay}
      />
    </PickerDialog>
  );
}
