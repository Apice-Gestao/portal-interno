import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "@apice/domain";
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof DomainError) {
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
    response.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Não foi possível concluir esta operação.",
    });
  }
}
