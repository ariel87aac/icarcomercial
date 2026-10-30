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
export abstract class PricingServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(ProductPrice)
        protected readonly priceRepository: Repository<ProductPrice>,
        @InjectRepository(ProductPresentation)
        protected readonly presentationRepository: Repository<ProductPresentation>,
        @InjectRepository(Product)
        protected readonly productRepository: Repository<Product>,
        @InjectRepository(Customer)
        protected readonly customerRepository: Repository<Customer>,
        protected readonly auditService: AuditService,
      ) {}
}
