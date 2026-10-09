import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { Vehicle } from '../fleet/entities/vehicle.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { Stock } from '../inventory/entities/stock.entity';
import { OrderPreparationDetail } from '../preparation/entities/order-preparation-detail.entity';
import { OrderPreparation } from '../preparation/entities/order-preparation.entity';
import { PreparationHistory } from '../preparation/entities/preparation-history.entity';
import { User } from '../users/entities/user.entity';
import { Zone } from '../zones/entities/zone.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { DistributionRoutesController, RouteDeliveriesController } from './distribution.controller';
import { DistributionService } from './distribution.service';
import { DistributionRoute } from './entities/distribution-route.entity';
import { RouteDelivery } from './entities/route-delivery.entity';
import { RouteHistory } from './entities/route-history.entity';
import { RouteResponsible } from './entities/route-responsible.entity';
import { RouteSettlement } from './entities/route-settlement.entity';
import { VisitResultDetail } from './entities/visit-result-detail.entity';
import { VisitResult } from './entities/visit-result.entity';

@Module({
  imports: [TrackingModule, TypeOrmModule.forFeature([
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
  ])],
  controllers: [DistributionRoutesController, RouteDeliveriesController],
  providers: [DistributionService],
  exports: [DistributionService, TypeOrmModule],
})
export class DistributionModule {}
