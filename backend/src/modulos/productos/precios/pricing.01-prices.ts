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
import { PricingServiceParte02 } from './pricing.02-bulkUpdate';

export abstract class PricingServiceParte01 extends PricingServiceParte02 {
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
}
