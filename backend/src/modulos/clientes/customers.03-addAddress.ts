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
import { CustomersServiceParte04 } from './customers.04-updateAccount';

export abstract class CustomersServiceParte03 extends CustomersServiceParte04 {
  async addAddress(
      customerId: string,
      dto: CreateAddressDto,
      actor: AuthenticatedUser,
    ): Promise<CustomerAddress> {
      await this.findOne(customerId, actor);
      await this.validateAddress(dto);
      const saved = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(CustomerAddress);
        if (dto.isPrimary) {
          await repository.update({ customerId, isPrimary: true }, { isPrimary: false });
        }
        return repository.save(
          repository.create({
            customerId,
            label: dto.label,
            address: dto.address,
            reference: dto.reference || null,
            latitude: dto.latitude?.toFixed(6) ?? null,
            longitude: dto.longitude?.toFixed(6) ?? null,
            zoneId: dto.zoneId ?? null,
            distributionDayId: dto.distributionDayId ?? null,
            isPrimary: dto.isPrimary,
          }),
        );
      });
      await this.auditService.record({
        userId: actor.id,
        module: 'customers',
        action: 'CREAR_DOMICILIO',
        entity: 'domicilios_cliente',
        entityId: saved.id,
        result: 'EXITOSO',
        metadata: { customerId, zoneId: saved.zoneId, distributionDayId: saved.distributionDayId },
      });
      return this.addressRepository.findOneOrFail({
        where: { id: saved.id },
        relations: { zone: true, distributionDay: true },
      });
    }

  async createAccount(
      customerId: string,
      dto: CreateCustomerAccountDto,
      actor: AuthenticatedUser,
    ): Promise<CustomerUser> {
      const customer = await this.findOne(customerId, actor);
      if (customer.userLinks.length) {
        throw new ConflictException('El cliente ya tiene una cuenta de acceso habilitada');
      }
      const username = customer.taxId?.trim();
      if (!username) {
        throw new BadRequestException(
          'Registre el NIT o carnet del cliente antes de habilitar su cuenta',
        );
      }
      const email = customer.email?.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException(
          'Registre el correo del cliente antes de habilitar su cuenta',
        );
      }
      const identity = await this.userRepository
        .createQueryBuilder('user')
        .where(
          '(lower(user.email) = lower(:email) OR lower(user.username) = lower(:username))',
          { email, username },
        )
        .getOne();
      if (identity) {
        throw new ConflictException('El correo o nombre de usuario ya está registrado');
      }
      const customerRole = await this.roleRepository.findOne({
        where: { name: 'CLIENTE', status: RecordStatus.ACTIVE },
      });
      if (!customerRole) {
        throw new NotFoundException('El rol de cliente no está disponible');
      }
  
      const link = await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const linkRepository = manager.getRepository(CustomerUser);
        const user = await userRepository.save(
          userRepository.create({
            name: customer.contactName || customer.businessName,
            username,
            email,
            phone: customer.phone,
            passwordHash: await hash(dto.password, 12),
            type: UserType.CUSTOMER,
            roles: [customerRole],
          }),
        );
        return linkRepository.save(
          linkRepository.create({
            customerId,
            userId: user.id,
            isPrimary: true,
          }),
        );
      });
  
      await this.auditService.record({
        userId: actor.id,
        module: 'customer_accounts',
        action: 'CREAR_CUENTA_CLIENTE',
        entity: 'clientes_usuarios',
        entityId: link.userId,
        result: 'EXITOSO',
        metadata: { customerId, email, username, isPrimary: true },
      });
      return this.accountRepository.findOneOrFail({
        where: { customerId, userId: link.userId },
        relations: { user: true },
      });
    }
}
