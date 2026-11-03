import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { ProductionArea } from '../produccion/entidades/production-area.entity';
import { StockReplenishmentRequestDetail } from './entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from './entidades/stock-replenishment-request.entity';

export abstract class StockReplenishmentRequestServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(StockReplenishmentRequest)
        protected readonly requestRepository: Repository<StockReplenishmentRequest>,
        @InjectRepository(StockReplenishmentRequestDetail)
        protected readonly detailRepository: Repository<StockReplenishmentRequestDetail>,
        @InjectRepository(ProductPresentation)
        protected readonly presentationRepository: Repository<ProductPresentation>,
        @InjectRepository(ProductionArea)
        protected readonly areaRepository: Repository<ProductionArea>,
        protected readonly dataSource: DataSource,
        protected readonly auditService: AuditService,
      ) {}
}
