import type {
  Actor,
  DocumentVersion,
  PortalEngine,
  ReportFilters,
  ReportResult,
  Snapshot,
} from "@apice/domain";
export interface SecurityContext {
  ip?: string;
  device?: string;
  taskId?: string;
}
export interface PortalStore {
  readonly mode: "memory" | "postgres";
  ping(): Promise<void>;
  /** Groups (tenants) the scheduled automatic generation runs for. */
  tenantIds(): Promise<string[]>;
  snapshot(actor: Actor): Promise<Snapshot>;
  report(actor: Actor, filters: ReportFilters): Promise<ReportResult>;
  run<T>(
    actor: Actor,
    operation: (engine: PortalEngine, resolved: Actor) => T,
    content?: Buffer,
  ): Promise<T>;
  download(
    actor: Actor,
    taskId: string,
    documentId: string,
    context?: SecurityContext,
  ): Promise<{ doc: DocumentVersion; bytes: Buffer }>;
  security(
    actor: Actor,
    action: string,
    detail: string,
    context?: SecurityContext,
  ): Promise<void>;
  close(): Promise<void>;
}
export const PORTAL_STORE = Symbol("PORTAL_STORE");
