import { TrackingModule } from '../seguimiento-mensajeria/tracking.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { ProductCategory } from '../productos/catalogo/entidades/product-category.entity';
import { ProductLine } from '../productos/catalogo/entidades/product-line.entity';
import { Product } from '../productos/catalogo/entidades/product.entity';
import { UnitMeasure } from '../productos/catalogo/entidades/unit-measure.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { ProductionAreasController, ProductionConsolidationsController, ProductionDeliveriesController, ProductionRequirementsController, ProductionStockRequestsController, ProductionSummaryController } from './production.controller';
import { ProductionService } from './production.service';
import { ProductionConsolidationDetail } from './entidades/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entidades/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entidades/production-consolidation-source.entity';
import { ProductionConsolidation } from './entidades/production-consolidation.entity';
import { ProductionProgress } from './entidades/production-progress.entity';
import { ProductionArea } from './entidades/production-area.entity';
import { ProductionDelivery } from './entidades/production-delivery.entity';
import { StockReplenishmentRequest } from '../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestDetail } from '../almacen/entidades/stock-replenishment-request-detail.entity';

@Module({
  imports: [TrackingModule, TypeOrmModule.forFeature([
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
