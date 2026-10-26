import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { Stock } from '../inventory/entities/stock.entity';
import { PricingModule } from '../pricing/pricing.module';
import { TrackingModule } from '../tracking/tracking.module';
import { OrderDetail } from './entities/order-detail.entity';
import { OrderConfirmationLink } from './entities/order-confirmation-link.entity';
import { OrderHistory } from './entities/order-history.entity';
import { Order } from './entities/order.entity';
import { OrderSchedulingSetting } from './entities/order-scheduling-setting.entity';
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
