import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { Role } from '../seguridad/roles-permisos/entidades/role.entity';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { DistributionDay } from '../zonas-reparto/entidades/distribution-day.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { CustomerAddress } from './entidades/customer-address.entity';
import { Customer } from './entidades/customer.entity';
import { CustomerUser } from './entidades/customer-user.entity';
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
