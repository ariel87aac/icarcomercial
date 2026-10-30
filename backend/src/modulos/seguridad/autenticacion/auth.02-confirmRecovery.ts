import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../auditoria/audit.service';
import { User } from '../usuarios/entidades/user.entity';
import { UserType } from '../usuarios/entidades/user-type.enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmRecoveryDto, RequestRecoveryDto } from './dto/recovery.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetToken } from './entidades/password-reset-token.entity';
import { UserSession } from './entidades/user-session.entity';

export interface SessionView {
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
    type: UserType;
    customerId: string | null;
    roles: string[];
    permissions: string[];
    productionAreaIds: string[];
  };
}

interface IssuedSession extends SessionView {
  accessToken: string;
  refreshToken: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}
import { AuthServiceBase } from './auth.base';

export abstract class AuthServiceParte02 extends AuthServiceBase {
  async confirmRecovery(dto: ConfirmRecoveryDto): Promise<{ message: string }> {
      const reset = await this.resetRepository.findOne({
        where: {
          tokenHash: this.tokenHash(dto.token),
          usedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        relations: { user: true },
      });
      if (!reset || reset.user.status !== RecordStatus.ACTIVE) {
        throw new UnauthorizedException('El enlace de recuperación no es válido o expiró');
      }
      reset.user.passwordHash = await hash(dto.newPassword, 12);
      reset.usedAt = new Date();
      await this.userRepository.save(reset.user);
      await this.resetRepository.save(reset);
      await this.sessionRepository.update(
        { userId: reset.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await this.auditService.record({
        userId: reset.userId,
        module: 'auth',
        action: 'CONFIRMAR_RECUPERACION',
        entity: 'usuarios',
        entityId: reset.userId,
        result: 'EXITOSO',
      });
      return { message: 'Contraseña restablecida correctamente' };
    }

  protected async issueSession(user: User, context: RequestContext): Promise<IssuedSession> {
      const refreshToken = randomBytes(48).toString('base64url');
      const session = await this.sessionRepository.save(
        this.sessionRepository.create({
          userId: user.id,
          refreshTokenHash: this.tokenHash(refreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent?.slice(0, 500) ?? null,
        }),
      );
      const accessToken = await this.jwtService.signAsync(
        { sub: user.id, sid: session.id },
        { expiresIn: this.accessTtl },
      );
      return {
        ...this.sessionView(user),
        accessToken,
        refreshToken,
        accessTtlSeconds: this.accessTtl,
        refreshTtlSeconds: this.refreshTtl,
      };
    }

  protected sessionView(user: User): SessionView {
      const activeRoles = user.roles.filter((role) => role.status === RecordStatus.ACTIVE);
      const customerId = this.activeCustomerId(user);
      return {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          type: user.type,
          customerId,
          roles: activeRoles.map((role) => role.name),
          permissions: [
            ...new Set(activeRoles.flatMap((role) => role.permissions?.map((permission) => permission.key) ?? [])),
          ],
          productionAreaIds: user.productionAreas?.map((area) => area.id) ?? [],
        },
      };
    }

  protected findUserForAuthentication(identifier: string): Promise<User | null> {
      return this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .leftJoinAndSelect('user.roles', 'role')
        .leftJoinAndSelect('role.permissions', 'permission')
        .leftJoinAndSelect('user.productionAreas', 'productionArea')
        .leftJoinAndSelect('user.customerLinks', 'customerLink')
        .leftJoinAndSelect('customerLink.customer', 'customer')
        .where('lower(user.email) = lower(:identifier)', { identifier: identifier.trim() })
        .orWhere('lower(user.username) = lower(:identifier)', { identifier: identifier.trim() })
        .getOne();
    }

  protected hasActiveRole(user: User): boolean {
      return user.roles.some((role) => role.status === RecordStatus.ACTIVE);
    }

  protected hasActiveCustomerScope(user: User): boolean {
      return user.type !== UserType.CUSTOMER || this.activeCustomerId(user) !== null;
    }

  protected activeCustomerId(user: User): string | null {
      return (
        user.customerLinks?.find(
          (link) =>
            link.status === RecordStatus.ACTIVE &&
            link.customer?.status === RecordStatus.ACTIVE,
        )?.customerId ?? null
      );
    }

  protected tokenHash(token: string): string {
      return createHash('sha256').update(token).digest('hex');
    }

  protected decodeSessionId(token: string): string | null {
      return (this.jwtService.decode(token) as { sid?: string } | null)?.sid ?? null;
    }
}
