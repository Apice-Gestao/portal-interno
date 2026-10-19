import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { DomainError } from "@apice/domain";
import { moduleOf, routeOf, technicalLog } from "./technical-log.js";

// Values inside database messages, such as `Key (cnpj)=(…)`, never reach the log.
const sanitize = (text: string) =>
  text.replace(/\([^)]*\)=\([^)]*\)/g, "(…)=(…)").slice(0, 2000);
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof DomainError) {
      response.locals.errorCode = error.code;
      response
        .status(error.status)
        .json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(typeof body === "string" ? { message: body } : body);
      return;
    }
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 413
    ) {
      response.status(413).json({
        code: "PAYLOAD_LIMIT",
        message: "O conteúdo excede o limite permitido.",
      });
      return;
    }
    // Unexpected failure: the person sees a generic message, the technical
    // trail keeps the cause with the request id to find it later.
    const request = host.switchToHttp().getRequest<Request>();
    technicalLog({
      level: "error",
      event: "request_failed",
      requestId: String(response.getHeader("X-Request-Id") ?? ""),
      method: request.method,
      route: routeOf(request),
      module: moduleOf(request),
      status: 500,
      error: error instanceof Error ? error.name : typeof error,
      stack:
        error instanceof Error && error.stack
          ? sanitize(error.stack)
          : undefined,
    });
    response.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Não foi possível concluir esta operação.",
    });
  }
}
