import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { DistributionRoute } from '../distribution/entities/distribution-route.entity';
import { RouteDelivery } from '../distribution/entities/route-delivery.entity';
import { VisitResult } from '../distribution/entities/visit-result.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderPreparation } from '../preparation/entities/order-preparation.entity';
import { Zone } from '../zones/entities/zone.entity';
import { ChannelSetting } from './entities/channel-setting.entity';
import { EstimationSetting } from './entities/estimation-setting.entity';
import { NotificationAttempt } from './entities/notification-attempt.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationWebhook } from './entities/notification-webhook.entity';
import { Notification } from './entities/notification.entity';
import { TrackingLink } from './entities/tracking-link.entity';
import { TrackingUpdate } from './entities/tracking-update.entity';
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
  exports: [TrackingService],
})
export class TrackingModule {}
