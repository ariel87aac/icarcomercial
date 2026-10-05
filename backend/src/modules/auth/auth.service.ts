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
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { UserType } from '../users/entities/user-type.enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmRecoveryDto, RequestRecoveryDto } from './dto/recovery.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { UserSession } from './entities/user-session.entity';

export interface SessionView {
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    type: UserType;
    customerId: string | null;
    roles: string[];
    permissions: string[];
    productLineIds: string[];
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

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly resetTtl: number;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectRepository(PasswordResetToken)
    private readonly resetRepository: Repository<PasswordResetToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.accessTtl = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshTtl = this.config.get<number>('REFRESH_TOKEN_TTL_SECONDS', 604800);
    this.resetTtl = this.config.get<number>('PASSWORD_RESET_TTL_SECONDS', 1800);
  }

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
      .leftJoinAndSelect('user.productLines', 'productLine')
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

  private async issueSession(user: User, context: RequestContext): Promise<IssuedSession> {
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

  private sessionView(user: User): SessionView {
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
        productLineIds: user.productLines?.map((line) => line.id) ?? [],
      },
    };
  }

  private findUserForAuthentication(identifier: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .leftJoinAndSelect('user.productLines', 'productLine')
      .leftJoinAndSelect('user.customerLinks', 'customerLink')
      .leftJoinAndSelect('customerLink.customer', 'customer')
      .where('lower(user.email) = lower(:identifier)', { identifier: identifier.trim() })
      .orWhere('lower(user.username) = lower(:identifier)', { identifier: identifier.trim() })
      .getOne();
  }

  private hasActiveRole(user: User): boolean {
    return user.roles.some((role) => role.status === RecordStatus.ACTIVE);
  }

  private hasActiveCustomerScope(user: User): boolean {
    return user.type !== UserType.CUSTOMER || this.activeCustomerId(user) !== null;
  }

  private activeCustomerId(user: User): string | null {
    return (
      user.customerLinks?.find(
        (link) =>
          link.status === RecordStatus.ACTIVE &&
          link.customer?.status === RecordStatus.ACTIVE,
      )?.customerId ?? null
    );
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private decodeSessionId(token: string): string | null {
    return (this.jwtService.decode(token) as { sid?: string } | null)?.sid ?? null;
  }
}
