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
import { AuthServiceParte02 } from './auth.02-confirmRecovery';

export abstract class AuthServiceParte01 extends AuthServiceParte02 {
  async login(dto: LoginDto, context: RequestContext): Promise<IssuedSession> {
      const user = await this.findUserForAuthentication(dto.identifier);
      const valid = user ? await compare(dto.password, user.passwordHash) : false;
      if (
        !user ||
        !valid ||
        user.status !== RecordStatus.ACTIVE ||
        !this.hasActiveRole(user) ||
        !this.hasActiveCustomerScope(user)
      ) {
        await this.auditService.record({
          userId: user?.id ?? null,
          module: 'auth',
          action: 'INICIAR_SESION',
          entity: 'sesiones_usuario',
          result: 'RECHAZADO',
          ipAddress: context.ipAddress,
          metadata: { identifier: dto.identifier, reason: 'CREDENCIALES_O_ESTADO_INVALIDO' },
        });
        throw new UnauthorizedException('Credenciales inválidas o cuenta no disponible');
      }
      const issued = await this.issueSession(user, context);
      user.lastLoginAt = new Date();
      await this.userRepository.save(user);
      await this.auditService.record({
        userId: user.id,
        module: 'auth',
        action: 'INICIAR_SESION',
        entity: 'sesiones_usuario',
        entityId: this.decodeSessionId(issued.accessToken),
        result: 'EXITOSO',
        ipAddress: context.ipAddress,
      });
      return issued;
    }

  async refresh(refreshToken: string | null, context: RequestContext): Promise<IssuedSession> {
      if (!refreshToken) throw new UnauthorizedException('Sesión no disponible');
      const session = await this.sessionRepository
        .createQueryBuilder('session')
        .addSelect('user.passwordHash')
        .leftJoinAndSelect('session.user', 'user')
        .leftJoinAndSelect('user.roles', 'role')
        .leftJoinAndSelect('role.permissions', 'permission')
        .leftJoinAndSelect('user.productionAreas', 'productionArea')
        .leftJoinAndSelect('user.customerLinks', 'customerLink')
        .leftJoinAndSelect('customerLink.customer', 'customer')
        .where('session.refreshTokenHash = :hash', { hash: this.tokenHash(refreshToken) })
        .andWhere('session.revokedAt IS NULL')
        .andWhere('session.expiresAt > now()')
        .getOne();
      if (
        !session ||
        session.user.status !== RecordStatus.ACTIVE ||
        !this.hasActiveRole(session.user) ||
        !this.hasActiveCustomerScope(session.user)
      ) {
        throw new UnauthorizedException('La sesión expiró o fue invalidada');
      }
      session.revokedAt = new Date();
      await this.sessionRepository.save(session);
      return this.issueSession(session.user, context);
    }

  async logout(user: AuthenticatedUser, context: RequestContext): Promise<{ message: string }> {
      await this.sessionRepository.update(user.sessionId, { revokedAt: new Date() });
      await this.auditService.record({
        userId: user.id,
        module: 'auth',
        action: 'CERRAR_SESION',
        entity: 'sesiones_usuario',
        entityId: user.sessionId,
        result: 'EXITOSO',
        ipAddress: context.ipAddress,
      });
      return { message: 'Sesión cerrada correctamente' };
    }

  async changePassword(
      user: AuthenticatedUser,
      dto: ChangePasswordDto,
    ): Promise<{ message: string }> {
      const entity = await this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id: user.id })
        .getOne();
      if (!entity || !(await compare(dto.currentPassword, entity.passwordHash))) {
        throw new UnauthorizedException('La contraseña actual no es válida');
      }
      entity.passwordHash = await hash(dto.newPassword, 12);
      await this.userRepository.save(entity);
      await this.sessionRepository.update(
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await this.auditService.record({
        userId: user.id,
        module: 'auth',
        action: 'CAMBIAR_PASSWORD',
        entity: 'usuarios',
        entityId: user.id,
        result: 'EXITOSO',
      });
      return { message: 'Contraseña actualizada; inicie sesión nuevamente' };
    }

  async requestRecovery(dto: RequestRecoveryDto): Promise<{
      message: string;
      developmentToken?: string;
    }> {
      const generic = 'Si la cuenta existe, se generó una solicitud de recuperación autorizada';
      const user = await this.findUserForAuthentication(dto.identifier);
      if (!user || user.status !== RecordStatus.ACTIVE) return { message: generic };
      await this.resetRepository.update(
        { userId: user.id, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
        { usedAt: new Date() },
      );
      const rawToken = randomBytes(32).toString('base64url');
      await this.resetRepository.save(
        this.resetRepository.create({
          userId: user.id,
          tokenHash: this.tokenHash(rawToken),
          expiresAt: new Date(Date.now() + this.resetTtl * 1000),
        }),
      );
      await this.auditService.record({
        userId: user.id,
        module: 'auth',
        action: 'SOLICITAR_RECUPERACION',
        entity: 'tokens_recuperacion',
        result: 'EXITOSO',
      });
      return {
        message: generic,
        ...(this.config.get<string>('NODE_ENV') !== 'production'
          ? { developmentToken: rawToken }
          : {}),
      };
    }
}
