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
import { UsersServiceBase } from './users.base';

export abstract class UsersServiceParte03 extends UsersServiceBase {
  protected async resolveProductionAreas(ids: string[], roles: Role[]): Promise<ProductionArea[]> {
      const isProductionUser = roles.some((role) => role.name === 'PRODUCCION');
      if (!isProductionUser) {
        if (ids.length) {
          throw new BadRequestException('Las áreas de Producción solo pueden asignarse a usuarios con rol PRODUCCION');
        }
        return [];
      }
      if (!ids.length) {
        throw new BadRequestException('Un usuario con rol PRODUCCION debe tener al menos un área asignada');
      }
      const areas = await this.productionAreaRepository.findBy({ id: In(ids) });
      if (areas.length !== ids.length) throw new NotFoundException('Una o más áreas de Producción no existen');
      if (areas.some((area) => area.status !== 'ACTIVO')) {
        throw new ConflictException('No se puede asignar un área de Producción inactiva');
      }
      return areas;
    }

  protected async assertIdentityAvailable(email: string | null, username: string, excludedId?: string) {
      const builder = this.userRepository
        .createQueryBuilder('user')
        .where(
          new Brackets((identity) => {
            identity.where('lower(user.username) = lower(:username)', { username });
            if (email) identity.orWhere('lower(user.email) = lower(:email)', { email });
          }),
        );
      if (excludedId) builder.andWhere('user.id <> :excludedId', { excludedId });
      const found = await builder.getOne();
      if (found) throw new ConflictException('El correo o nombre de usuario ya está registrado');
    }
}
