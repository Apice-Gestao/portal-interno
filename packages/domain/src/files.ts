import { DomainError } from "./errors.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export async function validateEvidence(
  name: string,
  bytes: Uint8Array,
): Promise<"PDF" | "XML"> {
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES)
    throw new DomainError(
      "INVALID_FILE_SIZE",
      "O arquivo deve ter entre 1 byte e 5 MB.",
      413,
    );
  if (
    name.length > 120 ||
    [...name].some((char) => {
      const point = char.codePointAt(0)!;
      return (
        point < 32 ||
        (point >= 127 && point <= 159) ||
        (point >= 0xd800 && point <= 0xdfff) ||
        char === "/" ||
        char === "\\"
      );
    })
  )
    throw new DomainError("INVALID_FILENAME", "Nome de arquivo inválido.");
  const lower = name.toLowerCase();
  const text = new TextDecoder().decode(bytes);
  if (
    lower.endsWith(".pdf") &&
    /^%PDF-(1\.[0-7]|2\.0)/.test(text) &&
    text.slice(-1024).includes("%%EOF")
  ) {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(bytes, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      if (pdf.getPageCount() < 1 || pdf.getPageCount() > 500)
        throw new Error("Page limit");
      return "PDF";
    } catch {
      throw new DomainError(
        "INVALID_PDF",
        "O PDF está inválido, corrompido ou protegido.",
      );
    }
  }
  if (
    lower.endsWith(".xml") &&
    !/<!DOCTYPE|<!ENTITY/i.test(text) &&
    text.trimStart().startsWith("<")
  ) {
    try {
      if (XMLValidator.validate(text) !== true)
        throw new Error("Malformed XML");
      const nodes = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        maxNestedTags: 100,
      }).parse(text) as Record<string, unknown>[];
      const roots = nodes.flatMap((node) =>
        Object.keys(node).filter(
          (key) => !key.startsWith("?") && !key.startsWith("#") && key !== ":@",
        ),
      );
      const outsideText = nodes.some(
        (node) => "#text" in node && String(node["#text"]).trim().length > 0,
      );
      if (roots.length === 1 && !outsideText) return "XML";
    } catch {
      throw new DomainError(
        "INVALID_FILE",
        "XML inválido ou acima do limite de 100 níveis de elementos.",
        422,
      );
    }
  }
  throw new DomainError(
    "INVALID_FILE",
    "Envie um PDF válido ou XML sem declarações de entidades.",
  );
}
export function csvCell(value: unknown): string {
  const text = [...String(value ?? "")]
    .map((char) =>
      char.charCodeAt(0) < 32 ||
      (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
        ? " "
        : char,
    )
    .join("");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function demoPdf(): Uint8Array {
  const stream =
    "BT /F1 14 Tf 50 750 Td (APICE - DOCUMENTO DE DEMONSTRACAO) Tj 0 -26 Td (Dados ficticios. Sem validade fiscal.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
