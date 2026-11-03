import { OrderReschedulePort } from './puertos/order-reschedule.port';
import { ConflictException, UnprocessableEntityException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { Order } from '../entidades/order.entity';
import { OrderStatus } from '../entidades/order.enums';
import { OrderSchedulingPort } from './puertos/order-scheduling.port';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService } from './order-queries.service';

@Injectable()
export class RescheduleOrderUseCase {
  constructor(
    private readonly orderQueriesService: OrderQueriesService,
    private readonly schedulingService: OrderSchedulingPort,
    private readonly rescheduling: OrderReschedulePort,
    private readonly orderAccessService: OrderAccessService,
  ) {}

  async rescheduleToNextAvailable(id: string, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.orderQueriesService.findOne(id, actor);
    if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(current.status)) {
      throw new ConflictException('Solo un pedido en Borrador o Recibido puede reprogramarse');
    }
    if (new Date(current.orderCutoffAt).getTime() > Date.now()) {
      throw new ConflictException('El pedido todavía se encuentra dentro de su plazo de modificación');
    }

    const nextWindow = (
      await this.schedulingService.deliveryOptions(current.addressId, current.customerId, actor)
    ).find((option) => option.deliveryDate > current.requestedDate);
    if (!nextWindow) {
      throw new UnprocessableEntityException(
        'No existe una siguiente fecha de entrega disponible para la zona del pedido',
      );
    }

    await this.rescheduling.reschedule(id, {
      deliveryDate: nextWindow.deliveryDate,
      actorId: actor.id,
      origin: this.orderAccessService.origin(actor),
    });
    return this.orderQueriesService.findOne(id, actor);
  }
}
