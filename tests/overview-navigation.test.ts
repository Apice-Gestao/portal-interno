import { describe, expect, it } from "vitest";
import { calendarTasksUrl } from "../apps/web/src/modules/overview/overview-navigation";

describe("panorama calendar task drill-down", () => {
  it("preserves the individual owner when opening a personal day", () => {
    const url = new URL(
      calendarTasksUrl({
        department: "Pessoal & Folha",
        day: "2026-10-20",
        mode: "meta",
        month: "2026-10",
        ownerId: "analista-1",
      }),
      "https://portal.example",
    );
    expect(url.pathname).toBe("/tarefas");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      department: "Pessoal & Folha",
      dueDate: "2026-10-20",
      dueMode: "meta",
      calendarMonth: "2026-10",
      owner: "analista-1",
    });
  });

  it("keeps the whole authorized team when opening the consolidated day", () => {
    const url = new URL(
      calendarTasksUrl({
        department: "all",
        day: "2026-10-25",
        mode: "both",
        month: "2026-10",
      }),
      "https://portal.example",
    );
    expect(url.searchParams.get("department")).toBe("all");
    expect(url.searchParams.has("owner")).toBe(false);
    expect(url.searchParams.get("dueMode")).toBe("both");
  });
});
