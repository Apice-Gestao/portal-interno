export type DeadlineMode = "meta" | "legal" | "both";

/** Carry the panorama's exact scope into the task list drill-down. */
export function calendarTasksUrl({
  department,
  day,
  mode,
  month,
  ownerId,
}: {
  department: string;
  day: string;
  mode: DeadlineMode;
  month: string;
  ownerId?: string;
}): string {
  const params = new URLSearchParams({
    department,
    dueDate: day,
    dueMode: mode,
    calendarMonth: month,
  });
  if (ownerId) params.set("owner", ownerId);
  return `/tarefas?${params.toString()}`;
}
