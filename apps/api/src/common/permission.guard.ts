import {
  Inject,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasPermission } from "@apice/domain";
import type { Permission } from "@apice/domain";
import type { AuthRequest } from "../security/auth.guard.js";
export const RequirePermission = (permission: Permission) =>
  SetMetadata("permission", permission);
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const permission = this.reflector.getAllAndOverride<Permission>(
      "permission",
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    const actor = context.switchToHttp().getRequest<AuthRequest>().actor;
    if (!actor || !hasPermission(actor, permission))
      throw new ForbiddenException("Seu acesso não permite esta ação.");
    return true;
  }
}
