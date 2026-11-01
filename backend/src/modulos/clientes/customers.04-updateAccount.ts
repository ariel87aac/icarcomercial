import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { Role } from '../seguridad/roles-permisos/entidades/role.entity';
import { UserSession } from '../seguridad/autenticacion/entidades/user-session.entity';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { DistributionDay } from '../zonas-reparto/entidades/distribution-day.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import {
  CreateCustomerAccountDto,
  UpdateCustomerAccountDto,
} from './dto/customer-account.dto';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerAddress } from './entidades/customer-address.entity';
import { Customer } from './entidades/customer.entity';
import { CustomerUser } from './entidades/customer-user.entity';
import { PaymentCondition } from './entidades/customer.enums';
import { CustomersServiceParte05 } from './customers.05-assertNotDuplicate';

export abstract class CustomersServiceParte04 extends CustomersServiceParte05 {
  async resetAccountPassword(
      customerId: string,
      userId: string,
      actor: AuthenticatedUser,
    ): Promise<{ message: string }> {
      await this.findOne(customerId, actor);
      const link = await this.accountRepository.findOne({ where: { customerId, userId } });
      if (!link) throw new NotFoundException('Cuenta de cliente no encontrada');
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(User).update(userId, {
          passwordHash: await hash('123456', 12),
          mustChangePassword: true,
        });
        await manager.getRepository(UserSession).update(
          { userId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
      });
      await this.auditService.record({
        userId: actor.id,
        module: 'customer_accounts',
        action: 'RESTABLECER_PASSWORD_CLIENTE',
        entity: 'usuarios',
        entityId: userId,
        result: 'EXITOSO',
        metadata: { customerId },
      });
      return {
        message: 'Contraseña restablecida a 123456; deberá cambiarse en el próximo acceso',
      };
    }

  async updateAccount(
      customerId: string,
      userId: string,
      dto: UpdateCustomerAccountDto,
      actor: AuthenticatedUser,
    ): Promise<CustomerUser> {
      await this.findOne(customerId, actor);
      const link = await this.accountRepository.findOne({
        where: { customerId, userId },
        relations: { user: true },
      });
      if (!link) throw new NotFoundException('Cuenta de cliente no encontrada');
      const previousStatus = link.status;
      const previousUsername = link.user.username;
      if (dto.username !== undefined) {
        const username = dto.username.trim();
        const duplicated = await this.userRepository
          .createQueryBuilder('user')
          .where('user.id <> :userId', { userId })
          .andWhere('lower(user.username) = lower(:username)', { username })
          .getOne();
        if (duplicated) throw new ConflictException('El nombre de usuario ya está registrado');
        link.user.username = username;
      }
      await this.dataSource.transaction(async (manager) => {
        if (dto.status !== undefined) {
          link.status = dto.status;
          link.user.status = dto.status;
        }
        await manager.getRepository(CustomerUser).save(link);
        await manager.getRepository(User).save(link.user);
        if (dto.status === 'INACTIVO') {
          await manager
            .getRepository(UserSession)
            .createQueryBuilder()
            .update()
            .set({ revokedAt: new Date() })
            .where('usuario_id = :userId', { userId })
            .andWhere('revocada_at IS NULL')
            .execute();
        }
      });
      await this.auditService.record({
        userId: actor.id,
        module: 'customer_accounts',
        action: dto.status !== undefined
          ? dto.status === 'ACTIVO'
            ? 'ACTIVAR_CUENTA_CLIENTE'
            : 'DESACTIVAR_CUENTA_CLIENTE'
          : 'ACTUALIZAR_CUENTA_CLIENTE',
        entity: 'clientes_usuarios',
        entityId: userId,
        result: 'EXITOSO',
        metadata: {
          customerId,
          previousStatus,
          status: dto.status ?? link.status,
          previousUsername,
          username: link.user.username,
        },
      });
      return this.accountRepository.findOneOrFail({
        where: { customerId, userId },
        relations: { user: true },
      });
    }

  async updateAddress(
      customerId: string,
      addressId: string,
      dto: UpdateAddressDto,
      actor: AuthenticatedUser,
    ): Promise<CustomerAddress> {
      await this.findOne(customerId, actor);
      const address = await this.addressRepository.findOne({ where: { id: addressId, customerId } });
      if (!address) throw new NotFoundException('Domicilio no encontrado');
      const previousStatus = address.status;
      await this.validateAddress({
        latitude: dto.latitude ?? (address.latitude ? Number(address.latitude) : undefined),
        longitude: dto.longitude ?? (address.longitude ? Number(address.longitude) : undefined),
        zoneId: dto.zoneId ?? address.zoneId ?? undefined,
        distributionDayId: dto.distributionDayId ?? address.distributionDayId ?? undefined,
      });
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(CustomerAddress);
        if (dto.isPrimary) {
          await repository.update({ customerId, isPrimary: true }, { isPrimary: false });
        }
        Object.assign(address, {
          ...dto,
          ...(dto.latitude !== undefined ? { latitude: dto.latitude.toFixed(6) } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude.toFixed(6) } : {}),
        });
        await repository.save(address);
      });
      const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
      await this.auditService.record({
        userId: actor.id,
        module: 'customers',
        action: statusChanged
          ? dto.status === 'ACTIVO'
            ? 'ACTIVAR_DOMICILIO'
            : 'DESACTIVAR_DOMICILIO'
          : 'ACTUALIZAR_DOMICILIO',
        entity: 'domicilios_cliente',
        entityId: address.id,
        result: 'EXITOSO',
        metadata: {
          customerId,
          fields: Object.keys(dto),
          previousStatus,
          status: dto.status ?? address.status,
        },
      });
      return this.addressRepository.findOneOrFail({
        where: { id: address.id },
        relations: { zone: true, distributionDay: true },
      });
    }

  async updateAddressById(
      addressId: string,
      dto: UpdateAddressDto,
      actor: AuthenticatedUser,
    ): Promise<CustomerAddress> {
      const address = await this.addressRepository.findOne({
        where: { id: addressId },
      });
      if (!address) throw new NotFoundException('Domicilio no encontrado');
      return this.updateAddress(address.customerId, addressId, dto, actor);
    }

  protected validateCredit(condition: PaymentCondition, limit: number, days: number): void {
      if (condition === PaymentCondition.CASH && (limit !== 0 || days !== 0)) {
        throw new ConflictException('Los clientes al contado no pueden tener límite ni días de crédito');
      }
      if (condition === PaymentCondition.CREDIT && (limit <= 0 || days <= 0)) {
        throw new ConflictException('El crédito requiere límite y días mayores a cero');
      }
    }

  protected async validateAddress(dto: {
      latitude?: number;
      longitude?: number;
      zoneId?: string;
      distributionDayId?: string;
    }): Promise<void> {
      if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
        throw new ConflictException('Latitud y longitud deben registrarse juntas');
      }
      if (dto.zoneId && !(await this.zoneRepository.exists({ where: { id: dto.zoneId } }))) {
        throw new NotFoundException('La zona indicada no existe');
      }
      if (dto.distributionDayId) {
        const day = await this.dayRepository.findOne({ where: { id: dto.distributionDayId } });
        if (!day) throw new NotFoundException('El día de distribución no existe');
        if (!dto.zoneId || day.zoneId !== dto.zoneId) {
          throw new ConflictException('El día de distribución no pertenece a la zona seleccionada');
        }
      }
    }
}
