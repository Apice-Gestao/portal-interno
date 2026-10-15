import type {
  Actor,
  DocumentVersion,
  PortalEngine,
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
  snapshot(actor: Actor): Promise<Snapshot>;
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
