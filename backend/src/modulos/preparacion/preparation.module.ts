import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { TrackingModule } from '../seguimiento-mensajeria/tracking.module';
import { OrderPreparationDetail } from './entidades/order-preparation-detail.entity';
import { OrderPreparation } from './entidades/order-preparation.entity';
import { PreparationHistory } from './entidades/preparation-history.entity';
import { PreparationController } from './preparation.controller';
import { PreparationService } from './preparation.service';

@Module({
  imports: [TrackingModule, TypeOrmModule.forFeature([OrderPreparation, OrderPreparationDetail, PreparationHistory, Order, OrderDetail, Stock, InventoryReservation, AuditEvent])],
  controllers: [PreparationController],
  providers: [PreparationService],
  exports: [PreparationService, TypeOrmModule],
})
export class PreparationModule {}
