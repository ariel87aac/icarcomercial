import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { Role } from '../access-control/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { UserSession } from '../auth/entities/user-session.entity';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: UserQueryDto): Promise<PaginatedResponse<User>> {
    const builder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .distinct(true)
      .orderBy('user.name', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.q) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('unaccent(user.name) ILIKE unaccent(:q)', { q: `%${query.q}%` })
            .orWhere('user.email ILIKE :q', { q: `%${query.q}%` })
            .orWhere('user.username ILIKE :q', { q: `%${query.q}%` });
        }),
      );
    }
    if (query.status) builder.andWhere('user.status = :status', { status: query.status });
    if (query.roleId) builder.andWhere('role.id = :roleId', { roleId: query.roleId });

    const [users, total] = await builder.getManyAndCount();
    return paginate(users, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser): Promise<User> {
    await this.assertIdentityAvailable(dto.email, dto.username);
    const roles = await this.resolveRoles(dto.roleIds);
    const user = await this.userRepository.save(
      this.userRepository.create({
        name: dto.name,
        username: dto.username,
        email: dto.email,
        phone: dto.phone?.trim() || null,
        passwordHash: await hash(dto.password, 12),
        roles,
      }),
    );
    await this.auditService.record({
      userId: actor.id,
      module: 'users',
      action: 'CREAR_USUARIO',
      entity: 'usuarios',
      entityId: user.id,
      result: 'EXITOSO',
      metadata: { email: user.email, username: user.username, roles: roles.map((role) => role.name) },
    });
    return this.findOne(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<User> {
    const user = await this.findOne(id);
    if (dto.email || dto.username) {
      await this.assertIdentityAvailable(dto.email ?? user.email, dto.username ?? user.username, id);
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone?.trim() || null;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.roleIds) user.roles = await this.resolveRoles(dto.roleIds);
    await this.userRepository.save(user);
    if (dto.status === 'INACTIVO') {
      await this.sessionRepository.update(
        { userId: id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }
    await this.auditService.record({
      userId: actor.id,
      module: 'users',
      action: 'ACTUALIZAR_USUARIO',
      entity: 'usuarios',
      entityId: user.id,
      result: 'EXITOSO',
      metadata: { fields: Object.keys(dto), status: user.status, roles: user.roles.map((role) => role.name) },
    });
    return this.findOne(id);
  }

  async adminResetPassword(
    id: string,
    dto: AdminResetPasswordDto,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.passwordHash = await hash(dto.newPassword, 12);
    await this.userRepository.save(user);
    await this.sessionRepository.update(
      { userId: id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    await this.auditService.record({
      userId: actor.id,
      module: 'users',
      action: 'RESTABLECER_PASSWORD',
      entity: 'usuarios',
      entityId: id,
      result: 'EXITOSO',
    });
    return { message: 'Contraseña restablecida; las sesiones anteriores fueron invalidadas' };
  }

  private async resolveRoles(ids: string[]): Promise<Role[]> {
    const roles = await this.roleRepository.findBy({ id: In(ids) });
    if (roles.length !== ids.length) throw new NotFoundException('Uno o más roles no existen');
    if (roles.some((role) => role.status !== 'ACTIVO')) {
      throw new ConflictException('No se puede asignar un rol inactivo');
    }
    return roles;
  }

  private async assertIdentityAvailable(email: string, username: string, excludedId?: string) {
    const found = await this.userRepository
      .createQueryBuilder('user')
      .where('(lower(user.email) = lower(:email) OR lower(user.username) = lower(:username))', {
        email,
        username,
      })
      .andWhere(excludedId ? 'user.id <> :excludedId' : '1=1', { excludedId })
      .getOne();
    if (found) throw new ConflictException('El correo o nombre de usuario ya está registrado');
  }
}
