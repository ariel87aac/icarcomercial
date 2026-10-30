import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, DataSource, QueryFailedError, Repository } from 'typeorm';
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
import { CustomersServiceParte03 } from './customers.03-addAddress';

export abstract class CustomersServiceParte02 extends CustomersServiceParte03 {
  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser): Promise<Customer> {
      const customer = await this.findOne(id, actor);
      const accountLink =
        customer.userLinks.find((link: CustomerUser) => link.isPrimary) ?? customer.userLinks[0];
      const previousStatus = customer.status;
      const condition = dto.paymentCondition ?? customer.paymentCondition;
      const creditLimit = dto.creditLimit ?? Number(customer.creditLimit);
      const creditDays = dto.creditDays ?? customer.creditDays;
      this.validateCredit(condition, creditLimit, creditDays);
      if (dto.businessName || dto.phone || dto.taxId) {
        await this.assertNotDuplicate(
          dto.businessName ?? customer.businessName,
          dto.phone ?? customer.phone,
          dto.taxId ?? customer.taxId ?? undefined,
          id,
        );
      }
      const changes: Partial<Customer> = {};
      if (dto.type !== undefined) changes.type = dto.type;
      if (dto.businessName !== undefined) changes.businessName = dto.businessName.trim();
      if (dto.taxId !== undefined) changes.taxId = dto.taxId.trim() || null;
      if (dto.contactName !== undefined) changes.contactName = dto.contactName.trim() || null;
      if (dto.phone !== undefined) changes.phone = dto.phone.trim();
      if (dto.whatsapp !== undefined) changes.whatsapp = dto.whatsapp.trim() || null;
      if (dto.email !== undefined) changes.email = dto.email.trim().toLowerCase() || null;
      if (dto.paymentCondition !== undefined) changes.paymentCondition = dto.paymentCondition;
      if (dto.creditLimit !== undefined) changes.creditLimit = dto.creditLimit.toFixed(2);
      if (dto.creditDays !== undefined) changes.creditDays = dto.creditDays;
      if (dto.status !== undefined) changes.status = dto.status;
  
      const identityChanged =
        accountLink &&
        (dto.businessName !== undefined ||
          dto.contactName !== undefined ||
          dto.taxId !== undefined ||
          dto.email !== undefined ||
          dto.phone !== undefined);
      if (identityChanged) {
        const username = (changes.taxId ?? customer.taxId)?.trim();
        const email = (changes.email ?? customer.email)?.trim().toLowerCase();
        if (!username) {
          throw new BadRequestException(
            'Una cuenta habilitada requiere el NIT o carnet del cliente',
          );
        }
        if (!email) {
          throw new BadRequestException(
            'Una cuenta habilitada requiere el correo del cliente',
          );
        }
        const duplicatedIdentity = await this.userRepository
          .createQueryBuilder('user')
          .where('user.id <> :userId', { userId: accountLink.userId })
          .andWhere(
            '(lower(user.email) = lower(:email) OR lower(user.username) = lower(:username))',
            { email, username },
          )
          .getOne();
        if (duplicatedIdentity) {
          throw new ConflictException(
            'El correo o NIT/CI ya está registrado como acceso de otro usuario',
          );
        }
        const name =
          (changes.contactName ?? customer.contactName)?.trim() ||
          (changes.businessName ?? customer.businessName).trim();
        const phone = (changes.phone ?? customer.phone).trim();
        await this.dataSource.transaction(async (manager) => {
          await manager.getRepository(Customer).update(id, changes);
          await manager.getRepository(User).update(accountLink.userId, {
            name,
            username: username.toLowerCase(),
            email,
            phone,
          });
        });
      } else {
        await this.customerRepository.update(id, changes);
      }
      const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
      await this.auditService.record({
        userId: actor.id,
        module: 'customers',
        action: statusChanged
          ? dto.status === 'ACTIVO'
            ? 'ACTIVAR_CLIENTE'
            : 'DESACTIVAR_CLIENTE'
          : 'ACTUALIZAR_CLIENTE',
        entity: 'clientes',
        entityId: customer.id,
        result: 'EXITOSO',
        metadata: {
          fields: Object.keys(dto),
          previousStatus,
          status: dto.status ?? customer.status,
        },
      });
      return this.findOne(id, actor);
    }

  async remove(
      id: string,
      actor: AuthenticatedUser,
    ): Promise<{ id: string; code: number; deleted: true }> {
      const customer = await this.findOne(id, actor);
      if (customer.userLinks.length || customer.addresses.length) {
        throw new ConflictException(
          'No se puede eliminar el cliente porque tiene una cuenta o domicilios asociados',
        );
      }
  
      const snapshot = {
        code: customer.code,
        businessName: customer.businessName,
        taxId: customer.taxId,
        type: customer.type,
      };
      try {
        await this.customerRepository.remove(customer);
      } catch (error) {
        const databaseCode =
          error instanceof QueryFailedError
            ? (error.driverError as { code?: string }).code
            : undefined;
        if (databaseCode === '23503') {
          throw new ConflictException(
            'No se puede eliminar el cliente porque tiene pedidos, ventas u operaciones asociadas',
          );
        }
        throw error;
      }
      await this.auditService.record({
        userId: actor.id,
        module: 'customers',
        action: 'ELIMINAR_CLIENTE',
        entity: 'clientes',
        entityId: id,
        result: 'EXITOSO',
        metadata: snapshot,
      });
      return { id, code: snapshot.code, deleted: true };
    }

  async addresses(
      customerId: string,
      actor: AuthenticatedUser,
    ): Promise<CustomerAddress[]> {
      await this.findOne(customerId, actor);
      return this.addressRepository.find({
        where: { customerId },
        relations: { zone: true, distributionDay: true },
        order: { isPrimary: 'DESC', createdAt: 'ASC' },
      });
    }
}
