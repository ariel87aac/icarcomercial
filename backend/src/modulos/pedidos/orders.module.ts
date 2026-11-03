import { orderIntegrationProviders } from './infraestructura/order-integration.providers';
import { OrderLinkPort } from './aplicacion/puertos/order-link.port';
import { TypeOrmOrderLinkAdapter } from './infraestructura/typeorm-order-link.adapter';
import { OrderValidationPort } from './aplicacion/puertos/order-validation.port';
import { TypeOrmOrderValidationAdapter } from './infraestructura/typeorm-order-validation.adapter';
import { OrderCancellationPort } from './aplicacion/puertos/order-cancellation.port';
import { TypeOrmOrderCancellationAdapter } from './infraestructura/typeorm-order-cancellation.adapter';
import { OrderReschedulePort } from './aplicacion/puertos/order-reschedule.port';
import { TypeOrmOrderRescheduleAdapter } from './infraestructura/typeorm-order-reschedule.adapter';
import { OrderSubmissionPort } from './aplicacion/puertos/order-submission.port';
import { TypeOrmOrderSubmissionAdapter } from './infraestructura/typeorm-order-submission.adapter';
import { OrderDraftWritePort } from './aplicacion/puertos/order-draft-write.port';
import { TypeOrmOrderDraftWriteAdapter } from './infraestructura/typeorm-order-draft-write.adapter';
import { OrderReadPort } from './aplicacion/puertos/order-read.port';
import { TypeOrmOrderReadAdapter } from './infraestructura/typeorm-order-read.adapter';
import { OrderDetailsService } from './aplicacion/order-details.service';
import { OrderAccessService } from './aplicacion/order-access.service';
import { OrderLinksService } from './aplicacion/order-links.service';
import { OrderNotificationsService } from './aplicacion/order-notifications.service';
import { OrderQueriesService } from './aplicacion/order-queries.service';
import { UpdateOrderUseCase } from './aplicacion/update-order.use-case';
import { CreateOrderUseCase } from './aplicacion/create-order.use-case';
import { OrderSubmissionService } from './aplicacion/order-submission.service';
import { TypeOrmConfirmOrderTransaction } from './infraestructura/typeorm-confirm-order.transaction';
import { OrderConfirmationPort } from './aplicacion/puertos/order-confirmation.port';
import { OrderConfirmationService } from './aplicacion/order-confirmation.service';
import { RescheduleOrderUseCase } from './aplicacion/reschedule-order.use-case';
import { OrderCancellationService } from './aplicacion/order-cancellation.service';
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
  providers: [
    ...orderIntegrationProviders,
    { provide: OrderLinkPort, useClass: TypeOrmOrderLinkAdapter },
    TypeOrmOrderValidationAdapter,
    { provide: OrderValidationPort, useExisting: TypeOrmOrderValidationAdapter },
    { provide: OrderCancellationPort, useClass: TypeOrmOrderCancellationAdapter },
    { provide: OrderReschedulePort, useClass: TypeOrmOrderRescheduleAdapter },
    { provide: OrderSubmissionPort, useClass: TypeOrmOrderSubmissionAdapter },
    OrdersService,
    OrderSchedulingService,
    OrderDetailsService,
    OrderAccessService,
    OrderLinksService,
    OrderNotificationsService,
    OrderQueriesService,
    { provide: OrderReadPort, useClass: TypeOrmOrderReadAdapter },
    UpdateOrderUseCase,
    CreateOrderUseCase,
    { provide: OrderDraftWritePort, useClass: TypeOrmOrderDraftWriteAdapter },
    OrderSubmissionService,
    { provide: OrderConfirmationPort, useClass: TypeOrmConfirmOrderTransaction },
    OrderConfirmationService,
    RescheduleOrderUseCase,
    OrderCancellationService,
  ],
  exports: [OrderSchedulingService],
})
export class OrdersModule {}
