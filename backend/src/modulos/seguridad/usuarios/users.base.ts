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
