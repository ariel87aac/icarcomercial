import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../seguridad/auditoria/audit.service';
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
