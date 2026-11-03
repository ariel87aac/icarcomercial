import { OrderDraftWritePort } from './puertos/order-draft-write.port';
import { ConflictException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UpdateOrderDto } from '../dto/order.dto';
import { OrderDetail } from '../entidades/order-detail.entity';
import { Order } from '../entidades/order.entity';
import { OrderStatus } from '../entidades/order.enums';
import { OrderSchedulingPort } from './puertos/order-scheduling.port';
import { OrderAuditPort } from './puertos/order-audit.port';
import { OrderDetailsService } from './order-details.service';
import { OrderQueriesService } from './order-queries.service';

@Injectable()
export class UpdateOrderUseCase {
  constructor(
    private readonly orderQueriesService: OrderQueriesService,
    private readonly schedulingService: OrderSchedulingPort,
    private readonly orderDetailsService: OrderDetailsService,
    private readonly drafts: OrderDraftWritePort,
    private readonly auditService: OrderAuditPort,
  ) {}

  async update(id: string, dto: UpdateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.orderQueriesService.findOne(id, actor);
    if (current.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
    if (current.status === OrderStatus.CANCELED) throw new ConflictException('Un pedido cancelado es inmutable');
    if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(current.status))
      throw new ConflictException('El pedido no admite cambios');
    this.schedulingService.assertOrderOpen(current.orderCutoffAt);
    const itemsDto =
      dto.details ??
      current.details.map((detail: OrderDetail) => ({
        presentationId: detail.presentationId,
        quantity: Number(detail.requestedQuantity),
      }));
    const addressId = dto.addressId ?? current.addressId;
    const requestedDate = dto.requestedDate ?? current.requestedDate;
    const scheduleChanged = addressId !== current.addressId || requestedDate !== current.requestedDate;
    const { items, schedule } = await this.orderDetailsService.validateOrder(
      current.customerId,
      addressId,
      requestedDate,
      itemsDto,
      undefined,
      scheduleChanged,
    );
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await this.drafts.update(id, {
      addressId,
      requestedDate,
      scheduleChanged,
      orderCutoffAt: schedule.orderCutoffAt,
      preparationAt: schedule.preparationAt,
      observations: dto.observations === undefined ? undefined : dto.observations.trim() || null,
      total: total.toFixed(2),
      details: items.map((item) => ({
        presentationId: item.presentation.id,
        ...this.orderDetailsService.detailValues(item),
      })),
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'ACTUALIZAR_PEDIDO',
      entity: 'pedidos',
      entityId: id,
      result: 'EXITOSO',
      metadata: { fields: Object.keys(dto), status: current.status },
    });
    return this.orderQueriesService.findOne(id, actor);
  }
}
