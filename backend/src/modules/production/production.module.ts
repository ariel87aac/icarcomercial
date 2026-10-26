import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { ProductCategory } from '../catalog/entities/product-category.entity';
import { ProductLine } from '../catalog/entities/product-line.entity';
import { Product } from '../catalog/entities/product.entity';
import { UnitMeasure } from '../catalog/entities/unit-measure.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { Stock } from '../inventory/entities/stock.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductionAreasController, ProductionConsolidationsController, ProductionDeliveriesController, ProductionRequirementsController, ProductionStockRequestsController, ProductionSummaryController } from './production.controller';
import { ProductionService } from './production.service';
import { ProductionConsolidationDetail } from './entities/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entities/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entities/production-consolidation-source.entity';
import { ProductionConsolidation } from './entities/production-consolidation.entity';
import { ProductionProgress } from './entities/production-progress.entity';
import { ProductionArea } from './entities/production-area.entity';
import { ProductionDelivery } from './entities/production-delivery.entity';
import { StockReplenishmentRequest } from '../inventory/entities/stock-replenishment-request.entity';
import { StockReplenishmentRequestDetail } from '../inventory/entities/stock-replenishment-request-detail.entity';

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
    ProductCategory,
    ProductPresentation,
    ProductLine,
    UnitMeasure,
    AuditEvent,
    ProductionArea,
    ProductionDelivery,
    Stock,
    InventoryMovement,
    StockReplenishmentRequest,
    StockReplenishmentRequestDetail,
  ])],
  controllers: [ProductionConsolidationsController, ProductionRequirementsController, ProductionSummaryController, ProductionAreasController, ProductionDeliveriesController, ProductionStockRequestsController],
  providers: [ProductionService],
  exports: [ProductionService, TypeOrmModule],
})
export class ProductionModule {}
