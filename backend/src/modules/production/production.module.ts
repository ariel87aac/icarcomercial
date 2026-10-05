import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { ProductLine } from '../catalog/entities/product-line.entity';
import { Product } from '../catalog/entities/product.entity';
import { UnitMeasure } from '../catalog/entities/unit-measure.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductionConsolidationsController, ProductionRequirementsController, ProductionSummaryController } from './production.controller';
import { ProductionService } from './production.service';
import { ProductionConsolidationDetail } from './entities/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entities/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entities/production-consolidation-source.entity';
import { ProductionConsolidation } from './entities/production-consolidation.entity';
import { ProductionProgress } from './entities/production-progress.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    ProductionConsolidation,
    ProductionConsolidationDetail,
    ProductionConsolidationSource,
    ProductionProgress,
    ProductionConsolidationHistory,
    Order,
    OrderDetail,
    Product,
    ProductPresentation,
    ProductLine,
    UnitMeasure,
    AuditEvent,
  ])],
  controllers: [ProductionConsolidationsController, ProductionRequirementsController, ProductionSummaryController],
  providers: [ProductionService],
  exports: [ProductionService, TypeOrmModule],
})
export class ProductionModule {}
