import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { Role } from '../roles-permisos/entidades/role.entity';
import { AuditService } from '../auditoria/audit.service';
import { UserSession } from '../autenticacion/entidades/user-session.entity';
import { ProductionArea } from '../../produccion/entidades/production-area.entity';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { User } from './entidades/user.entity';
import { UserType } from './entidades/user-type.enum';
import { UsersServiceParte02 } from './users.02-findOwnProfile';

export abstract class UsersServiceParte01 extends UsersServiceParte02 {
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
      const email = dto.email?.trim() || null;
      await this.assertIdentityAvailable(email, dto.username);
      const roles = await this.resolveRoles(dto.roleIds);
      const productionAreas = await this.resolveProductionAreas(dto.productionAreaIds ?? [], roles);
      const user = await this.userRepository.save(
        this.userRepository.create({
          name: dto.name,
          username: dto.username,
          email,
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
      if (dto.email !== undefined || dto.username !== undefined) {
        await this.assertIdentityAvailable(
          dto.email === undefined ? user.email : dto.email?.trim() || null,
          dto.username ?? user.username,
          id,
        );
      }
      if (dto.name !== undefined) user.name = dto.name;
      if (dto.username !== undefined) user.username = dto.username;
      if (dto.email !== undefined) user.email = dto.email?.trim() || null;
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
}
