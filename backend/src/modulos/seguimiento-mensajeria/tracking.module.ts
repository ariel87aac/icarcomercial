import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../clientes/entidades/customer.entity';
import { DistributionRoute } from '../distribucion/entidades/distribution-route.entity';
import { RouteDelivery } from '../distribucion/entidades/route-delivery.entity';
import { VisitResult } from '../distribucion/entidades/visit-result.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { ChannelSetting } from './entidades/channel-setting.entity';
import { ChannelTestLog } from './entidades/channel-test-log.entity';
import { EstimationSetting } from './entidades/estimation-setting.entity';
import { NotificationAttempt } from './entidades/notification-attempt.entity';
import { NotificationTemplate } from './entidades/notification-template.entity';
import { NotificationWebhook } from './entidades/notification-webhook.entity';
import { Notification } from './entidades/notification.entity';
import { TrackingLink } from './entidades/tracking-link.entity';
import { TrackingUpdate } from './entidades/tracking-update.entity';
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { LimiteApiAdapter } from './limite-api.adapter';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    TrackingLink,
    TrackingUpdate,
    EstimationSetting,
    NotificationTemplate,
    ChannelSetting,
    ChannelTestLog,
    Notification,
    NotificationAttempt,
    NotificationWebhook,
    Order,
    Customer,
    OrderPreparation,
    DistributionRoute,
    RouteDelivery,
    VisitResult,
    Zone,
  ])],
  controllers: [TrackingController],
  providers: [TrackingService, NotificationService, LimiteApiAdapter, ChannelTokenCipherService, NotificationWorkerService],
  exports: [TrackingService, NotificationService],
})
export class TrackingModule {}
