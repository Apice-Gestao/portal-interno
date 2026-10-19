import { businessDate } from "./dates.js";

/** Identity used only by the server for scheduled work; never issued to a session. */
export const SYSTEM_ACTOR_ID = "system:auto-generation";

/** The competence that has just closed in São Paulo (e.g. 17/10/2026 → 2026-09). */
export function closedCompetence(now: string): string {
  const [year, month] = businessDate(now).split("-").map(Number) as [
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 2, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Suggested goal and legal dates for a one-off task, in Brasília time: the
 * 15th and 20th of this month, or of the next one once the 15th has passed.
 * The person can change both before saving.
 */
export function suggestedDeadlines(now: string): {
  internalDue: string;
  legalDue: string;
} {
  const [year, month, day] = businessDate(now).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const target = new Date(Date.UTC(year, day > 15 ? month : month - 1, 1))
    .toISOString()
    .slice(0, 7);
  return { internalDue: `${target}-15`, legalDue: `${target}-20` };
}
