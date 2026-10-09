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
import { UserType } from '../users/entities/user-type.enum';
import { CatalogQueryDto, CreateProductPriceDto, PriceQueryDto, UpdateProductPriceDto } from './dto/pricing.dto';
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
  code: string;
  name: string;
  imageUrl: string | null;
  category: Product['category'];
  productLine: Product['productLine'];
  baseUnit: Product['baseUnit'];
  presentations: CatalogPresentation[];
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
    if (query.commercialList) builder.andWhere('lower(price.commercialList) = lower(:commercialList)', { commercialList: query.commercialList.trim() });
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
    const condition = this.normalizeCondition(dto.customerType, dto.commercialList);
    this.validatePeriod(dto.validFrom, dto.validUntil);
    await this.assertNoOverlap(presentationId, condition.customerType, condition.commercialList, dto.validFrom, dto.validUntil ?? null);
    const price = await this.priceRepository.save(this.priceRepository.create({
      presentationId,
      ...condition,
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
      metadata: { presentationId, customerType: condition.customerType, commercialList: condition.commercialList, validFrom: dto.validFrom, validUntil: dto.validUntil ?? null },
    });
    return this.findOne(price.id);
  }

  async update(id: string, dto: UpdateProductPriceDto, actor: AuthenticatedUser) {
    const price = await this.findOne(id);
    let nextCustomerType = price.customerType ?? undefined;
    let nextCommercialList = price.commercialList ?? undefined;
    if (dto.customerType !== undefined) {
      nextCustomerType = dto.customerType;
      nextCommercialList = undefined;
    }
    if (dto.commercialList !== undefined) {
      nextCommercialList = dto.commercialList;
      if (dto.commercialList.trim()) nextCustomerType = undefined;
    }
    const condition = this.normalizeCondition(nextCustomerType, nextCommercialList);
    const validFrom = dto.validFrom ?? price.validFrom;
    const validUntil = dto.validUntil !== undefined ? dto.validUntil || null : price.validUntil;
    this.validatePeriod(validFrom, validUntil ?? undefined);
    const intendedStatus = dto.status ?? price.status;
    if (intendedStatus === RecordStatus.ACTIVE) {
      await this.assertNoOverlap(price.presentationId, condition.customerType, condition.commercialList, validFrom, validUntil, id);
    }
    Object.assign(price, {
      ...condition,
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
        .where('product.code ILIKE :q', { q: `%${query.q}%` })
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
    customer: Pick<Customer, 'type' | 'commercialList'>,
    date: string,
    manager?: EntityManager,
  ): Promise<ProductPrice | null> {
    const repository = manager?.getRepository(ProductPrice) ?? this.priceRepository;
    const builder = repository.createQueryBuilder('price')
      .where('price.presentationId = :presentationId', { presentationId })
      .andWhere('price.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('price.validFrom <= :date', { date })
      .andWhere('(price.validUntil IS NULL OR price.validUntil >= :date)', { date });
    if (customer.commercialList) {
      builder.andWhere(new Brackets((where) => where
        .where('lower(price.commercialList) = lower(:commercialList)', { commercialList: customer.commercialList })
        .orWhere('(price.commercialList IS NULL AND price.customerType = :customerType)', { customerType: customer.type })));
      builder.orderBy('CASE WHEN price.commercialList IS NOT NULL THEN 0 ELSE 1 END', 'ASC');
    } else {
      builder.andWhere('price.commercialList IS NULL AND price.customerType = :customerType', { customerType: customer.type });
    }
    return builder.addOrderBy('price.validFrom', 'DESC').getOne();
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

  private normalizeCondition(customerType?: ProductPrice['customerType'], commercialList?: string) {
    const list = commercialList?.trim().toUpperCase() || null;
    const type = customerType ?? null;
    if ((type === null) === (list === null)) {
      throw new BadRequestException('Debe definir únicamente un tipo de cliente o una lista comercial');
    }
    return { customerType: type, commercialList: list };
  }

  private validatePeriod(validFrom: string, validUntil?: string): void {
    if (validUntil && validUntil < validFrom) {
      throw new BadRequestException('La fecha final debe ser igual o posterior a la fecha inicial');
    }
  }

  private async assertNoOverlap(
    presentationId: string,
    customerType: ProductPrice['customerType'],
    commercialList: string | null,
    validFrom: string,
    validUntil: string | null,
    excludedId?: string,
  ) {
    const builder = this.priceRepository.createQueryBuilder('price')
      .where('price.presentationId = :presentationId', { presentationId })
      .andWhere('price.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('price.validFrom <= COALESCE(CAST(:validUntil AS date), DATE \'9999-12-31\')', { validUntil })
      .andWhere('COALESCE(price.validUntil, DATE \'9999-12-31\') >= CAST(:validFrom AS date)', { validFrom });
    if (commercialList) {
      builder.andWhere('lower(price.commercialList) = lower(:commercialList)', { commercialList });
    } else {
      builder.andWhere('price.commercialList IS NULL AND price.customerType = :customerType', { customerType });
    }
    if (excludedId) builder.andWhere('price.id <> :excludedId', { excludedId });
    if (await builder.getOne()) throw new ConflictException('La vigencia se superpone con otro precio aplicable');
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
