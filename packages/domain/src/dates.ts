const businessDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const businessTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Date-only deadlines stay unchanged; instants use the portal's business timezone. */
export function businessDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return date.toISOString().slice(0, 10) === value ? value : "";
  const parts = businessDayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

export function businessTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "—"
    : businessTimeFormatter.format(date);
}
