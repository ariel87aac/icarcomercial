import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { Stock } from '../inventory/entities/stock.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { Order } from '../orders/entities/order.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { OrderPreparationDetail } from './entities/order-preparation-detail.entity';
import { OrderPreparation } from './entities/order-preparation.entity';
import { PreparationHistory } from './entities/preparation-history.entity';
import { PreparationController } from './preparation.controller';
import { PreparationService } from './preparation.service';

@Module({
  imports: [TrackingModule, TypeOrmModule.forFeature([OrderPreparation, OrderPreparationDetail, PreparationHistory, Order, OrderDetail, Stock, InventoryReservation, AuditEvent])],
  controllers: [PreparationController],
  providers: [PreparationService],
  exports: [PreparationService, TypeOrmModule],
})
export class PreparationModule {}
