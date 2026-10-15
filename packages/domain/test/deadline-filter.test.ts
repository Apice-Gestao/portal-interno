import { describe, expect, it } from "vitest";
import { createSeed, matchesSelection } from "../src/index.js";

describe("Deadline situation filter", () => {
  it("keeps yellow targets separate from legal delays, due-today and closed deliveries", () => {
    const sample = {
      ...createSeed().tasks[0]!,
      status: "in_progress" as const,
      internalDue: "2026-10-10",
      legalDue: "2026-10-20",
    };
    const today = "2026-10-13";
    expect(matchesSelection(sample, { urgency: "meta-only" }, today)).toBe(
      true,
    );
    expect(
      matchesSelection(
        { ...sample, legalDue: "2026-10-12" },
        { urgency: "meta-only" },
        today,
      ),
    ).toBe(false);
    expect(
      matchesSelection(
        { ...sample, legalDue: today },
        { urgency: "meta-only" },
        today,
      ),
    ).toBe(false);
    expect(
      matchesSelection(
        { ...sample, internalDue: today },
        { urgency: "meta-only" },
        today,
      ),
    ).toBe(false);
    expect(
      matchesSelection(
        { ...sample, status: "done" },
        { urgency: "meta-only" },
        today,
      ),
    ).toBe(false);
    expect(
      matchesSelection(
        { ...sample, status: "dispensed" },
        { urgency: "meta-only" },
        today,
      ),
    ).toBe(false);
    // The broader internal-target filter used by existing indicators is preserved.
    expect(
      matchesSelection(
        { ...sample, legalDue: "2026-10-12" },
        { urgency: "internal" },
        today,
      ),
    ).toBe(true);
    expect(
      matchesSelection(
        { ...sample, legalDue: "2026-10-12" },
        { urgency: "legal" },
        today,
      ),
    ).toBe(true);
  });
});
