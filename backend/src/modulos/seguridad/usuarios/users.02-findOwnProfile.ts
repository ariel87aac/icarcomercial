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
import { UsersServiceParte03 } from './users.03-resolveProductionAreas';

export abstract class UsersServiceParte02 extends UsersServiceParte03 {
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
        && user.roles.some((role: Role) => role.name === 'ADMINISTRADOR' && role.status === 'ACTIVO');
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

  protected async resolveRoles(ids: string[]): Promise<Role[]> {
      const roles = await this.roleRepository.findBy({ id: In(ids) });
      if (roles.length !== ids.length) throw new NotFoundException('Uno o más roles no existen');
      if (roles.some((role) => role.status !== 'ACTIVO')) {
        throw new ConflictException('No se puede asignar un rol inactivo');
      }
      return roles;
    }
}
