import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { ProductPresentation } from '../catalogo/entidades/product-presentation.entity';
import { Product } from '../catalogo/entidades/product.entity';
import { Customer } from '../../clientes/entidades/customer.entity';
import { CustomerType } from '../../clientes/entidades/customer.enums';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import {
  BulkUpdatePricesDto,
  CatalogQueryDto,
  CreateProductPriceDto,
  PriceMatrixQueryDto,
  PriceQueryDto,
  UpdateProductPriceDto,
} from './dto/pricing.dto';
import { ProductPrice } from './entidades/product-price.entity';

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
import { PricingServiceParte03 } from './pricing.03-requirePresentation';

export abstract class PricingServiceParte02 extends PricingServiceParte03 {
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

  protected async findOne(id: string): Promise<ProductPrice> {
      const price = await this.priceRepository.findOne({
        where: { id },
        relations: { presentation: { product: true, unit: true } },
      });
      if (!price) throw new NotFoundException('Precio no encontrado');
      return price;
    }
}
