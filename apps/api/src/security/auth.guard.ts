import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Actor } from "@apice/domain";
import { SessionService } from "./session.service.js";
export const Public = () => SetMetadata("public", true);
export interface AuthRequest extends Request {
  actor: Actor;
  mustChangePassword: boolean;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>("public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const session = await this.sessions.resolveDetails(
      request.headers.authorization,
    );
    request.actor = session.actor;
    request.mustChangePassword = session.mustChangePassword;
    const path = request.path.toLowerCase().replace(/\/+$/, "");
    const allowed =
      (path === "/api/v1/session" &&
        ["GET", "DELETE"].includes(request.method)) ||
      (path === "/api/v1/password" && request.method === "POST");
    if (session.mustChangePassword && !allowed)
      throw new ForbiddenException({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Altere sua senha temporária para continuar.",
      });
    return true;
  }
}
