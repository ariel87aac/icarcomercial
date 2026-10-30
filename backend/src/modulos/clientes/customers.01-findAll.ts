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
import { CustomersServiceParte02 } from './customers.02-update';

export abstract class CustomersServiceParte01 extends CustomersServiceParte02 {
  async findAll(
      query: CustomerQueryDto,
      actor: AuthenticatedUser,
    ): Promise<PaginatedResponse<Customer>> {
      const builder = this.customerRepository
        .createQueryBuilder('customer')
        .distinct(true)
        .leftJoinAndSelect('customer.addresses', 'address')
        .leftJoinAndSelect('address.zone', 'zone')
        .leftJoinAndSelect('address.distributionDay', 'day')
        .leftJoinAndSelect('customer.userLinks', 'accountLink')
        .leftJoinAndSelect('accountLink.user', 'accountUser')
        .orderBy('customer.code', 'ASC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
  
      if (query.q) {
        builder.andWhere(
          new Brackets((where) => {
            where
              .where('CAST(customer.code AS text) ILIKE :q', { q: `%${query.q}%` })
              .orWhere('unaccent(customer.businessName) ILIKE unaccent(:q)', { q: `%${query.q}%` })
              .orWhere('customer.taxId ILIKE :q', { q: `%${query.q}%` })
              .orWhere('unaccent(customer.contactName) ILIKE unaccent(:q)', { q: `%${query.q}%` })
              .orWhere('customer.phone ILIKE :q', { q: `%${query.q}%` })
              .orWhere('customer.whatsapp ILIKE :q', { q: `%${query.q}%` })
              .orWhere('customer.email ILIKE :q', { q: `%${query.q}%` });
          }),
        );
      }
      if (query.type) builder.andWhere('customer.type = :type', { type: query.type });
      if (query.status) builder.andWhere('customer.status = :status', { status: query.status });
      if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
      if (query.weekday) builder.andWhere('day.weekday = :weekday', { weekday: query.weekday });
      if (actor.type === UserType.CUSTOMER) {
        builder.andWhere('customer.id = :scopedCustomerId', {
          scopedCustomerId: actor.customerId,
        });
      }
  
      const [customers, total] = await builder.getManyAndCount();
      return paginate(customers, total, query.page, query.limit);
    }

  async findOne(id: string, actor?: AuthenticatedUser): Promise<Customer> {
      if (actor?.type === UserType.CUSTOMER && actor.customerId !== id) {
        throw new NotFoundException('Cliente no encontrado');
      }
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: {
          addresses: { zone: true, distributionDay: true },
          userLinks: { user: true },
        },
        order: { addresses: { isPrimary: 'DESC', createdAt: 'ASC' } },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      return customer;
    }

  async create(dto: CreateCustomerDto, actor: AuthenticatedUser): Promise<Customer> {
      this.validateCredit(dto.paymentCondition, dto.creditLimit, dto.creditDays);
      await this.assertNotDuplicate(dto.businessName, dto.phone, dto.taxId);
      const customer = await this.customerRepository.save(
        this.customerRepository.create({
          ...dto,
          taxId: dto.taxId || null,
          contactName: dto.contactName || null,
          whatsapp: dto.whatsapp || null,
          email: dto.email || null,
          creditLimit: dto.creditLimit.toFixed(2),
        }),
      );
      await this.auditService.record({
        userId: actor.id,
        module: 'customers',
        action: 'CREAR_CLIENTE',
        entity: 'clientes',
        entityId: customer.id,
        result: 'EXITOSO',
        metadata: { code: customer.code, type: customer.type, businessName: customer.businessName, taxId: customer.taxId },
      });
      return this.findOne(customer.id, actor);
    }
}
