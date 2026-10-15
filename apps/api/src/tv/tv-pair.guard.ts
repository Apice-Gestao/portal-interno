import { HttpException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";

/** Counts every pairing attempt, including requests rejected by body validation. */
@Injectable()
export class TvPairGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();

  canActivate(context: ExecutionContext) {
    const now = Date.now();
    for (const [key, bucket] of this.attempts)
      if (bucket.until <= now) this.attempts.delete(key);
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.ip ?? "unknown";
    const bucket = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
    bucket.count++;
    this.attempts.set(key, bucket);
    if (bucket.count > 10) {
      response.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.until - now) / 1000)),
      );
      throw new HttpException(
        {
          code: "RATE_LIMIT",
          message: "Aguarde um minuto antes de tentar parear novamente.",
        },
        429,
      );
    }
    return true;
  }
}
