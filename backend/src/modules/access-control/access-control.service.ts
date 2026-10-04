import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';

@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly auditService: AuditService,
  ) {}

  findRoles(): Promise<Role[]> {
    return this.roleRepository.find({ order: { name: 'ASC' } });
  }

  findPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ order: { module: 'ASC', action: 'ASC' } });
  }

  async createRole(dto: CreateRoleDto, actor: AuthenticatedUser): Promise<Role> {
    const name = dto.name.trim().toUpperCase().replace(/\s+/g, '_');
    if (await this.roleRepository.exists({ where: { name } })) {
      throw new ConflictException('Ya existe un rol con ese nombre');
    }
    const permissions = await this.resolvePermissions(dto.permissionIds);
    const role = await this.roleRepository.save(
      this.roleRepository.create({
        name,
        description: dto.description?.trim() || null,
        permissions,
        isSystem: false,
      }),
    );
    await this.auditService.record({
      userId: actor.id,
      module: 'roles',
      action: 'CREAR_ROL',
      entity: 'roles',
      entityId: role.id,
      result: 'EXITOSO',
      metadata: { name, permissionKeys: permissions.map((permission) => permission.key) },
    });
    return this.findRole(role.id);
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: AuthenticatedUser): Promise<Role> {
    const role = await this.findRole(id);
    const previousStatus = role.status;
    if (dto.name && role.isSystem && dto.name.trim().toUpperCase() !== role.name) {
      throw new ConflictException('Los roles del sistema no pueden renombrarse');
    }
    if (dto.name) role.name = dto.name.trim().toUpperCase().replace(/\s+/g, '_');
    if (dto.description !== undefined) role.description = dto.description?.trim() || null;
    if (dto.status) role.status = dto.status;
    if (dto.permissionIds) role.permissions = await this.resolvePermissions(dto.permissionIds);
    await this.roleRepository.save(role);
    const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
    await this.auditService.record({
      userId: actor.id,
      module: 'roles',
      action: statusChanged
        ? dto.status === 'ACTIVO'
          ? 'ACTIVAR_ROL'
          : 'DESACTIVAR_ROL'
        : 'ACTUALIZAR_ROL',
      entity: 'roles',
      entityId: role.id,
      result: 'EXITOSO',
      metadata: {
        fields: Object.keys(dto),
        previousStatus,
        status: role.status,
        permissionKeys: role.permissions.map((permission) => permission.key),
      },
    });
    return this.findRole(role.id);
  }

  async findRole(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
  }

  private async resolvePermissions(ids: string[]): Promise<Permission[]> {
    if (ids.length === 0) return [];
    const permissions = await this.permissionRepository.findBy({ id: In(ids) });
    if (permissions.length !== ids.length) {
      throw new NotFoundException('Uno o más permisos no existen');
    }
    return permissions;
  }
}
