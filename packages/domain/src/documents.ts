import type { DocumentRule, DocumentVersion, Task } from "./types.js";
import { normalizeCnpj } from "./identifiers.js";

/** Replaced versions remain in history but cannot satisfy current requirements. */
export function latestDocuments(
  documents: DocumentVersion[],
): DocumentVersion[] {
  const groups = new Map<string, DocumentVersion>();
  for (const document of documents) {
    // Legacy tasks had a single versioned document, before logical IDs existed.
    const key = document.logicalId ?? "legacy";
    const previous = groups.get(key);
    if (!previous || document.version > previous.version)
      groups.set(key, document);
  }
  return [...groups.values()];
}

export function documentsReady(task: Task): boolean {
  const accepted = latestDocuments(task.documents).filter(
    (document) => document.validation === "accepted",
  );
  return (
    (task.evidenceRequired === false || accepted.length > 0) &&
    (task.requiredDocumentTypeIds ?? []).every((typeId) =>
      accepted.some((document) => document.documentTypeId === typeId),
    )
  );
}

const plain = (value: string) =>
  value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
function xmlField(text: string, field: string): string {
  const name = field.replace(/[^A-Za-z0-9_.:-]/g, "");
  if (!name) return "";
  const escaped = name.replace(/[.]/g, "\\.");
  const match = new RegExp(
    String.raw`<(?:[A-Za-z_][\w.-]*:)?${escaped}(?:\s[^>]*)?>([^<]*)<`,
    "i",
  ).exec(text);
  if (match?.[1]?.trim()) return match[1].trim();
  // Also attributes, e.g. <ideEvento perApur="2026-09">.
  const attribute = new RegExp(
    String.raw`\s(?:[A-Za-z_][\w.-]*:)?${escaped}\s*=\s*["']([^"']*)["']`,
    "i",
  ).exec(text);
  return attribute?.[1]?.trim() ?? "";
}

/**
 * Every competence an XML may carry, normalized to AAAA-MM: 2026-09,
 * 2026-09-30, 09/2026, 09-2026 and 202609, attributes included (19/10/2026).
 */
export function xmlCompetences(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?<!\d)(\d{4})[-/](0[1-9]|1[0-2])(?!\d)/g))
    found.add(`${m[1]}-${m[2]}`);
  for (const m of text.matchAll(/(?<!\d)(0[1-9]|1[0-2])[-/](\d{4})(?!\d)/g))
    found.add(`${m[2]}-${m[1]}`);
  for (const m of text.matchAll(/(?<![\d./-])(20\d{2})(0[1-9]|1[0-2])(?![\d./-])/g))
    found.add(`${m[1]}-${m[2]}`);
  return found;
}

/**
 * Server-side counterpart of the batch matching (L14, 19/10/2026): an XML
 * evidence of a type covered by an active rule must carry the task's CNPJ
 * and competence when the rule asks for them. Returns the reason to refuse.
 */
export function xmlRuleMismatch(
  text: string,
  input: {
    task: Pick<Task, "templateId" | "competence">;
    companyCnpj?: string;
    documentTypeId?: string;
    fileName: string;
    rules: DocumentRule[];
  },
): string | undefined {
  const content = plain(`${input.fileName} ${text}`);
  const rules = input.rules.filter(
    (rule) =>
      rule.active &&
      !!input.documentTypeId &&
      rule.documentTypeIds.includes(input.documentTypeId) &&
      (!rule.templateIds.length ||
        rule.templateIds.includes(input.task.templateId)) &&
      (!rule.keywords.length ||
        rule.keywords.some((word) => content.includes(plain(word)))),
  );
  for (const rule of rules) {
    if (rule.fields.includes("cnpj") && input.companyCnpj) {
      const found = [
        ...(text.match(/\b[A-Z\d]{12}\d{2}\b/gi) ?? []),
        ...(text.match(
          /[A-Z\d]{2}\.?[A-Z\d]{3}\.?[A-Z\d]{3}\/?[A-Z\d]{4}-?\d{2}/gi,
        ) ?? []),
        xmlField(text, rule.cnpjField || "CNPJ"),
      ]
        .filter(Boolean)
        .map(normalizeCnpj);
      if (!found.includes(normalizeCnpj(input.companyCnpj)))
        return `O XML não traz o CNPJ da empresa desta tarefa (regra “${rule.name}”).`;
    }
    if (rule.fields.includes("competence")) {
      const field = xmlField(text, rule.competenceField || "competencia");
      const periods = xmlCompetences(`${text} ${field}`);
      if (!periods.has(input.task.competence))
        return `O XML não traz a competência ${input.task.competence} desta tarefa (regra “${rule.name}”).`;
    }
  }
  return undefined;
}
