import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { Product } from '../catalog/entities/product.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerType } from '../customers/entities/customer.enums';
import { UserType } from '../users/entities/user-type.enum';
import {
  BulkUpdatePricesDto,
  CatalogQueryDto,
  CreateProductPriceDto,
  PriceMatrixQueryDto,
  PriceQueryDto,
  UpdateProductPriceDto,
} from './dto/pricing.dto';
import { ProductPrice } from './entities/product-price.entity';

export interface CatalogPresentation {
  id: string;
  description: string;
  conversionFactor: string;
  unit: ProductPresentation['unit'];
  price: ProductPrice | null;
}

export interface CatalogProduct {
  id: string;
  code: number;
  name: string;
  imageUrl: string | null;
  category: Product['category'];
  productLine: Product['productLine'];
  baseUnit: Product['baseUnit'];
  presentations: CatalogPresentation[];
}

export interface PriceMatrixRow {
  presentationId: string;
  productCode: number;
  productName: string;
  categoryId: string;
  categoryName: string;
  presentationDescription: string;
  prices: Record<CustomerType, string | null>;
  lastModifiedAt: Date | null;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(ProductPrice)
    private readonly priceRepository: Repository<ProductPrice>,
    @InjectRepository(ProductPresentation)
    private readonly presentationRepository: Repository<ProductPresentation>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly auditService: AuditService,
  ) {}

  async prices(query: PriceQueryDto): Promise<PaginatedResponse<ProductPrice>> {
    const builder = this.priceRepository.createQueryBuilder('price')
      .leftJoinAndSelect('price.presentation', 'presentation')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('presentation.unit', 'unit')
      .orderBy('price.validFrom', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.presentationId) builder.andWhere('price.presentationId = :presentationId', { presentationId: query.presentationId });
    if (query.customerType) builder.andWhere('price.customerType = :customerType', { customerType: query.customerType });
    if (query.status) builder.andWhere('price.status = :status', { status: query.status });
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async pricesForPresentation(presentationId: string): Promise<ProductPrice[]> {
    await this.requirePresentation(presentationId);
    return this.priceRepository.find({
      where: { presentationId },
      order: { validFrom: 'DESC' },
    });
  }

  async create(presentationId: string, dto: CreateProductPriceDto, actor: AuthenticatedUser) {
    await this.requirePresentation(presentationId);
    this.validatePeriod(dto.validFrom, dto.validUntil);
    await this.assertNoOverlap(presentationId, dto.customerType, dto.validFrom, dto.validUntil ?? null);
    const price = await this.priceRepository.save(this.priceRepository.create({
      presentationId,
      customerType: dto.customerType,
      amount: dto.amount.toFixed(2),
      validFrom: dto.validFrom,
      validUntil: dto.validUntil ?? null,
    }));
    await this.auditService.record({
      userId: actor.id,
      module: 'pricing',
      action: 'CREAR_PRECIO',
      entity: 'precios_producto',
      entityId: price.id,
      result: 'EXITOSO',
      metadata: { presentationId, customerType: dto.customerType, validFrom: dto.validFrom, validUntil: dto.validUntil ?? null },
    });
    return this.findOne(price.id);
  }

  async update(id: string, dto: UpdateProductPriceDto, actor: AuthenticatedUser) {
    const price = await this.findOne(id);
    const customerType = dto.customerType ?? price.customerType;
    const validFrom = dto.validFrom ?? price.validFrom;
    const validUntil = dto.validUntil !== undefined ? dto.validUntil || null : price.validUntil;
    this.validatePeriod(validFrom, validUntil ?? undefined);
    const intendedStatus = dto.status ?? price.status;
    if (intendedStatus === RecordStatus.ACTIVE) {
      await this.assertNoOverlap(price.presentationId, customerType, validFrom, validUntil, id);
    }
    Object.assign(price, {
      customerType,
      validFrom,
      validUntil,
      ...(dto.amount !== undefined ? { amount: dto.amount.toFixed(2) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    await this.priceRepository.save(price);
    const action = dto.status === RecordStatus.ACTIVE
      ? 'ACTIVAR_PRECIO'
      : dto.status === RecordStatus.INACTIVE
        ? 'DESACTIVAR_PRECIO'
        : 'ACTUALIZAR_PRECIO';
    await this.auditService.record({
      userId: actor.id,
      module: 'pricing',
      action,
      entity: 'precios_producto',
      entityId: id,
      result: 'EXITOSO',
      metadata: { fields: Object.keys(dto) },
    });
    return this.findOne(id);
  }

  async priceMatrix(query: PriceMatrixQueryDto): Promise<PaginatedResponse<PriceMatrixRow>> {
    const builder = this.presentationRepository.createQueryBuilder('presentation')
      .innerJoinAndSelect('presentation.product', 'product')
      .innerJoinAndSelect('product.category', 'category')
      .where('presentation.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('product.status = :active', { active: RecordStatus.ACTIVE })
      .orderBy('product.code', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('presentation.description', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.q) {
      builder.andWhere(new Brackets((where) => where
        .where('CAST(product.code AS text) ILIKE :q', { q: `%${query.q}%` })
        .orWhere('unaccent(product.name) ILIKE unaccent(:q)', { q: `%${query.q}%` })
        .orWhere('unaccent(presentation.description) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
    }
    const [presentations, total] = await builder.getManyAndCount();
    if (!presentations.length) return paginate([], total, query.page, query.limit);

    const today = this.currentDate();
    const prices = await this.priceRepository.createQueryBuilder('price')
      .where('price.presentationId IN (:...presentationIds)', { presentationIds: presentations.map((item) => item.id) })
      .andWhere('price.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('price.validFrom <= :today', { today })
      .andWhere('(price.validUntil IS NULL OR price.validUntil >= :today)', { today })
      .orderBy('price.presentationId', 'ASC')
      .addOrderBy('price.customerType', 'ASC')
      .addOrderBy('price.validFrom', 'DESC')
      .addOrderBy('price.updatedAt', 'DESC')
      .getMany();
    const applicable = new Map<string, ProductPrice>();
    for (const price of prices) {
      const key = this.priceKey(price.presentationId, price.customerType);
      if (!applicable.has(key)) applicable.set(key, price);
    }
    const types = Object.values(CustomerType);
    const rows = presentations.map((presentation): PriceMatrixRow => {
      const rowPrices = {} as Record<CustomerType, string | null>;
      let lastModifiedAt: Date | null = null;
      for (const type of types) {
        const price = applicable.get(this.priceKey(presentation.id, type));
        rowPrices[type] = price?.amount ?? null;
        if (price && (!lastModifiedAt || price.updatedAt > lastModifiedAt)) lastModifiedAt = price.updatedAt;
      }
      return {
        presentationId: presentation.id,
        productCode: presentation.product.code,
        productName: presentation.product.name,
        categoryId: presentation.product.categoryId,
        categoryName: presentation.product.category.name,
        presentationDescription: presentation.description,
        prices: rowPrices,
        lastModifiedAt,
      };
    });
    return paginate(rows, total, query.page, query.limit);
  }

  async bulkUpdate(dto: BulkUpdatePricesDto, actor: AuthenticatedUser) {
    const unique = new Map<string, (typeof dto.items)[number]>();
    for (const item of dto.items) {
      const key = this.priceKey(item.presentationId, item.customerType);
      if (unique.has(key)) throw new BadRequestException('No se puede enviar dos veces el mismo precio');
      unique.set(key, item);
    }
    const items = [...unique.values()];
    const today = this.currentDate();
    const updated = await this.priceRepository.manager.transaction(async (manager) => {
      const presentationIds = [...new Set(items.map((item) => item.presentationId))];
      const presentations = await manager.getRepository(ProductPresentation).createQueryBuilder('presentation')
        .where('presentation.id IN (:...presentationIds)', { presentationIds })
        .andWhere('presentation.status = :active', { active: RecordStatus.ACTIVE })
        .orderBy('presentation.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      if (presentations.length !== presentationIds.length) {
        throw new BadRequestException('Una o más presentaciones no existen o están inactivas');
      }

      const repository = manager.getRepository(ProductPrice);
      const existing = await repository.createQueryBuilder('price')
        .where('price.presentationId IN (:...presentationIds)', { presentationIds })
        .andWhere('price.status = :active', { active: RecordStatus.ACTIVE })
        .setLock('pessimistic_write')
        .orderBy('price.validFrom', 'DESC')
        .getMany();
      const byCondition = new Map<string, ProductPrice[]>();
      for (const price of existing) {
        const key = this.priceKey(price.presentationId, price.customerType);
        byCondition.set(key, [...(byCondition.get(key) ?? []), price]);
      }

      const entities: ProductPrice[] = [];
      for (const item of items) {
        const conditionPrices = byCondition.get(this.priceKey(item.presentationId, item.customerType)) ?? [];
        const current = conditionPrices.find((price) => price.validFrom <= today && (!price.validUntil || price.validUntil >= today));
        if (current) {
          current.amount = item.amount.toFixed(2);
          entities.push(current);
          continue;
        }
        const next = conditionPrices
          .filter((price) => price.validFrom > today)
          .sort((left, right) => left.validFrom.localeCompare(right.validFrom))[0];
        entities.push(repository.create({
          presentationId: item.presentationId,
          customerType: item.customerType,
          amount: item.amount.toFixed(2),
          validFrom: today,
          validUntil: next ? this.previousDate(next.validFrom) : null,
          status: RecordStatus.ACTIVE,
        }));
      }
      await repository.save(entities);
      return entities.length;
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'pricing',
      action: 'ACTUALIZAR_PRECIOS_MASIVO',
      entity: 'precios_producto',
      result: 'EXITOSO',
      metadata: { updated, presentationCount: new Set(items.map((item) => item.presentationId)).size },
    });
    return { updated };
  }

  async catalog(query: CatalogQueryDto, actor: AuthenticatedUser) {
    const customer = await this.resolveCatalogCustomer(query.customerId, actor);
    const builder = this.productRepository.createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.productLine', 'productLine')
      .leftJoinAndSelect('product.baseUnit', 'baseUnit')
      .leftJoinAndSelect('product.presentations', 'presentation', 'presentation.status = :active', { active: RecordStatus.ACTIVE })
      .leftJoinAndSelect('presentation.unit', 'presentationUnit')
      .where('product.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('category.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('productLine.status = :active', { active: RecordStatus.ACTIVE })
      .orderBy('product.name', 'ASC')
      .addOrderBy('presentation.description', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.q) {
      builder.andWhere(new Brackets((where) => where
        .where('CAST(product.code AS text) ILIKE :q', { q: `%${query.q}%` })
        .orWhere('unaccent(product.name) ILIKE unaccent(:q)', { q: `%${query.q}%` })
        .orWhere('unaccent(presentation.description) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
    }
    if (query.categoryId) builder.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.productLineId) builder.andWhere('product.productLineId = :productLineId', { productLineId: query.productLineId });
    const [products, total] = await builder.getManyAndCount();
    const today = new Date().toISOString().slice(0, 10);
    const data: CatalogProduct[] = [];
    for (const product of products) {
      const presentations: CatalogPresentation[] = [];
      for (const presentation of product.presentations ?? []) {
        const price = customer
          ? await this.resolveApplicablePrice(presentation.id, customer, today)
          : null;
        if (customer && !price) continue;
        presentations.push({
          id: presentation.id,
          description: presentation.description,
          conversionFactor: presentation.conversionFactor,
          unit: presentation.unit,
          price,
        });
      }
      if (presentations.length) {
        data.push({
          id: product.id,
          code: product.code,
          name: product.name,
          imageUrl: product.imageMime
            ? `/api/catalogo/productos/${product.id}/imagen?v=${product.updatedAt.getTime()}`
            : null,
          category: product.category,
          productLine: product.productLine,
          baseUnit: product.baseUnit,
          presentations,
        });
      }
    }
    return paginate(data, total, query.page, query.limit);
  }

  async resolveApplicablePrice(
    presentationId: string,
    customer: Pick<Customer, 'type'>,
    date: string,
    manager?: EntityManager,
  ): Promise<ProductPrice | null> {
    const repository = manager?.getRepository(ProductPrice) ?? this.priceRepository;
    const builder = repository.createQueryBuilder('price')
      .where('price.presentationId = :presentationId', { presentationId })
      .andWhere('price.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('price.validFrom <= :date', { date })
      .andWhere('(price.validUntil IS NULL OR price.validUntil >= :date)', { date });
    return builder
      .andWhere('price.customerType = :customerType', { customerType: customer.type })
      .orderBy('price.validFrom', 'DESC')
      .getOne();
  }

  private async findOne(id: string): Promise<ProductPrice> {
    const price = await this.priceRepository.findOne({
      where: { id },
      relations: { presentation: { product: true, unit: true } },
    });
    if (!price) throw new NotFoundException('Precio no encontrado');
    return price;
  }

  private async requirePresentation(id: string): Promise<ProductPresentation> {
    const presentation = await this.presentationRepository.findOne({ where: { id }, relations: { product: true, unit: true } });
    if (!presentation) throw new NotFoundException('Presentación no encontrada');
    return presentation;
  }

  private validatePeriod(validFrom: string, validUntil?: string): void {
    if (validUntil && validUntil < validFrom) {
      throw new BadRequestException('La fecha final debe ser igual o posterior a la fecha inicial');
    }
  }

  private async assertNoOverlap(
    presentationId: string,
    customerType: ProductPrice['customerType'],
    validFrom: string,
    validUntil: string | null,
    excludedId?: string,
  ) {
    const builder = this.priceRepository.createQueryBuilder('price')
      .where('price.presentationId = :presentationId', { presentationId })
      .andWhere('price.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('price.validFrom <= COALESCE(CAST(:validUntil AS date), DATE \'9999-12-31\')', { validUntil })
      .andWhere('COALESCE(price.validUntil, DATE \'9999-12-31\') >= CAST(:validFrom AS date)', { validFrom });
    builder.andWhere('price.customerType = :customerType', { customerType });
    if (excludedId) builder.andWhere('price.id <> :excludedId', { excludedId });
    if (await builder.getOne()) throw new ConflictException('La vigencia se superpone con otro precio aplicable');
  }

  private priceKey(presentationId: string, customerType: CustomerType): string {
    return `${presentationId}:${customerType}`;
  }

  private currentDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private previousDate(value: string): string {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  private async resolveCatalogCustomer(requestedCustomerId: string | undefined, actor: AuthenticatedUser): Promise<Customer | null> {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : requestedCustomerId;
    if (!customerId) return null;
    const customer = await this.customerRepository.findOne({ where: { id: customerId, status: RecordStatus.ACTIVE } });
    if (!customer) throw new NotFoundException('Cliente no encontrado o inactivo');
    if (actor.type === UserType.CUSTOMER && customer.id !== actor.customerId) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return customer;
  }
}
