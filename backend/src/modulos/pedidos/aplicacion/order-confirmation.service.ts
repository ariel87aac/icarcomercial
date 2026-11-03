import { NotFoundException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { TransitionOrderDto } from '../dto/order.dto';
import { Order } from '../entidades/order.entity';
import { OrderStatus, OrderConfirmationLinkStatus, OrderOrigin } from '../entidades/order.enums';
import { PublicOrderConfirmationView } from './public-order-confirmation.view';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderAccessService } from './order-access.service';
import { OrderLinksService } from './order-links.service';
import { OrderNotificationsService } from './order-notifications.service';
import { OrderQueriesService } from './order-queries.service';
import { OrderConfirmationPort } from './puertos/order-confirmation.port';

@Injectable()
export class OrderConfirmationService {
  constructor(
    private readonly confirmOrderTransaction: OrderConfirmationPort,
    private readonly orderQueriesService: OrderQueriesService,
    private readonly orderNotificationsService: OrderNotificationsService,
    private readonly orderLinksService: OrderLinksService,
    private readonly orderAccessService: OrderAccessService,
    private readonly trackingService: OrderTrackingPort,
  ) {}

  async confirm(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
    await this.confirmOrderTransaction.confirmOrder(id, {
      actorId: actor.id,
      reservationUserId: actor.id,
      allowedStatuses: [OrderStatus.RECEIVED],
      origin: OrderOrigin.INTERNAL,
      observation: dto.observation?.trim() || 'Pedido confirmado y reservado',
      action: 'CONFIRMAR_PEDIDO',
    });
    const confirmed = await this.orderQueriesService.findOne(id, actor);
    await this.orderNotificationsService.afterConfirmation(confirmed, actor.id, `order.confirmed:${id}`);
    return confirmed;
  }

  async publicConfirmation(token: string): Promise<PublicOrderConfirmationView> {
    const link = await this.orderLinksService.resolveConfirmationLink(token, true);
    const order = await this.orderAccessService.loadOrder(link.orderId);
    return {
      ...this.orderLinksService.publicConfirmationView(order, link.status === OrderConfirmationLinkStatus.ACTIVE),
      trackingUrl: await this.trackingService.ensureOrderLink(order),
    };
  }

  async confirmPublic(token: string): Promise<PublicOrderConfirmationView> {
    const tokenHash = this.orderLinksService.hashToken(token);
    const currentLink = await this.orderLinksService.resolveConfirmationLink(token, false);
    const order = await this.orderAccessService.loadOrder(currentLink.orderId);
    await this.confirmOrderTransaction.confirmOrder(order.id, {
      actorId: null,
      reservationUserId: order.createdById,
      allowedStatuses: [OrderStatus.RECEIVED],
      origin: OrderOrigin.PORTAL,
      observation: 'Pedido confirmado por el cliente mediante enlace seguro',
      action: 'CONFIRMAR_PEDIDO_CLIENTE',
      confirmationTokenHash: tokenHash,
    });
    const confirmed = await this.orderAccessService.loadOrder(order.id);
    await this.orderNotificationsService.afterConfirmation(
      confirmed,
      order.createdById,
      `order.confirmed.public:${order.id}`,
    );
    return {
      ...this.orderLinksService.publicConfirmationView(confirmed, false),
      trackingUrl: await this.trackingService.ensureOrderLink(confirmed),
    };
  }
}
