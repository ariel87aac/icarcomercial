import { productionApplicationProviders } from "./production-application.providers";
import { ProductionTrackingPort } from "./aplicacion/puertos/production-tracking.port";
import { TrackingService } from "../seguimiento-mensajeria/tracking.service";
import { ProductionDeliveriesReadPort } from "./aplicacion/puertos/production-deliveries-read.port";
import { TypeOrmProductionDeliveriesReadAdapter } from "./infraestructura/production-deliveries-read.adapter";
import { ProductionStockRequestReadPort } from "./aplicacion/puertos/production-stock-request-read.port";
import { TypeOrmProductionStockRequestReadAdapter } from "./infraestructura/production-stock-request-read.adapter";
import { ProductionAreasReadPort } from "./aplicacion/puertos/production-areas-read.port";
import { TypeOrmProductionAreasReadAdapter } from "./infraestructura/production-areas-read.adapter";
import { ProductionSummaryPort } from "./aplicacion/puertos/production-summary-read.port";
import { TypeOrmProductionSummaryAdapter } from "./infraestructura/production-summary-read.adapter";
import { ProductionQueriesPort } from "./aplicacion/puertos/production-queries-read.port";
import { TypeOrmProductionQueriesAdapter } from "./infraestructura/production-queries-read.adapter";
import { CancelProductionWritePort } from "./aplicacion/puertos/cancel-production-write.port";
import { TypeOrmCancelProductionWriter } from "./infraestructura/cancel-production.writer";
import { CloseProductionWritePort } from "./aplicacion/puertos/close-production-write.port";
import { TypeOrmCloseProductionWriter } from "./infraestructura/close-production.writer";
import { EmitProductionWritePort } from "./aplicacion/puertos/emit-production-write.port";
import { TypeOrmEmitProductionWriter } from "./infraestructura/emit-production.writer";
import { GenerateProductionWritePort } from "./aplicacion/puertos/generate-production-write.port";
import { TypeOrmGenerateProductionWriter } from "./infraestructura/generate-production.writer";
import { ProductionAreasWritePort } from "./aplicacion/puertos/production-areas-write.port";
import { TypeOrmProductionAreasWriter } from "./infraestructura/production-areas.writer";
import { ProductionDeliveriesWritePort } from "./aplicacion/puertos/production-deliveries-write.port";
import { TypeOrmProductionDeliveriesWriter } from "./infraestructura/production-deliveries.writer";
import { ProductionExecutionWritePort } from "./aplicacion/puertos/production-execution-write.port";
import { TypeOrmProductionExecutionWriter } from "./infraestructura/production-execution.writer";
import { ProductionPlanWritePort } from "./aplicacion/puertos/production-plan-write.port";
import { TypeOrmProductionPlanWriter } from "./infraestructura/production-plan.writer";
import { ProductionStockRequestsWritePort } from "./aplicacion/puertos/production-stock-requests-write.port";
import { TypeOrmProductionStockRequestsWriter } from "./infraestructura/production-stock-requests.writer";
import { ReceiveProductionWritePort } from "./aplicacion/puertos/receive-production-write.port";
import { TypeOrmReceiveProductionWriter } from "./infraestructura/receive-production.writer";
import { ProductionQueryFilters } from "./infraestructura/production-query-filters";
import { ProductionReader } from "./infraestructura/production-reader";
import { ProductionSourcesReader } from "./infraestructura/production-sources-reader";
import { ProductionDraftBuilder } from "./infraestructura/production-draft-builder";
import { ProductionDraftValidator } from "./infraestructura/production-draft-validator";
import { ProductionAreaResolver } from "./infraestructura/production-area-resolver";
import { ProductionTransactionSupport } from "./infraestructura/production-transaction-support";
import { TrackingModule } from "../seguimiento-mensajeria/tracking.module";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditEvent } from "../seguridad/auditoria/entidades/audit-event.entity";
import { ProductPresentation } from "../productos/catalogo/entidades/product-presentation.entity";
import { ProductCategory } from "../productos/catalogo/entidades/product-category.entity";
import { ProductLine } from "../productos/catalogo/entidades/product-line.entity";
import { Product } from "../productos/catalogo/entidades/product.entity";
import { UnitMeasure } from "../productos/catalogo/entidades/unit-measure.entity";
import { InventoryMovement } from "../almacen/entidades/inventory-movement.entity";
import { Stock } from "../almacen/entidades/stock.entity";
import { OrderDetail } from "../pedidos/entidades/order-detail.entity";
import { Order } from "../pedidos/entidades/order.entity";
import {
  ProductionAreasController,
  ProductionConsolidationsController,
  ProductionDeliveriesController,
  ProductionRequirementsController,
  ProductionStockRequestsController,
  ProductionSummaryController,
} from "./production.controller";
import { ProductionService } from "./production.service";
import { ProductionConsolidationDetail } from "./entidades/production-consolidation-detail.entity";
import { ProductionConsolidationHistory } from "./entidades/production-consolidation-history.entity";
import { ProductionConsolidationSource } from "./entidades/production-consolidation-source.entity";
import { ProductionConsolidation } from "./entidades/production-consolidation.entity";
import { ProductionProgress } from "./entidades/production-progress.entity";
import { ProductionArea } from "./entidades/production-area.entity";
import { ProductionDelivery } from "./entidades/production-delivery.entity";
import { StockReplenishmentRequest } from "../almacen/entidades/stock-replenishment-request.entity";
import { StockReplenishmentRequestDetail } from "../almacen/entidades/stock-replenishment-request-detail.entity";
import { ProductionReportController } from "./reportes/production-report.controller";
import { ProductionReportService } from "./reportes/production-report.service";
import { ProductionPlanningReportService } from "./reportes/production-planning-report.service";
import { ProductionOrderReportService } from "./reportes/production-order-report.service";

@Module({
  imports: [
    TrackingModule,
    TypeOrmModule.forFeature([
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
    ]),
  ],
  controllers: [
    ProductionConsolidationsController,
    ProductionRequirementsController,
    ProductionSummaryController,
    ProductionAreasController,
    ProductionDeliveriesController,
    ProductionStockRequestsController,
    ProductionReportController,
  ],
  providers: [
    ...productionApplicationProviders,
    {
      provide: ProductionTrackingPort,
      useFactory: (tracking: TrackingService): ProductionTrackingPort => ({
        refreshStock: async (event) => {
          await tracking.refreshStock(event);
        },
      }),
      inject: [TrackingService],
    },
    {
      provide: ProductionDeliveriesReadPort,
      useClass: TypeOrmProductionDeliveriesReadAdapter,
    },
    {
      provide: ProductionStockRequestReadPort,
      useClass: TypeOrmProductionStockRequestReadAdapter,
    },
    {
      provide: ProductionAreasReadPort,
      useClass: TypeOrmProductionAreasReadAdapter,
    },
    {
      provide: ProductionSummaryPort,
      useClass: TypeOrmProductionSummaryAdapter,
    },
    {
      provide: ProductionQueriesPort,
      useClass: TypeOrmProductionQueriesAdapter,
    },
    {
      provide: CancelProductionWritePort,
      useClass: TypeOrmCancelProductionWriter,
    },
    {
      provide: CloseProductionWritePort,
      useClass: TypeOrmCloseProductionWriter,
    },
    { provide: EmitProductionWritePort, useClass: TypeOrmEmitProductionWriter },
    {
      provide: GenerateProductionWritePort,
      useClass: TypeOrmGenerateProductionWriter,
    },
    {
      provide: ProductionAreasWritePort,
      useClass: TypeOrmProductionAreasWriter,
    },
    {
      provide: ProductionDeliveriesWritePort,
      useClass: TypeOrmProductionDeliveriesWriter,
    },
    {
      provide: ProductionExecutionWritePort,
      useClass: TypeOrmProductionExecutionWriter,
    },
    { provide: ProductionPlanWritePort, useClass: TypeOrmProductionPlanWriter },
    {
      provide: ProductionStockRequestsWritePort,
      useClass: TypeOrmProductionStockRequestsWriter,
    },
    {
      provide: ReceiveProductionWritePort,
      useClass: TypeOrmReceiveProductionWriter,
    },
    ProductionService,
    ProductionReportService,
    ProductionPlanningReportService,
    ProductionOrderReportService,
    ProductionQueryFilters,
    ProductionReader,
    ProductionSourcesReader,
    ProductionDraftBuilder,
    ProductionDraftValidator,
    ProductionAreaResolver,
    ProductionTransactionSupport,
  ],
  exports: [ProductionService, TypeOrmModule],
})
export class ProductionModule {}
