import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Brackets, DataSource, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { Role } from '../access-control/entities/role.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from '../users/entities/user.entity';
import { UserType } from '../users/entities/user-type.enum';
import { DistributionDay } from '../zones/entities/distribution-day.entity';
import { Zone } from '../zones/entities/zone.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import {
  CreateCustomerAccountDto,
  UpdateCustomerAccountDto,
} from './dto/customer-account.dto';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerAddress } from './entities/customer-address.entity';
import { Customer } from './entities/customer.entity';
import { CustomerUser } from './entities/customer-user.entity';
import { PaymentCondition } from './entities/customer.enums';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepository: Repository<CustomerAddress>,
    @InjectRepository(CustomerUser)
    private readonly accountRepository: Repository<CustomerUser>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Zone) private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(DistributionDay)
    private readonly dayRepository: Repository<DistributionDay>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

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
      .orderBy('customer.businessName', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.q) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('unaccent(customer.businessName) ILIKE unaccent(:q)', { q: `%${query.q}%` })
            .orWhere('customer.taxId ILIKE :q', { q: `%${query.q}%` })
            .orWhere('customer.phone ILIKE :q', { q: `%${query.q}%` })
            .orWhere('customer.whatsapp ILIKE :q', { q: `%${query.q}%` });
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
      metadata: { type: customer.type, businessName: customer.businessName, taxId: customer.taxId },
    });
    return this.findOne(customer.id, actor);
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser): Promise<Customer> {
    const customer = await this.findOne(id, actor);
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
    await this.customerRepository.update(id, changes);
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
    await this.findOne(customerId, actor);
    const identity = await this.userRepository
      .createQueryBuilder('user')
      .where(
        '(lower(user.email) = lower(:email) OR lower(user.username) = lower(:username))',
        { email: dto.email, username: dto.username },
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
      if (dto.isPrimary) {
        await linkRepository.update(
          { customerId, isPrimary: true },
          { isPrimary: false },
        );
      }
      const user = await userRepository.save(
        userRepository.create({
          name: dto.name,
          username: dto.username,
          email: dto.email,
          phone: dto.phone?.trim() || null,
          passwordHash: await hash(dto.password, 12),
          type: UserType.CUSTOMER,
          roles: [customerRole],
        }),
      );
      return linkRepository.save(
        linkRepository.create({
          customerId,
          userId: user.id,
          isPrimary: dto.isPrimary,
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
      metadata: { customerId, email: dto.email, isPrimary: dto.isPrimary },
    });
    return this.accountRepository.findOneOrFail({
      where: { customerId, userId: link.userId },
      relations: { user: true },
    });
  }

  async updateAccount(
    customerId: string,
    userId: string,
    dto: UpdateCustomerAccountDto,
    actor: AuthenticatedUser,
  ): Promise<CustomerUser> {
    await this.findOne(customerId, actor);
    const link = await this.accountRepository.findOne({
      where: { customerId, userId },
      relations: { user: true },
    });
    if (!link) throw new NotFoundException('Cuenta de cliente no encontrada');
    const previousStatus = link.status;
    await this.dataSource.transaction(async (manager) => {
      link.status = dto.status;
      link.user.status = dto.status;
      await manager.getRepository(CustomerUser).save(link);
      await manager.getRepository(User).save(link.user);
      if (dto.status === 'INACTIVO') {
        await manager
          .getRepository(UserSession)
          .createQueryBuilder()
          .update()
          .set({ revokedAt: new Date() })
          .where('usuario_id = :userId', { userId })
          .andWhere('revocada_at IS NULL')
          .execute();
      }
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'customer_accounts',
      action:
        dto.status === 'ACTIVO'
          ? 'ACTIVAR_CUENTA_CLIENTE'
          : 'DESACTIVAR_CUENTA_CLIENTE',
      entity: 'clientes_usuarios',
      entityId: userId,
      result: 'EXITOSO',
      metadata: { customerId, previousStatus, status: dto.status },
    });
    return this.accountRepository.findOneOrFail({
      where: { customerId, userId },
      relations: { user: true },
    });
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
    actor: AuthenticatedUser,
  ): Promise<CustomerAddress> {
    await this.findOne(customerId, actor);
    const address = await this.addressRepository.findOne({ where: { id: addressId, customerId } });
    if (!address) throw new NotFoundException('Domicilio no encontrado');
    const previousStatus = address.status;
    await this.validateAddress({
      latitude: dto.latitude ?? (address.latitude ? Number(address.latitude) : undefined),
      longitude: dto.longitude ?? (address.longitude ? Number(address.longitude) : undefined),
      zoneId: dto.zoneId ?? address.zoneId ?? undefined,
      distributionDayId: dto.distributionDayId ?? address.distributionDayId ?? undefined,
    });
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CustomerAddress);
      if (dto.isPrimary) {
        await repository.update({ customerId, isPrimary: true }, { isPrimary: false });
      }
      Object.assign(address, {
        ...dto,
        ...(dto.latitude !== undefined ? { latitude: dto.latitude.toFixed(6) } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude.toFixed(6) } : {}),
      });
      await repository.save(address);
    });
    const statusChanged = dto.status !== undefined && dto.status !== previousStatus;
    await this.auditService.record({
      userId: actor.id,
      module: 'customers',
      action: statusChanged
        ? dto.status === 'ACTIVO'
          ? 'ACTIVAR_DOMICILIO'
          : 'DESACTIVAR_DOMICILIO'
        : 'ACTUALIZAR_DOMICILIO',
      entity: 'domicilios_cliente',
      entityId: address.id,
      result: 'EXITOSO',
      metadata: {
        customerId,
        fields: Object.keys(dto),
        previousStatus,
        status: dto.status ?? address.status,
      },
    });
    return this.addressRepository.findOneOrFail({
      where: { id: address.id },
      relations: { zone: true, distributionDay: true },
    });
  }

  async updateAddressById(
    addressId: string,
    dto: UpdateAddressDto,
    actor: AuthenticatedUser,
  ): Promise<CustomerAddress> {
    const address = await this.addressRepository.findOne({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundException('Domicilio no encontrado');
    return this.updateAddress(address.customerId, addressId, dto, actor);
  }

  private validateCredit(condition: PaymentCondition, limit: number, days: number): void {
    if (condition === PaymentCondition.CASH && (limit !== 0 || days !== 0)) {
      throw new ConflictException('Los clientes al contado no pueden tener límite ni días de crédito');
    }
    if (condition === PaymentCondition.CREDIT && (limit <= 0 || days <= 0)) {
      throw new ConflictException('El crédito requiere límite y días mayores a cero');
    }
  }

  private async validateAddress(dto: {
    latitude?: number;
    longitude?: number;
    zoneId?: string;
    distributionDayId?: string;
  }): Promise<void> {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new ConflictException('Latitud y longitud deben registrarse juntas');
    }
    if (dto.zoneId && !(await this.zoneRepository.exists({ where: { id: dto.zoneId } }))) {
      throw new NotFoundException('La zona indicada no existe');
    }
    if (dto.distributionDayId) {
      const day = await this.dayRepository.findOne({ where: { id: dto.distributionDayId } });
      if (!day) throw new NotFoundException('El día de distribución no existe');
      if (!dto.zoneId || day.zoneId !== dto.zoneId) {
        throw new ConflictException('El día de distribución no pertenece a la zona seleccionada');
      }
    }
  }

  private async assertNotDuplicate(
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
