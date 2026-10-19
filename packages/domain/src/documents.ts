import type { DocumentVersion, Task } from "./types.js";

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
