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
export abstract class CustomersServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(Customer)
        protected readonly customerRepository: Repository<Customer>,
        @InjectRepository(CustomerAddress)
        protected readonly addressRepository: Repository<CustomerAddress>,
        @InjectRepository(CustomerUser)
        protected readonly accountRepository: Repository<CustomerUser>,
        @InjectRepository(User) protected readonly userRepository: Repository<User>,
        @InjectRepository(Role) protected readonly roleRepository: Repository<Role>,
        @InjectRepository(Zone) protected readonly zoneRepository: Repository<Zone>,
        @InjectRepository(DistributionDay)
        protected readonly dayRepository: Repository<DistributionDay>,
        protected readonly dataSource: DataSource,
        protected readonly auditService: AuditService,
      ) {}
}
