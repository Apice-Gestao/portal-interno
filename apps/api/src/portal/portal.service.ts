import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DomainError, validateEvidence } from "@apice/domain";
import type { Actor, PortalEngine } from "@apice/domain";
import { PORTAL_STORE } from "../database/portal-store.js";
import type { PortalStore, SecurityContext } from "../database/portal-store.js";
export function uploadFilename(original: string): string {
  // Multipart clients commonly send UTF-8 bytes while the parser defaults to Latin-1.
  if ([...original].every((char) => char.codePointAt(0)! <= 255)) {
    try {
      return new TextDecoder("utf-8", { fatal: true })
        .decode(Buffer.from(original, "latin1"))
        .normalize("NFC");
    } catch {
      /* Already decoded Unicode/Latin-1: preserve the original name. */
    }
  }
  return original.normalize("NFC");
}
@Injectable()
export class PortalService implements OnModuleDestroy {
  constructor(@Inject(PORTAL_STORE) readonly store: PortalStore) {}
  get storageMode() {
    return this.store.mode;
  }
  ready() {
    return this.store.ping();
  }
  snapshot(actor: Actor) {
    return this.store.snapshot(actor);
  }
  execute<T>(
    actor: Actor,
    operation: (engine: PortalEngine, resolved: Actor) => T,
  ) {
    return this.store.run(actor, operation);
  }
  async attach(
    actor: Actor,
    id: string,
    revision: number,
    file?: Express.Multer.File,
  ) {
    if (!file)
      throw new DomainError("MISSING_FILE", "Selecione uma evidência.");
    const name = uploadFilename(file.originalname);
    const kind = await validateEvidence(name, file.buffer);
    return this.store.run(
      actor,
      (engine, resolved) =>
        engine.attach(resolved, id, revision, {
          name,
          bytes: file.buffer.length,
          kind,
          hash: createHash("sha256").update(file.buffer).digest("hex"),
        }),
      file.buffer,
    );
  }
  download(
    actor: Actor,
    taskId: string,
    documentId: string,
    context?: SecurityContext,
  ) {
    return this.store.download(actor, taskId, documentId, context);
  }
  security(
    actor: Actor,
    action: string,
    detail: string,
    context?: SecurityContext,
  ) {
    return this.store.security(actor, action, detail, context);
  }
  async onModuleDestroy() {
    await this.store.close();
  }
}
