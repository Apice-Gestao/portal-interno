import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PERMISSIONS,
  PortalEngine,
  users,
} from "../packages/domain/src/index.js";
import type { Actor, Permission, ReportFilters } from "../packages/domain/src/index.js";
import {
  reportPdf,
  reportWorkbook,
} from "../apps/web/src/modules/reports/report-files.js";

// "Baixar Excel" and "Baixar PDF" deliver real files (19/10/2026).
const admin: Actor = {
  ...users.find((user) => user.userId === "helena")!,
  permissions: [...PERMISSIONS] as Permission[],
};
const engine = new PortalEngine(new MemoryRepository(createSeed()), () => DEMO_NOW);
const report = (id: string) =>
  engine.report(admin, { id, scope: "all", dateBasis: "competence" } as ReportFilters);

async function unzip(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const files = new Map<string, string>();
  for (let at = 0; view.getUint32(at, true) === 0x04034b50; ) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength;
    files.set(name, new TextDecoder().decode(bytes.slice(start, start + size)));
    at = start + size;
  }
  return files;
}

describe("report files", () => {
  it("builds an .xlsx workbook with one sheet per report, typed numbers and escaped text", async () => {
    const pending = report("pending");
    const productivity = report("productivity");
    pending.rows[0]!.cells[pending.columns[0]!.key] = 'A & B <"Ltda">';
    const blob = reportWorkbook([
      { title: "Pendências e atrasos", result: pending },
      { title: "Entregas por colaborador", result: productivity },
    ]);
    expect(blob.type).toContain("spreadsheetml");
    const files = await unzip(blob);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    expect(files.get("xl/workbook.xml")).toContain('name="Pendências e atrasos"');
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("A &amp; B &lt;&quot;Ltda&quot;&gt;");
    expect((sheet.match(/<row /g) ?? []).length).toBe(pending.rows.length + 1);
    expect(files.get("xl/worksheets/sheet2.xml")).toMatch(/<c r="B2"( s="1")?><v>\d+<\/v><\/c>/);
  });

  it("builds a paginated PDF with every row and the accents of the labels", async () => {
    const result = report("pending");
    const many = { ...result, rows: Array.from({ length: 120 }, (_, i) => ({ ...result.rows[i % result.rows.length]!, id: `r${i}` })) };
    const blob = await reportPdf([{ title: "Pendências e atrasos", result: many }]);
    expect(blob.type).toBe("application/pdf");
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(doc.getTitle()).toBe("Relatório · Portal Ápice");
  });
});
