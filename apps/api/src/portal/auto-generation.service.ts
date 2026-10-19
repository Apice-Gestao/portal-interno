import { Inject, Injectable } from "@nestjs/common";
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { SYSTEM_ACTOR_ID } from "@apice/domain";
import { PORTAL_STORE } from "../database/portal-store.js";
import type { PortalStore } from "../database/portal-store.js";

const HOUR = 60 * 60 * 1000;

/**
 * Generates the closed competence automatically for every group (17/10/2026).
 * Runs shortly after start and then hourly; generation is idempotent, so the
 * first run of each month creates the tasks and later runs only confirm them.
 * Set AUTO_GENERATION=off to disable (the manual button keeps working).
 */
@Injectable()
export class AutoGenerationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  constructor(@Inject(PORTAL_STORE) private readonly store: PortalStore) {}

  onApplicationBootstrap() {
    if (
      process.env.AUTO_GENERATION === "off" ||
      process.env.NODE_ENV === "test"
    )
      return;
    const first = setTimeout(() => void this.runOnce(), 20_000);
    const hourly = setInterval(() => void this.runOnce(), HOUR);
    first.unref();
    hourly.unref();
    this.timers = [first, hourly];
  }

  onApplicationShutdown() {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async runOnce() {
    if (this.running) return [];
    this.running = true;
    const summary: { tenantId: string; competence: string; created: number }[] =
      [];
    try {
      for (const tenantId of await this.store.tenantIds()) {
        try {
          const result = await this.store.run(
            {
              userId: SYSTEM_ACTOR_ID,
              tenantId,
              name: "Geração automática",
              initials: "GA",
              role: "admin",
              departments: [],
            },
            (engine) => engine.autoGenerate(tenantId),
          );
          summary.push({
            tenantId,
            competence: result.competence,
            created: result.created,
          });
          if (result.created)
            console.log(
              `Geração automática: ${result.created} tarefas de ${result.competence} criadas (${tenantId}).`,
            );
          // Only the count: company names stay in the group's own audit trail.
          const skipped = result.results.reduce(
            (sum, item) => sum + item.skipped.length,
            0,
          );
          if (skipped)
            console.warn(
              `Geração automática: ${skipped} empresa(s) sem responsável válido em ${result.competence} (${tenantId}); ver auditoria do grupo.`,
            );
        } catch (error) {
          console.warn(
            `Geração automática não concluída para ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
    return summary;
  }
}
