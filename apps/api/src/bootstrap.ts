import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { AppModule } from "./app.module.js";
import { ErrorFilter } from "./common/error.filter.js";
export const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];
if (process.env.PORTAL_WEB_ORIGIN) {
  const origin = new URL(process.env.PORTAL_WEB_ORIGIN);
  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    origin.origin !== process.env.PORTAL_WEB_ORIGIN
  )
    throw new Error("PORTAL_WEB_ORIGIN deve ser uma origem HTTP local.");
  ALLOWED_ORIGINS.push(origin.origin);
}
export function validateEnvironment() {
  if (process.env.NODE_ENV !== "development")
    throw new Error(
      "API local de desenvolvimento. Execute npm run dev. A configuração de produção da VPS ainda não foi liberada.",
    );
}
export async function createApplication() {
  validateEnvironment();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ["error", "warn"],
  });
  app.use(helmet());
  const standardJson = json({ limit: "64kb" });
  const importJson = json({ limit: "256kb" });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const parser =
      req.path.replace(/\/$/, "") === "/api/v1/companies/import"
        ? importJson
        : standardJson;
    parser(req, res, next);
  });
  app.use(urlencoded({ extended: false, limit: "16kb" }));
  const buckets = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostname = req.hostname;
    if (
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname) ||
      (req.headers.origin && !ALLOWED_ORIGINS.includes(req.headers.origin))
    ) {
      res.status(403).json({
        code: "ORIGIN_DENIED",
        message: "Esta API aceita apenas acesso local autorizado.",
      });
      return;
    }
    const now = Date.now();
    for (const [key, value] of buckets)
      if (value.until < now) buckets.delete(key);
    const canonical = req.path.replace(/\/+$/, "").toLowerCase();
    const sessionRoute = canonical === "/api/v1/demo-session";
    const loginRoute = canonical === "/api/v1/login";
    const resetRoute =
      canonical === "/api/v1/password/forgot" ||
      canonical === "/api/v1/password/reset";
    const factorRoute = canonical.startsWith("/api/v1/login/");
    const key = `${req.ip}:${loginRoute ? "login" : resetRoute ? "recovery" : factorRoute ? "factor" : sessionRoute ? "session" : "api"}`;
    const bucket = buckets.get(key) ?? { count: 0, until: now + 60_000 };
    bucket.count++;
    buckets.set(key, bucket);
    const max = loginRoute
      ? 10
      : resetRoute
        ? 5
        : factorRoute
          ? 20
          : sessionRoute
            ? 30
            : 300;
    if (bucket.count > max) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({
        code: "RATE_LIMIT",
        message: "Aguarde um minuto antes de continuar.",
      });
      return;
    }
    res.setHeader("X-Request-Id", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.enableCors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false,
  });
  app.useGlobalFilters(new ErrorFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Ápice · API operacional local")
      .setDescription(
        "Dados fictícios. Memória ou PostgreSQL conforme configuração. Sessão demo indisponível em produção.",
      )
      .setVersion("0.1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  await app.init();
  return app;
}
