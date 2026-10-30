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
import { PricingServiceBase } from './pricing.base';

export abstract class PricingServiceParte03 extends PricingServiceBase {
  protected async requirePresentation(id: string): Promise<ProductPresentation> {
      const presentation = await this.presentationRepository.findOne({ where: { id }, relations: { product: true, unit: true } });
      if (!presentation) throw new NotFoundException('Presentación no encontrada');
      return presentation;
    }

  protected validatePeriod(validFrom: string, validUntil?: string): void {
      if (validUntil && validUntil < validFrom) {
        throw new BadRequestException('La fecha final debe ser igual o posterior a la fecha inicial');
      }
    }

  protected async assertNoOverlap(
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

  protected priceKey(presentationId: string, customerType: CustomerType): string {
      return `${presentationId}:${customerType}`;
    }

  protected currentDate(): string {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    }

  protected previousDate(value: string): string {
      const date = new Date(`${value}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    }

  protected async resolveCatalogCustomer(requestedCustomerId: string | undefined, actor: AuthenticatedUser): Promise<Customer | null> {
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
