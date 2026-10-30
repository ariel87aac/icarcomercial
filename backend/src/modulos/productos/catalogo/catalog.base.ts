import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '../../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import {
  CreateNamedCatalogItemDto,
  CreateProductDto,
  CreateProductPresentationDto,
  CreateUnitMeasureDto,
  ProductQueryDto,
  UpdateNamedCatalogItemDto,
  UpdateProductImageDto,
  UpdateProductDto,
  UpdateProductPresentationDto,
  UpdateUnitMeasureDto,
} from './dto/catalog.dto';
import { ProductCategory } from './entidades/product-category.entity';
import { ProductLine } from './entidades/product-line.entity';
import { ProductPresentation } from './entidades/product-presentation.entity';
import { Product } from './entidades/product.entity';
import { UnitMeasure } from './entidades/unit-measure.entity';
export abstract class CatalogServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(ProductCategory)
        protected readonly categoryRepository: Repository<ProductCategory>,
        @InjectRepository(ProductLine)
        protected readonly lineRepository: Repository<ProductLine>,
        @InjectRepository(UnitMeasure)
        protected readonly unitRepository: Repository<UnitMeasure>,
        @InjectRepository(Product)
        protected readonly productRepository: Repository<Product>,
        @InjectRepository(ProductPresentation)
        protected readonly presentationRepository: Repository<ProductPresentation>,
        protected readonly auditService: AuditService,
      ) {}
}
