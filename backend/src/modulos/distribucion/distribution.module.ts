import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { CommercialModule } from '../ventas-cobranzas/commercial.module';
import { Vehicle } from './flota/entidades/vehicle.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderPreparationDetail } from '../preparacion/entidades/order-preparation-detail.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { PreparationHistory } from '../preparacion/entidades/preparation-history.entity';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { TrackingModule } from '../seguimiento-mensajeria/tracking.module';
import { DistributionRoutesController, FactoryDeliveriesController, RouteDeliveriesController, WarehouseReturnOrdersController } from './distribution.controller';
import { DistributionService } from './distribution.service';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteHistory } from './entidades/route-history.entity';
import { RouteResponsible } from './entidades/route-responsible.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';
import { VisitResultDetail } from './entidades/visit-result-detail.entity';
import { VisitResult } from './entidades/visit-result.entity';
import { WarehouseReturnOrderDetail } from './entidades/warehouse-return-order-detail.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';

@Module({
  imports: [TrackingModule, CommercialModule, TypeOrmModule.forFeature([
    DistributionRoute,
    RouteResponsible,
    RouteDelivery,
    VisitResult,
    VisitResultDetail,
    RouteHistory,
    RouteSettlement,
    OrderPreparation,
    OrderPreparationDetail,
    PreparationHistory,
    Vehicle,
    User,
    Zone,
    Stock,
    InventoryReservation,
    InventoryMovement,
    AuditEvent,
    ProductPresentation,
    WarehouseReturnOrder,
    WarehouseReturnOrderDetail,
  ])],
  controllers: [DistributionRoutesController, RouteDeliveriesController, FactoryDeliveriesController, WarehouseReturnOrdersController],
  providers: [DistributionService],
  exports: [DistributionService, TypeOrmModule],
})
export class DistributionModule {}
