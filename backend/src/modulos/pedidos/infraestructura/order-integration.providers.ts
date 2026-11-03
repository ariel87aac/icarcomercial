import { Provider } from '@nestjs/common';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { TrackingService } from '../../seguimiento-mensajeria/tracking.service';
import { NotificationService } from '../../seguimiento-mensajeria/notification.service';
import { OrderSchedulingService } from '../order-scheduling.service';
import { OrderAuditPort } from '../aplicacion/puertos/order-audit.port';
import { OrderTrackingPort } from '../aplicacion/puertos/order-tracking.port';
import { OrderMessagingPort } from '../aplicacion/puertos/order-messaging.port';
import { OrderSchedulingPort } from '../aplicacion/puertos/order-scheduling.port';
import { OrderPublicUrlPort } from '../aplicacion/puertos/order-public-url.port';
import { ConfigOrderPublicUrlAdapter } from './config-order-public-url.adapter';

/** Las factories verifican compatibilidad de tipos y reutilizan los proveedores existentes. */
export const orderIntegrationProviders: Provider[] = [
  { provide: OrderAuditPort, inject: [AuditService], useFactory: (service: AuditService): OrderAuditPort => service },
  {
    provide: OrderTrackingPort,
    inject: [TrackingService],
    useFactory: (service: TrackingService): OrderTrackingPort => service,
  },
  {
    provide: OrderMessagingPort,
    inject: [NotificationService],
    useFactory: (service: NotificationService): OrderMessagingPort => service,
  },
  {
    provide: OrderSchedulingPort,
    inject: [OrderSchedulingService],
    useFactory: (service: OrderSchedulingService): OrderSchedulingPort => service,
  },
  { provide: OrderPublicUrlPort, useClass: ConfigOrderPublicUrlAdapter },
];
