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
import { CustomersServiceBase } from './customers.base';

export abstract class CustomersServiceParte05 extends CustomersServiceBase {
  protected async assertNotDuplicate(
      name: string,
      phone: string,
      taxId?: string,
      excludedId?: string,
    ): Promise<void> {
      const builder = this.customerRepository.createQueryBuilder('customer');
      if (taxId) {
        builder.where('lower(customer.taxId) = lower(:taxId)', { taxId });
      } else {
        builder.where('lower(customer.businessName) = lower(:name) AND customer.phone = :phone', {
          name,
          phone,
        });
      }
      if (excludedId) builder.andWhere('customer.id <> :excludedId', { excludedId });
      if (await builder.getOne()) {
        throw new ConflictException('Ya existe un cliente con la identificación definida');
      }
    }
}
