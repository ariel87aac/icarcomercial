import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AuditService } from '../../modules/audit/audit.service';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = required.every((permission) => request.user?.permissions.includes(permission));
    if (allowed) return true;
    await this.auditService.record({
      userId: request.user?.id ?? null,
      module: 'access-control',
      action: 'ACCESO_DENEGADO',
      entity: 'endpoint',
      entityId: request.originalUrl,
      result: 'RECHAZADO',
      ipAddress: request.ip,
      metadata: { method: request.method, requiredPermissions: required },
    });
    throw new ForbiddenException('No cuenta con permisos para realizar esta operación');
  }
}

