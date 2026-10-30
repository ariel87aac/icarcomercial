import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { CustomerAddress } from '../clientes/entidades/customer-address.entity';
import { Customer } from '../clientes/entidades/customer.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { PricingModule } from '../productos/precios/pricing.module';
import { TrackingModule } from '../seguimiento-mensajeria/tracking.module';
import { OrderDetail } from './entidades/order-detail.entity';
import { OrderConfirmationLink } from './entidades/order-confirmation-link.entity';
import { OrderHistory } from './entidades/order-history.entity';
import { Order } from './entidades/order.entity';
import { OrderSchedulingSetting } from './entidades/order-scheduling-setting.entity';
import { OrderSchedulingController } from './order-scheduling.controller';
import { OrderSchedulingService } from './order-scheduling.service';
import { OrdersController, PublicOrderConfirmationsController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    PricingModule,
    TrackingModule,
    TypeOrmModule.forFeature([
      Order,
      OrderConfirmationLink,
      OrderDetail,
      OrderHistory,
      Customer,
      CustomerAddress,
      ProductPresentation,
      Stock,
      InventoryReservation,
      AuditEvent,
      OrderSchedulingSetting,
    ]),
  ],
  controllers: [OrdersController, PublicOrderConfirmationsController, OrderSchedulingController],
  providers: [OrdersService, OrderSchedulingService],
  exports: [OrderSchedulingService],
})
export class OrdersModule {}
