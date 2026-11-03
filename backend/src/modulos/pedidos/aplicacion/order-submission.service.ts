import { OrderSubmissionPort } from './puertos/order-submission.port';
import { ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { ReturnOrderDto, TransitionOrderDto } from '../dto/order.dto';
import { OrderDetail } from '../entidades/order-detail.entity';
import { Order } from '../entidades/order.entity';
import { OrderStatus } from '../entidades/order.enums';
import { randomBytes } from 'node:crypto';
import { NotificationEvent } from '../../seguimiento-mensajeria/entidades/tracking.enums';
import { OrderSchedulingPort } from './puertos/order-scheduling.port';
import { OrderAuditPort } from './puertos/order-audit.port';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderMessagingPort } from './puertos/order-messaging.port';
import { OrderDetailsService } from './order-details.service';
import { OrderAccessService } from './order-access.service';
import { OrderLinksService } from './order-links.service';
import { OrderNotificationsService } from './order-notifications.service';
import { OrderQueriesService } from './order-queries.service';

@Injectable()
export class OrderSubmissionService {
  constructor(
    private readonly orderQueriesService: OrderQueriesService,
    private readonly schedulingService: OrderSchedulingPort,
    private readonly orderDetailsService: OrderDetailsService,
    private readonly submission: OrderSubmissionPort,
    private readonly orderLinksService: OrderLinksService,
    private readonly orderAccessService: OrderAccessService,
    private readonly auditService: OrderAuditPort,
    private readonly trackingService: OrderTrackingPort,
    private readonly notificationService: OrderMessagingPort,
    private readonly orderNotificationsService: OrderNotificationsService,
  ) {}

  async send(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.orderQueriesService.findOne(id, actor);
    if (current.status !== OrderStatus.DRAFT) throw new ConflictException('Solo un pedido en Borrador puede enviarse');
    this.schedulingService.assertOrderOpen(current.orderCutoffAt);
    const rawConfirmationToken = randomBytes(32).toString('base64url');
    const itemsDto = current.details.map((detail: OrderDetail) => ({
      presentationId: detail.presentationId,
      quantity: Number(detail.requestedQuantity),
    }));
    const { items } = await this.orderDetailsService.validateOrder(
      current.customerId,
      current.addressId,
      current.requestedDate,
      itemsDto,
      undefined,
      false,
    );
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await this.submission.send(id, {
      actorId: actor.id,
      origin: this.orderAccessService.origin(actor),
      total: total.toFixed(2),
      tokenHash: this.orderLinksService.hashToken(rawConfirmationToken),
      expiresAt: current.orderCutoffAt,
      observation: dto.observation?.trim() || 'Pedido enviado para revisión',
      details: items.map((item) => ({
        presentationId: item.presentation.id,
        ...this.orderDetailsService.detailValues(item),
      })),
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'ENVIAR_PEDIDO',
      entity: 'pedidos',
      entityId: id,
      result: 'EXITOSO',
    });
    const received = await this.orderQueriesService.findOne(id, actor);
    await this.trackingService.safeCaptureOrder(id, `order.received:${id}:${received.updatedAt.getTime()}`, false);
    await this.notificationService.safeEnqueueOrderLifecycle(
      received,
      NotificationEvent.ORDER_RECEIVED,
      actor.id,
      {
        productList: this.orderNotificationsService.productList(received),
        trackingUrl: await this.trackingService.ensureOrderLink(received),
        confirmationUrl: `${this.orderLinksService.publicBaseUrl()}/confirmar-pedido/${rawConfirmationToken}`,
      },
      this.orderLinksService.hashToken(rawConfirmationToken),
    );
    return received;
  }

  async returnToDraft(id: string, dto: ReturnOrderDto, actor: AuthenticatedUser): Promise<Order> {
    if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
    const current = await this.orderQueriesService.findOne(id, actor);
    if (current.status !== OrderStatus.RECEIVED)
      throw new ConflictException('Solo un pedido Recibido puede devolverse');
    this.schedulingService.assertOrderOpen(current.orderCutoffAt);
    await this.submission.returnToDraft(id, { actorId: actor.id, observation: dto.observation.trim() });
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'DEVOLVER_PEDIDO',
      entity: 'pedidos',
      entityId: id,
      result: 'EXITOSO',
      metadata: { observation: dto.observation },
    });
    await this.trackingService.safeCaptureOrder(id, `order.returned:${id}:${Date.now()}`, false);
    return this.orderQueriesService.findOne(id, actor);
  }
}
