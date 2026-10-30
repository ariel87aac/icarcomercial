import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { ProductionArea } from '../produccion/entidades/production-area.entity';
import {
  CreateStockReplenishmentRequestDto,
  SaveStockReplenishmentRequestDto,
  StockReplenishmentPlanQueryDto,
  StockReplenishmentRequestQueryDto,
} from './dto/inventory.dto';
import { StockReplenishmentRequestDetail } from './entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from './entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from './entidades/inventory.enums';
import { projectedAvailableQuantity } from './inventory-calculations';

interface StockRequestMetrics {
  presentationId: string;
  physicalQuantity: string;
  reservedQuantity: string;
  demandQuantity: string;
  shortageQuantity: string;
}
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
