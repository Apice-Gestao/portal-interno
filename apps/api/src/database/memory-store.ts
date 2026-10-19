import { createHash } from "node:crypto";
import { createSeed, demoPdf, DomainError, PortalEngine } from "@apice/domain";
import type { Actor, ReportFilters } from "@apice/domain";
import type { PortalStore, SecurityContext } from "./portal-store.js";
export class MemoryPortalStore implements PortalStore {
  readonly mode = "memory" as const;
  private readonly files = new Map<string, Buffer>();
  private readonly seedIds = new Set(
    createSeed().tasks.flatMap((t) => t.documents.map((d) => d.id)),
  );
  constructor(readonly engine: PortalEngine) {}
  async ping() {}
  async tenantIds() {
    return [process.env.PORTAL_TENANT_ID ?? "apice-demo"];
  }
  async snapshot(actor: Actor) {
    return this.engine.snapshot(actor);
  }
  async report(actor: Actor, filters: ReportFilters) {
    return this.engine.report(actor, filters);
  }
  async run<T>(
    actor: Actor,
    operation: (engine: PortalEngine, resolved: Actor) => T,
    content?: Buffer,
  ): Promise<T> {
    const before = new Set(
      this.engine
        .snapshot(actor)
        .tasks.flatMap((t) => t.documents.map((d) => d.id)),
    );
    if (
      content &&
      [...this.files.values()].reduce((sum, b) => sum + b.length, 0) +
        content.length >
        32 * 1024 * 1024
    )
      throw new DomainError(
        "STORAGE_LIMIT",
        "Limite do ambiente demonstrativo atingido.",
        413,
      );
    const result = operation(this.engine, actor);
    if (content) {
      const docs = this.engine
        .snapshot(actor)
        .tasks.flatMap((t) => t.documents)
        .filter((d) => !before.has(d.id));
      if (docs.length !== 1)
        throw new Error("Evidência não associada à operação.");
      this.files.set(docs[0]!.id, Buffer.from(content));
    }
    return result;
  }
  async download(
    actor: Actor,
    taskId: string,
    documentId: string,
    context?: SecurityContext,
  ) {
    const task = this.engine.snapshot(actor).tasks.find((t) => t.id === taskId);
    const doc = task?.documents.find((d) => d.id === documentId);
    if (!doc)
      throw new DomainError(
        "NOT_FOUND",
        "Documento não encontrado neste escopo.",
        404,
      );
    const bytes = this.files.get(doc.id);
    if (!bytes && !this.seedIds.has(doc.id))
      throw new DomainError(
        "MISSING_CONTENT",
        "Conteúdo do documento indisponível.",
        503,
      );
    if (
      bytes &&
      doc.hash &&
      createHash("sha256").update(bytes).digest("hex") !== doc.hash
    )
      throw new DomainError(
        "INTEGRITY_ERROR",
        "Falha de integridade do documento.",
        500,
      );
    this.engine.logSecurity(actor, "Documento baixado", doc.name, {
      ...context,
      taskId,
    });
    return { doc, bytes: bytes ?? Buffer.from(demoPdf()) };
  }
  async security(
    actor: Actor,
    action: string,
    detail: string,
    context?: SecurityContext,
  ) {
    this.engine.logSecurity(actor, action, detail, context);
  }
  async close() {}
}
