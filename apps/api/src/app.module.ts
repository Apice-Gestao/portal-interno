import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import pg from "pg";
import {
  createSeed,
  DEMO_NOW,
  MemoryRepository,
  PortalEngine,
} from "@apice/domain";
import { PortalController } from "./portal/portal.controller.js";
import { PortalService } from "./portal/portal.service.js";
import { PORTAL_STORE } from "./database/portal-store.js";
import { MemoryPortalStore } from "./database/memory-store.js";
import { PostgresPortalStore } from "./database/postgres-store.js";
import { SessionController } from "./security/session.controller.js";
import { SessionService } from "./security/session.service.js";
import { AuthGuard } from "./security/auth.guard.js";
import { PermissionGuard } from "./common/permission.guard.js";
import { MailService } from "./security/mail.service.js";
import { RecoveryService } from "./security/recovery.service.js";
import { RecoveryController } from "./security/recovery.controller.js";
import { EmailMfaService } from "./security/email-mfa.service.js";
import { TVController } from "./tv/tv.controller.js";
import { TVService } from "./tv/tv.service.js";
import { TvPairGuard } from "./tv/tv-pair.guard.js";
import {
  IdentityStore,
  PostgresIdentityStore,
  UnavailableIdentityStore,
} from "./database/identity-store.js";
@Module({
  controllers: [
    PortalController,
    SessionController,
    RecoveryController,
    TVController,
  ],
  providers: [
    PortalService,
    SessionService,
    TVService,
    TvPairGuard,
    { provide: MailService, useFactory: () => new MailService() },
    {
      provide: RecoveryService,
      inject: [MailService],
      useFactory: (mail: MailService) =>
        new RecoveryService(
          process.env.PORTAL_STORAGE === "postgres"
            ? process.env.DATABASE_URL
            : undefined,
          mail,
          process.env.PORTAL_TENANT_ID ?? "apice-demo",
        ),
    },
    {
      provide: EmailMfaService,
      inject: [IdentityStore, MailService],
      useFactory: (identity: IdentityStore, mail: MailService) =>
        new EmailMfaService(
          process.env.PORTAL_STORAGE === "postgres"
            ? new pg.Pool({
                connectionString: process.env.DATABASE_URL,
                max: 4,
                connectionTimeoutMillis: 5000,
                idleTimeoutMillis: 10000,
              })
            : undefined,
          identity,
          mail,
        ),
    },
    {
      provide: IdentityStore,
      useFactory: () => {
        if (process.env.PORTAL_STORAGE !== "postgres")
          return new UnavailableIdentityStore();
        if (!process.env.DATABASE_URL)
          throw new Error(
            "DATABASE_URL necessária para autenticação PostgreSQL.",
          );
        return new PostgresIdentityStore(
          process.env.DATABASE_URL,
          process.env.PORTAL_TENANT_ID ?? "apice-demo",
        );
      },
    },
    {
      provide: PORTAL_STORE,
      useFactory: async () => {
        const mode = process.env.PORTAL_STORAGE ?? "memory";
        if (mode === "postgres") {
          if (!process.env.DATABASE_URL)
            throw new Error(
              "DATABASE_URL necessária para persistência PostgreSQL.",
            );
          return PostgresPortalStore.connect(process.env.DATABASE_URL);
        }
        if (mode !== "memory") throw new Error("PORTAL_STORAGE inválido.");
        return new MemoryPortalStore(
          new PortalEngine(new MemoryRepository(createSeed()), () => DEMO_NOW),
        );
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
