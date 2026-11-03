import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../roles-permisos/entidades/role.entity';
import { AuditService } from '../auditoria/audit.service';
import { UserSession } from '../autenticacion/entidades/user-session.entity';
import { ProductionArea } from '../../produccion/entidades/production-area.entity';
import { User } from './entidades/user.entity';
export abstract class UsersServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(User) protected readonly userRepository: Repository<User>,
        @InjectRepository(Role) protected readonly roleRepository: Repository<Role>,
        @InjectRepository(UserSession)
        protected readonly sessionRepository: Repository<UserSession>,
        @InjectRepository(ProductionArea)
        protected readonly productionAreaRepository: Repository<ProductionArea>,
        protected readonly auditService: AuditService,
      ) {}
}
