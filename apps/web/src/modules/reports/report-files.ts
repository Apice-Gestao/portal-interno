import type { ReportResult } from "@apice/domain";

// Real report files (19/10/2026): "Baixar Excel" builds an .xlsx workbook (one
// sheet per report) and "Baixar PDF" a paginated PDF, both with exactly the
// visible columns and every row of the current cut. Generated in the browser.

export interface ReportSection {
  title: string;
  result: ReportResult;
}

type Cell = string | number;
const cellOf = (value: unknown): Cell =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : value === undefined || value === null
      ? ""
      : String(value);

// ---------- .xlsx (Office Open XML in a stored ZIP) ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP without compression: enough for a workbook and readable by Excel. */
function zip(files: { name: string; text: string }[]) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob(
    [...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[],
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  );
}

const xml = (text: string) =>
  text
    // Characters XML 1.0 does not allow would make Excel refuse the file.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const column = (index: number) => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};
function sheetNames(titles: string[]) {
  const used = new Set<string>();
  return titles.map((title) => {
    const base = title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Relatório";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function reportWorkbook(sections: ReportSection[]): Blob {
  const names = sheetNames(sections.map((section) => section.title));
  const sheets = sections.map(({ result }) => {
    const rows: Cell[][] = [
      result.columns.map((item) => item.label),
      ...result.rows.map((row) =>
        result.columns.map((item) => cellOf(row.cells[item.key])),
      ),
    ];
    const widths = result.columns.map((_, index) =>
      Math.min(
        60,
        Math.max(8, ...rows.map((row) => String(row[index] ?? "").length + 2)),
      ),
    );
    const body = rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map((value, c) => {
              const ref = `${column(c)}${r + 1}`;
              const style = r === 0 ? ' s="1"' : "";
              return typeof value === "number"
                ? `<c r="${ref}"${style}><v>${value}</v></c>`
                : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths
      .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
      .join("")}</cols><sheetData>${body}</sheetData></worksheet>`;
  });
  return zip([
    {
      name: "[Content_Types].xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E7F87"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
    ...sheets.map((text, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      text,
    })),
  ]);
}

// ---------- PDF (A4 landscape, every row, header repeated per page) ----------

export async function reportPdf(sections: ReportSection[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle("Relatório · Portal Ápice");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Standard fonts only encode Latin-1 (WinAnsi); anything else becomes "?".
  const known = new Set(regular.getCharacterSet());
  const safe = (text: string) =>
    [...text]
      .map((char) => (known.has(char.codePointAt(0)!) ? char : "?"))
      .join("");
  const teal = rgb(14 / 255, 127 / 255, 135 / 255);
  const ink = rgb(21 / 255, 32 / 255, 43 / 255);
  const muted = rgb(0.4, 0.45, 0.5);
  const line = rgb(0.85, 0.88, 0.9);
  const [width, height] = [841.89, 595.28];
  const margin = 36;
  const size = 8;
  const rowHeight = 14;
  const fit = (text: string, font: typeof regular, max: number) => {
    let value = safe(text);
    if (font.widthOfTextAtSize(value, size) <= max) return value;
    while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > max)
      value = value.slice(0, -1);
    return `${value}…`;
  };
  let page = doc.addPage([width, height]);
  let y = height - margin;
  const newPage = () => {
    page = doc.addPage([width, height]);
    y = height - margin;
  };
  for (const [index, { title, result }] of sections.entries()) {
    if (index > 0 && y < height - margin - 200) newPage();
    else if (index > 0) y -= 18;
    page.drawText(safe(title), { x: margin, y: y - 14, size: 14, font: bold, color: ink });
    y -= 30;
    page.drawText(
      safe(
        `${result.dateLabel} · ${result.rows.length} registros · gerado em ${new Date(result.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      ),
      { x: margin, y, size: 8.5, font: regular, color: muted },
    );
    y -= 16;
    // Column widths follow the content, capped so every column stays visible.
    const available = width - margin * 2;
    const natural = result.columns.map((item) =>
      Math.min(
        220,
        Math.max(
          bold.widthOfTextAtSize(safe(item.label), size),
          ...result.rows
            .slice(0, 200)
            .map((row) =>
              regular.widthOfTextAtSize(safe(String(cellOf(row.cells[item.key]))), size),
            ),
        ) + 10,
      ),
    );
    const total = natural.reduce((sum, value) => sum + value, 0);
    const widths = natural.map((value) => (value * available) / total);
    const header = () => {
      page.drawRectangle({ x: margin, y: y - rowHeight + 3, width: available, height: rowHeight, color: teal });
      let x = margin;
      result.columns.forEach((item, c) => {
        page.drawText(fit(item.label, bold, widths[c]! - 6), { x: x + 3, y: y - 7, size, font: bold, color: rgb(1, 1, 1) });
        x += widths[c]!;
      });
      y -= rowHeight;
    };
    header();
    if (!result.rows.length) {
      page.drawText("Nenhum registro neste recorte.", { x: margin + 3, y: y - 8, size, font: regular, color: muted });
      y -= rowHeight;
    }
    for (const row of result.rows) {
      if (y < margin + rowHeight) {
        newPage();
        header();
      }
      let x = margin;
      result.columns.forEach((item, c) => {
        page.drawText(fit(String(cellOf(row.cells[item.key])), regular, widths[c]! - 6), { x: x + 3, y: y - 8, size, font: regular, color: ink });
        x += widths[c]!;
      });
      page.drawLine({ start: { x: margin, y: y - rowHeight + 3 }, end: { x: margin + available, y: y - rowHeight + 3 }, thickness: 0.4, color: line });
      y -= rowHeight;
    }
    for (const note of result.notes ?? []) {
      if (y < margin + rowHeight) newPage();
      page.drawText(fit(note, regular, available), { x: margin, y: y - 10, size: 7.5, font: regular, color: muted });
      y -= 12;
    }
  }
  const pages = doc.getPages();
  pages.forEach((item, i) =>
    item.drawText(`Portal Ápice · página ${i + 1} de ${pages.length}`, {
      x: margin,
      y: 18,
      size: 7.5,
      font: regular,
      color: muted,
    }),
  );
  return new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
}
