import * as Popover from "@radix-ui/react-popover";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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

export function CompetencePicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7)) - 1;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selectedYear);
  const [yearDraft, setYearDraft] = useState(String(selectedYear));
  const monthRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const valueId = useId();

  function changeYear(next: number) {
    if (!Number.isInteger(next) || next < 1 || next > 9999) return;
    setYear(next);
    setYearDraft(String(next));
  }
  function commitYear() {
    const next = Number(yearDraft);
    if (/^\d{1,4}$/.test(yearDraft) && next >= 1 && next <= 9999)
      changeYear(next);
    else setYearDraft(String(year));
  }
  function openChange(next: boolean) {
    if (next) changeYear(selectedYear);
    setOpen(next);
  }
  function selectMonth(index: number) {
    onValueChange(
      `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`,
    );
    setOpen(false);
  }
  function navigateMonths(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 3,
      ArrowUp: -3,
    };
    if (event.key in moves) {
      event.preventDefault();
      monthRefs.current[(index + moves[event.key]! + 12) % 12]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      monthRefs.current[event.key === "Home" ? 0 : 11]?.focus();
    }
  }
  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger
        className="competence-trigger"
        aria-label="Competência"
        aria-describedby={valueId}
        title="Selecionar competência"
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span id={valueId}>
          {months[selectedMonth]} {String(selectedYear).padStart(4, "0")}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="competence-popover"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            monthRefs.current[selectedMonth]?.focus();
          }}
        >
          <p id={titleId} className="competence-title">
            Selecionar competência
          </p>
          <div className="competence-year">
            <button
              type="button"
              className="icon-button"
              aria-label="Ano anterior"
              disabled={year === 1}
              onClick={() => changeYear(year - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{1,4}"
              maxLength={4}
              aria-label="Ano da competência"
              value={yearDraft}
              onChange={(event) => {
                const next = event.target.value;
                if (/^\d{0,4}$/.test(next)) {
                  setYearDraft(next);
                  const parsed = Number(next);
                  if (parsed >= 1 && parsed <= 9999) setYear(parsed);
                }
              }}
              onBlur={commitYear}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitYear();
                  monthRefs.current[selectedMonth]?.focus();
                }
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Próximo ano"
              disabled={year === 9999}
              onClick={() => changeYear(year + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
          <div
            className="competence-months"
            role="group"
            aria-label={`Meses de ${year}`}
          >
            {months.map((month, index) => (
              <button
                key={month}
                type="button"
                ref={(element) => {
                  monthRefs.current[index] = element;
                }}
                className="competence-month"
                aria-pressed={year === selectedYear && index === selectedMonth}
                onClick={() => selectMonth(index)}
                onKeyDown={(event) => navigateMonths(event, index)}
              >
                {month}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
