import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, DataSource, Repository } from 'typeorm';
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
      if (dto.countryCode !== undefined) changes.countryCode = dto.countryCode;
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
          dto.email !== undefined ||
          dto.phone !== undefined ||
          dto.countryCode !== undefined);
      if (identityChanged) {
        const username = accountLink.user.username;
        const email = (
          dto.email !== undefined ? changes.email : customer.email
        )?.trim().toLowerCase();
        const duplicatedIdentityQuery = this.userRepository
          .createQueryBuilder('user')
          .where('user.id <> :userId', { userId: accountLink.userId })
          .andWhere(
            new Brackets((identity) => {
              identity.where('lower(user.username) = lower(:username)', { username });
              if (email) identity.orWhere('lower(user.email) = lower(:email)', { email });
            }),
          );
        const duplicatedIdentity = await duplicatedIdentityQuery.getOne();
        if (duplicatedIdentity) {
          throw new ConflictException(
            'El correo o nombre de usuario ya está registrado como acceso de otro usuario',
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
            email: email || null,
            phone,
            countryCode: changes.countryCode ?? customer.countryCode,
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
    ): Promise<{
      id: string;
      code: number;
      status: RecordStatus.INACTIVE;
      deactivated: true;
    }> {
      const customer = await this.findOne(id, actor);
      const snapshot = {
        code: customer.code,
        businessName: customer.businessName,
        taxId: customer.taxId,
        type: customer.type,
        previousStatus: customer.status,
        status: RecordStatus.INACTIVE,
      };

      if (customer.status === RecordStatus.INACTIVE) {
        return {
          id,
          code: customer.code,
          status: RecordStatus.INACTIVE,
          deactivated: true,
        };
      }

      const linkedUserIds = customer.userLinks.map((link: CustomerUser) => link.userId);
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Customer).update(id, {
          status: RecordStatus.INACTIVE,
        });
        if (linkedUserIds.length) {
          await manager
            .getRepository(UserSession)
            .createQueryBuilder()
            .update()
            .set({ revokedAt: new Date() })
            .where('usuario_id IN (:...linkedUserIds)', { linkedUserIds })
            .andWhere('revocada_at IS NULL')
            .execute();
        }
      });
      await this.auditService.record({
        userId: actor.id,
        module: 'customers',
        action: 'DESACTIVAR_CLIENTE',
        entity: 'clientes',
        entityId: id,
        result: 'EXITOSO',
        metadata: { ...snapshot, source: 'ELIMINAR' },
      });
      return {
        id,
        code: snapshot.code,
        status: RecordStatus.INACTIVE,
        deactivated: true,
      };
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
