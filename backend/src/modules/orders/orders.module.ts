import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { Stock } from '../inventory/entities/stock.entity';
import { PricingModule } from '../pricing/pricing.module';
import { OrderDetail } from './entities/order-detail.entity';
import { OrderHistory } from './entities/order-history.entity';
import { Order } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    PricingModule,
    TypeOrmModule.forFeature([
      Order,
      OrderDetail,
      OrderHistory,
      Customer,
      CustomerAddress,
      ProductPresentation,
      Stock,
      InventoryReservation,
      AuditEvent,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
