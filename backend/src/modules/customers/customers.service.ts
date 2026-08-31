import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { DistributionDay } from '../zones/entities/distribution-day.entity';
import { Zone } from '../zones/entities/zone.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerAddress } from './entities/customer-address.entity';
import { Customer } from './entities/customer.entity';
import { PaymentCondition } from './entities/customer.enums';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepository: Repository<CustomerAddress>,
    @InjectRepository(Zone) private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(DistributionDay)
    private readonly dayRepository: Repository<DistributionDay>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: CustomerQueryDto): Promise<PaginatedResponse<Customer>> {
    const builder = this.customerRepository
      .createQueryBuilder('customer')
      .distinct(true)
      .leftJoinAndSelect('customer.addresses', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('address.distributionDay', 'day')
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

    const [customers, total] = await builder.getManyAndCount();
    return paginate(customers, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: {
        addresses: { zone: true, distributionDay: true },
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
    return this.findOne(customer.id);
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser): Promise<Customer> {
    const customer = await this.findOne(id);
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
    await this.auditService.record({
      userId: actor.id,
      module: 'customers',
      action: 'ACTUALIZAR_CLIENTE',
      entity: 'clientes',
      entityId: customer.id,
      result: 'EXITOSO',
      metadata: { fields: Object.keys(dto), status: dto.status ?? customer.status },
    });
    return this.findOne(id);
  }

  async addresses(customerId: string): Promise<CustomerAddress[]> {
    await this.findOne(customerId);
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
    await this.findOne(customerId);
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

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
    actor: AuthenticatedUser,
  ): Promise<CustomerAddress> {
    const address = await this.addressRepository.findOne({ where: { id: addressId, customerId } });
    if (!address) throw new NotFoundException('Domicilio no encontrado');
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
    await this.auditService.record({
      userId: actor.id,
      module: 'customers',
      action: 'ACTUALIZAR_DOMICILIO',
      entity: 'domicilios_cliente',
      entityId: address.id,
      result: 'EXITOSO',
      metadata: { customerId, fields: Object.keys(dto) },
    });
    return this.addressRepository.findOneOrFail({
      where: { id: address.id },
      relations: { zone: true, distributionDay: true },
    });
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
