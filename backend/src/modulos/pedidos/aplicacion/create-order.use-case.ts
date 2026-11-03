import { OrderReadPort } from './puertos/order-read.port';
import { OrderDraftWritePort } from './puertos/order-draft-write.port';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { CreateOrderDto } from '../dto/order.dto';
import { Order } from '../entidades/order.entity';
import { OrderAuditPort } from './puertos/order-audit.port';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderDetailsService } from './order-details.service';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService } from './order-queries.service';
import { UpdateOrderUseCase } from './update-order.use-case';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly orders: OrderReadPort,
    private readonly updateOrderUseCase: UpdateOrderUseCase,
    private readonly orderAccessService: OrderAccessService,
    private readonly orderDetailsService: OrderDetailsService,
    private readonly drafts: OrderDraftWritePort,
    private readonly auditService: OrderAuditPort,
    private readonly orderQueriesService: OrderQueriesService,
    private readonly trackingService: OrderTrackingPort,
  ) {}

  async create(dto: CreateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : dto.customerId;
    if (!customerId) throw new BadRequestException('Debe seleccionar un cliente');
    const existingDraft = await this.orders.findDraftId(customerId);
    if (existingDraft) {
      return this.updateOrderUseCase.update(
        existingDraft,
        {
          addressId: dto.addressId,
          requestedDate: dto.requestedDate,
          observations: dto.observations,
          details: dto.details,
        },
        actor,
      );
    }
    const origin = this.orderAccessService.origin(actor);
    const { customer, address, items, schedule } = await this.orderDetailsService.validateOrder(
      customerId,
      dto.addressId,
      dto.requestedDate,
      dto.details,
    );
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const orderId = await this.drafts.create({
      customerId: customer.id,
      addressId: address.id,
      requestedDate: dto.requestedDate,
      orderCutoffAt: schedule.orderCutoffAt,
      preparationAt: schedule.preparationAt,
      origin,
      actorId: actor.id,
      observations: dto.observations?.trim() || null,
      total: total.toFixed(2),
      details: items.map((item) => ({
        presentationId: item.presentation.id,
        ...this.orderDetailsService.detailValues(item),
      })),
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'CREAR_PEDIDO',
      entity: 'pedidos',
      entityId: orderId,
      result: 'EXITOSO',
      metadata: { customerId, origin },
    });
    const created = await this.orderQueriesService.findOne(orderId, actor);
    await this.trackingService.safeCaptureOrder(orderId, `order.created:${orderId}`, false);
    return created;
  }
}
