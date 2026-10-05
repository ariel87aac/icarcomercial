import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RecordStatus } from '../enums/record-status.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { readCookie } from '../utils/cookie.util';
import { UserSession } from '../../modules/auth/entities/user-session.entity';
import { UserType } from '../../modules/users/entities/user-type.enum';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Debe iniciar sesión');
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; sid: string }>(token);
      const session = await this.sessionRepository
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.user', 'user')
        .leftJoinAndSelect('user.roles', 'role')
        .leftJoinAndSelect('role.permissions', 'permission')
        .leftJoinAndSelect('user.productLines', 'productLine')
        .leftJoinAndSelect('user.customerLinks', 'customerLink')
        .leftJoinAndSelect('customerLink.customer', 'customer')
        .where('session.id = :sid', { sid: payload.sid })
        .andWhere('session.userId = :uid', { uid: payload.sub })
        .andWhere('session.revokedAt IS NULL')
        .andWhere('session.expiresAt > now()')
        .getOne();
      if (!session || session.user.status !== RecordStatus.ACTIVE) {
        throw new UnauthorizedException('La sesión no está vigente');
      }
      const roles = session.user.roles.filter((role) => role.status === RecordStatus.ACTIVE);
      if (roles.length === 0) throw new UnauthorizedException('La cuenta no tiene un rol activo');
      const customerId =
        session.user.customerLinks?.find(
          (link) =>
            link.status === RecordStatus.ACTIVE &&
            link.customer?.status === RecordStatus.ACTIVE,
        )?.customerId ?? null;
      if (session.user.type === UserType.CUSTOMER && !customerId) {
        throw new UnauthorizedException('La cuenta de cliente no está disponible');
      }
      request.user = {
        id: session.user.id,
        sessionId: session.id,
        name: session.user.name,
        email: session.user.email,
        username: session.user.username,
        type: session.user.type,
        customerId,
        roles: roles.map((role) => role.name),
        permissions: [
          ...new Set(roles.flatMap((role) => role.permissions?.map((permission) => permission.key) ?? [])),
        ],
        productLineIds: session.user.productLines?.map((line) => line.id) ?? [],
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('La sesión no es válida o expiró');
    }
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
    return readCookie(request.headers.cookie, 'icar_access');
  }
}
