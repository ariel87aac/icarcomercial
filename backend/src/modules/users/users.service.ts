import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { Role } from '../access-control/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { UserSession } from '../auth/entities/user-session.entity';
import { ProductionArea } from '../production/entities/production-area.entity';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { User } from './entities/user.entity';
import { UserType } from './entities/user-type.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectRepository(ProductionArea)
    private readonly productionAreaRepository: Repository<ProductionArea>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: UserQueryDto): Promise<PaginatedResponse<User>> {
    const builder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .leftJoinAndSelect('user.productionAreas', 'productionArea')
      .distinct(true)
      .andWhere('user.type = :userType', { userType: UserType.INTERNAL })
      .orderBy('user.code', 'ASC')
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
      .leftJoinAndSelect('user.productionAreas', 'productionArea')
      .where('user.id = :id', { id })
      .andWhere('user.type = :userType', { userType: UserType.INTERNAL })
      .getOne();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser): Promise<User> {
    await this.assertIdentityAvailable(dto.email, dto.username);
    const roles = await this.resolveRoles(dto.roleIds);
    const productionAreas = await this.resolveProductionAreas(dto.productionAreaIds ?? [], roles);
    const user = await this.userRepository.save(
      this.userRepository.create({
        name: dto.name,
        username: dto.username,
        email: dto.email,
        phone: dto.phone?.trim() || null,
        passwordHash: await hash(dto.password, 12),
        type: UserType.INTERNAL,
        roles,
        productionAreas,
      }),
    );
    await this.auditService.record({
      userId: actor.id,
      module: 'users',
      action: 'CREAR_USUARIO',
      entity: 'usuarios',
      entityId: user.id,
      result: 'EXITOSO',
      metadata: {
        email: user.email,
        username: user.username,
        roles: roles.map((role) => role.name),
        productionAreaIds: productionAreas.map((area) => area.id),
      },
    });
    return this.findOne(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<User> {
    const user = await this.findOne(id);
    const previousStatus = user.status;
    if (dto.email || dto.username) {
      await this.assertIdentityAvailable(dto.email ?? user.email, dto.username ?? user.username, id);
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone?.trim() || null;
    if (dto.status !== undefined) user.status = dto.status;
    const roles = dto.roleIds ? await this.resolveRoles(dto.roleIds) : user.roles;
    user.roles = roles;
    if (dto.roleIds !== undefined || dto.productionAreaIds !== undefined) {
      const areaIds = dto.productionAreaIds ?? user.productionAreas.map((area) => area.id);
      user.productionAreas = await this.resolveProductionAreas(areaIds, roles);
    }
    const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
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
      action: statusChanged
        ? dto.status === 'ACTIVO'
          ? 'ACTIVAR_USUARIO'
          : 'DESACTIVAR_USUARIO'
        : 'ACTUALIZAR_USUARIO',
      entity: 'usuarios',
      entityId: user.id,
      result: 'EXITOSO',
      metadata: {
        fields: Object.keys(dto),
        previousStatus,
        status: user.status,
        roles: user.roles.map((role) => role.name),
        productionAreaIds: user.productionAreas.map((area) => area.id),
      },
    });
    return this.findOne(id);
  }

  async findOwnProfile(actor: AuthenticatedUser) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .leftJoinAndSelect('user.productionAreas', 'productionArea')
      .leftJoinAndSelect('user.customerLinks', 'customerLink')
      .leftJoinAndSelect('customerLink.customer', 'customer')
      .leftJoinAndSelect('customer.addresses', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('address.distributionDay', 'distributionDay')
      .where('user.id = :id', { id: actor.id })
      .getOne();
    if (!user) throw new NotFoundException('Perfil no encontrado');
    const customerLink = user.customerLinks?.find(
      (link) => link.customerId === actor.customerId,
    );
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      type: user.type,
      status: user.status,
      roles: user.roles.map((role) => role.name),
      permissions: [
        ...new Set(
          user.roles.flatMap((role) =>
            role.permissions?.map((permission) => permission.key) ?? [],
          ),
        ),
      ],
      customerId: customerLink?.customerId ?? null,
      customer: customerLink?.customer ?? null,
      productionAreas: user.productionAreas,
    };
  }

  async updateOwnProfile(
    actor: AuthenticatedUser,
    dto: UpdateOwnProfileDto,
  ) {
    const user = await this.userRepository.findOne({ where: { id: actor.id } });
    if (!user) throw new NotFoundException('Perfil no encontrado');
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone.trim() || null;
    await this.userRepository.save(user);
    await this.auditService.record({
      userId: actor.id,
      module: 'users',
      action: 'ACTUALIZAR_PERFIL',
      entity: 'usuarios',
      entityId: actor.id,
      result: 'EXITOSO',
      metadata: { fields: Object.keys(dto) },
    });
    return this.findOwnProfile(actor);
  }

  async adminResetPassword(
    id: string,
    dto: AdminResetPasswordDto,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const user = await this.findOne(id);
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

  async remove(id: string, actor: AuthenticatedUser): Promise<{ id: string; code: number; deleted: true }> {
    if (id === actor.id) {
      throw new ConflictException('No puede eliminar la cuenta con la que inició sesión');
    }
    const user = await this.findOne(id);
    const isActiveAdministrator = user.status === 'ACTIVO'
      && user.roles.some((role) => role.name === 'ADMINISTRADOR' && role.status === 'ACTIVO');
    if (isActiveAdministrator) {
      const activeAdministratorCount = await this.userRepository
        .createQueryBuilder('candidate')
        .innerJoin('candidate.roles', 'role')
        .where('candidate.type = :type', { type: UserType.INTERNAL })
        .andWhere('candidate.status = :status', { status: 'ACTIVO' })
        .andWhere('role.name = :roleName', { roleName: 'ADMINISTRADOR' })
        .andWhere('role.status = :roleStatus', { roleStatus: 'ACTIVO' })
        .getCount();
      if (activeAdministratorCount <= 1) {
        throw new ConflictException('No se puede eliminar el último administrador activo');
      }
    }

    const snapshot = { code: user.code, name: user.name, email: user.email, username: user.username };
    try {
      await this.userRepository.remove(user);
    } catch (error) {
      const databaseCode = error instanceof QueryFailedError
        ? (error.driverError as { code?: string }).code
        : undefined;
      if (databaseCode === '23503') {
        throw new ConflictException('No se puede eliminar el usuario porque tiene operaciones asociadas');
      }
      throw error;
    }
    await this.auditService.record({
      userId: actor.id,
      module: 'users',
      action: 'ELIMINAR_USUARIO',
      entity: 'usuarios',
      entityId: id,
      result: 'EXITOSO',
      metadata: snapshot,
    });
    return { id, code: snapshot.code, deleted: true };
  }

  productionAreas(): Promise<ProductionArea[]> {
    return this.productionAreaRepository.find({
      where: { status: RecordStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  private async resolveRoles(ids: string[]): Promise<Role[]> {
    const roles = await this.roleRepository.findBy({ id: In(ids) });
    if (roles.length !== ids.length) throw new NotFoundException('Uno o más roles no existen');
    if (roles.some((role) => role.status !== 'ACTIVO')) {
      throw new ConflictException('No se puede asignar un rol inactivo');
    }
    return roles;
  }

  private async resolveProductionAreas(ids: string[], roles: Role[]): Promise<ProductionArea[]> {
    const isProductionUser = roles.some((role) => role.name === 'PRODUCCION');
    if (!isProductionUser) {
      if (ids.length) {
        throw new BadRequestException('Las áreas de Producción solo pueden asignarse a usuarios con rol PRODUCCION');
      }
      return [];
    }
    if (!ids.length) {
      throw new BadRequestException('Un usuario con rol PRODUCCION debe tener al menos un área asignada');
    }
    const areas = await this.productionAreaRepository.findBy({ id: In(ids) });
    if (areas.length !== ids.length) throw new NotFoundException('Una o más áreas de Producción no existen');
    if (areas.some((area) => area.status !== 'ACTIVO')) {
      throw new ConflictException('No se puede asignar un área de Producción inactiva');
    }
    return areas;
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
