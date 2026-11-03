import { CancelProductionUseCase } from './aplicacion/cancel-production.use-case';
import { ProductionAccessPolicy } from './aplicacion/production-access.policy';
import { ProductionQueriesService } from './aplicacion/production-queries.service';
import { CancelProductionWritePort } from './aplicacion/puertos/cancel-production-write.port';
import { CloseProductionUseCase } from './aplicacion/close-production.use-case';
import { CloseProductionWritePort } from './aplicacion/puertos/close-production-write.port';
import { EmitProductionUseCase } from './aplicacion/emit-production.use-case';
import { EmitProductionWritePort } from './aplicacion/puertos/emit-production-write.port';
import { GenerateProductionUseCase } from './aplicacion/generate-production.use-case';
import { GenerateProductionWritePort } from './aplicacion/puertos/generate-production-write.port';
import { ProductionAreasService } from './aplicacion/production-areas.service';
import { ProductionAreasWritePort } from './aplicacion/puertos/production-areas-write.port';
import { ProductionAreasReadPort } from './aplicacion/puertos/production-areas-read.port';
import { ProductionDeliveriesService } from './aplicacion/production-deliveries.service';
import { ProductionDeliveriesWritePort } from './aplicacion/puertos/production-deliveries-write.port';
import { ProductionDeliveriesReadPort } from './aplicacion/puertos/production-deliveries-read.port';
import { ProductionExecutionService } from './aplicacion/production-execution.service';
import { ProductionExecutionWritePort } from './aplicacion/puertos/production-execution-write.port';
import { ProductionPlanService } from './aplicacion/production-plan.service';
import { ProductionPlanWritePort } from './aplicacion/puertos/production-plan-write.port';
import { ProductionQueriesPort } from './aplicacion/puertos/production-queries-read.port';
import { ProductionStockRequestsService } from './aplicacion/production-stock-requests.service';
import { ProductionStockRequestsWritePort } from './aplicacion/puertos/production-stock-requests-write.port';
import { ProductionStockRequestReadPort } from './aplicacion/puertos/production-stock-request-read.port';
import { ProductionSummaryService } from './aplicacion/production-summary.service';
import { ProductionSummaryPort } from './aplicacion/puertos/production-summary-read.port';
import { ReceiveProductionUseCase } from './aplicacion/receive-production.use-case';
import { ProductionTrackingPort } from './aplicacion/puertos/production-tracking.port';
import { ReceiveProductionWritePort } from './aplicacion/puertos/receive-production-write.port';
import type { Provider } from '@nestjs/common';
export const productionApplicationProviders: Provider[] = [
  {
    provide: CancelProductionUseCase,
    useFactory: (
      productionAccessPolicy: ProductionAccessPolicy,
      productionQueriesService: ProductionQueriesService,
      writer: CancelProductionWritePort,
    ) => new CancelProductionUseCase(productionAccessPolicy, productionQueriesService, writer),
    inject: [ProductionAccessPolicy, ProductionQueriesService, CancelProductionWritePort],
  },
  {
    provide: CloseProductionUseCase,
    useFactory: (
      productionAccessPolicy: ProductionAccessPolicy,
      productionQueriesService: ProductionQueriesService,
      writer: CloseProductionWritePort,
    ) => new CloseProductionUseCase(productionAccessPolicy, productionQueriesService, writer),
    inject: [ProductionAccessPolicy, ProductionQueriesService, CloseProductionWritePort],
  },
  {
    provide: EmitProductionUseCase,
    useFactory: (productionQueriesService: ProductionQueriesService, writer: EmitProductionWritePort) =>
      new EmitProductionUseCase(productionQueriesService, writer),
    inject: [ProductionQueriesService, EmitProductionWritePort],
  },
  {
    provide: GenerateProductionUseCase,
    useFactory: (productionQueriesService: ProductionQueriesService, writer: GenerateProductionWritePort) =>
      new GenerateProductionUseCase(productionQueriesService, writer),
    inject: [ProductionQueriesService, GenerateProductionWritePort],
  },
  { provide: ProductionAccessPolicy, useFactory: () => new ProductionAccessPolicy(), inject: [] },
  {
    provide: ProductionAreasService,
    useFactory: (writer: ProductionAreasWritePort, reader: ProductionAreasReadPort) =>
      new ProductionAreasService(writer, reader),
    inject: [ProductionAreasWritePort, ProductionAreasReadPort],
  },
  {
    provide: ProductionDeliveriesService,
    useFactory: (
      productionQueriesService: ProductionQueriesService,
      writer: ProductionDeliveriesWritePort,
      reader: ProductionDeliveriesReadPort,
    ) => new ProductionDeliveriesService(productionQueriesService, writer, reader),
    inject: [ProductionQueriesService, ProductionDeliveriesWritePort, ProductionDeliveriesReadPort],
  },
  {
    provide: ProductionExecutionService,
    useFactory: (productionQueriesService: ProductionQueriesService, writer: ProductionExecutionWritePort) =>
      new ProductionExecutionService(productionQueriesService, writer),
    inject: [ProductionQueriesService, ProductionExecutionWritePort],
  },
  {
    provide: ProductionPlanService,
    useFactory: (productionQueriesService: ProductionQueriesService, writer: ProductionPlanWritePort) =>
      new ProductionPlanService(productionQueriesService, writer),
    inject: [ProductionQueriesService, ProductionPlanWritePort],
  },
  {
    provide: ProductionQueriesService,
    useFactory: (reader: ProductionQueriesPort) => new ProductionQueriesService(reader),
    inject: [ProductionQueriesPort],
  },
  {
    provide: ProductionStockRequestsService,
    useFactory: (
      productionAccessPolicy: ProductionAccessPolicy,
      writer: ProductionStockRequestsWritePort,
      reader: ProductionStockRequestReadPort,
    ) => new ProductionStockRequestsService(productionAccessPolicy, writer, reader),
    inject: [ProductionAccessPolicy, ProductionStockRequestsWritePort, ProductionStockRequestReadPort],
  },
  {
    provide: ProductionSummaryService,
    useFactory: (reader: ProductionSummaryPort) => new ProductionSummaryService(reader),
    inject: [ProductionSummaryPort],
  },
  {
    provide: ReceiveProductionUseCase,
    useFactory: (
      trackingService: ProductionTrackingPort,
      reader: ProductionDeliveriesReadPort,
      writer: ReceiveProductionWritePort,
    ) => new ReceiveProductionUseCase(trackingService, reader, writer),
    inject: [ProductionTrackingPort, ProductionDeliveriesReadPort, ReceiveProductionWritePort],
  },
];
