import { OrderReadPort } from './puertos/order-read.port';
import { BadRequestException, Injectable } from '@nestjs/common';
import { paginate } from '../../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { OrderQueryDto } from '../dto/order.dto';
import { OrderHistory } from '../entidades/order-history.entity';
import { Order } from '../entidades/order.entity';
import { OrderStatus } from '../entidades/order.enums';
import { DraftCartView, toDraftCartView } from '../draft-cart.view';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderAccessService } from './order-access.service';

@Injectable()
export class OrderQueriesService {
  constructor(
    private readonly orders: OrderReadPort,
    private readonly orderAccessService: OrderAccessService,
    private readonly trackingService: OrderTrackingPort,
  ) {}

  async findAll(query: OrderQueryDto, actor: AuthenticatedUser) {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : query.customerId || undefined;
    const { data, total } = await this.orders.findAll({ ...query, customerId });
    return paginate(data, total, query.page, query.limit);
  }

  async statusSummary(actor: AuthenticatedUser): Promise<Record<OrderStatus, number>> {
    return this.orders.statusSummary(actor.type === UserType.CUSTOMER ? actor.customerId : undefined);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Order> {
    const order = await this.orderAccessService.loadOrder(id);
    await this.orderAccessService.assertScope(order, actor);
    await this.orders.enrichWorkflow(order);
    return order;
  }

  async draftCart(requestedCustomerId: string | undefined, actor: AuthenticatedUser): Promise<DraftCartView | null> {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : requestedCustomerId;
    if (!customerId) throw new BadRequestException('Debe seleccionar un cliente');
    const draft = await this.orders.latestDraft(customerId);
    return draft ? toDraftCartView(draft) : null;
  }

  async workflow(id: string, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return this.trackingService.orderSnapshot(id);
  }

  async history(id: string, actor: AuthenticatedUser): Promise<OrderHistory[]> {
    await this.findOne(id, actor);
    return this.orders.history(id);
  }
}
