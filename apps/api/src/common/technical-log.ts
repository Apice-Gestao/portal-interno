import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Technical trail for diagnosing failures (19/10/2026), separate from the
 * managers' audit. One JSON line per failed or slow request, correlated by
 * X-Request-Id. Never logs bodies, query strings, headers, cookies, tokens
 * or personal data: only method, route, module, status, duration and, for
 * unexpected errors, the error type and its stack.
 */
const SLOW_MS = 1500;

export interface TechnicalEntry {
  level: "error" | "warn" | "info";
  event: string;
  requestId?: string;
  method?: string;
  route?: string;
  module?: string;
  status?: number;
  ms?: number;
  code?: string;
  error?: string;
  stack?: string;
}

export function technicalLog(entry: TechnicalEntry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.info(line);
}

/** Path without query string; long opaque segments are masked. */
export function routeOf(req: Request) {
  return req.path
    .split("/")
    .map((part) => (part.length > 40 ? ":id" : part))
    .join("/");
}

/** `/api/v1/tasks/…` → `tasks`. */
export function moduleOf(req: Request) {
  return req.path.replace(/^\/api\/v1\/?/, "").split("/")[0] || "root";
}

/** Records failed (4xx/5xx) and slow requests when the response finishes. */
export function requestTrail(req: Request, res: Response, next: NextFunction) {
  const started = performance.now();
  // Every response, even a refused one, carries the id the log refers to.
  res.setHeader("X-Request-Id", randomUUID());
  res.on("finish", () => {
    const ms = Math.round(performance.now() - started);
    const status = res.statusCode;
    // 5xx is logged with its cause by the error filter; 401 on session
    // checks is routine and would only add noise.
    if (status >= 500 || status === 401) return;
    if (status < 400 && ms < SLOW_MS) return;
    technicalLog({
      level: status >= 400 ? "warn" : "info",
      event: status >= 400 ? "request_rejected" : "request_slow",
      requestId: String(res.getHeader("X-Request-Id") ?? ""),
      method: req.method,
      route: routeOf(req),
      module: moduleOf(req),
      status,
      ms,
      code: res.locals.errorCode as string | undefined,
    });
  });
  next();
}
