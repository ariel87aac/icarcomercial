import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import {
  CreateOrderDto,
  OrderQueryDto,
  ReturnOrderDto,
  TransitionOrderDto,
  UpdateOrderDto,
  CancelOrderDto,
  DeleteOrderDto,
} from './dto/order.dto';
import { OrderHistory } from './entidades/order-history.entity';
import { Order } from './entidades/order.entity';
import { OrderStatus } from './entidades/order.enums';
import { DraftCartView } from './draft-cart.view';
import { PublicOrderConfirmationView } from './aplicacion/public-order-confirmation.view';
import { OrderQueriesService } from './aplicacion/order-queries.service';
import { UpdateOrderUseCase } from './aplicacion/update-order.use-case';
import { CreateOrderUseCase } from './aplicacion/create-order.use-case';
import { OrderSubmissionService } from './aplicacion/order-submission.service';
import { OrderConfirmationService } from './aplicacion/order-confirmation.service';
import { RescheduleOrderUseCase } from './aplicacion/reschedule-order.use-case';
import { OrderCancellationService } from './aplicacion/order-cancellation.service';
@Injectable()
export class OrdersService {
  constructor(
    private readonly orderQueriesService: OrderQueriesService,
    private readonly updateOrderUseCase: UpdateOrderUseCase,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly orderSubmissionService: OrderSubmissionService,
    private readonly orderConfirmationService: OrderConfirmationService,
    private readonly rescheduleOrderUseCase: RescheduleOrderUseCase,
    private readonly orderCancellationService: OrderCancellationService,
  ) {}
  async findAll(query: OrderQueryDto, actor: AuthenticatedUser) {
    return this.orderQueriesService.findAll(query, actor);
  }
  async statusSummary(actor: AuthenticatedUser): Promise<Record<OrderStatus, number>> {
    return this.orderQueriesService.statusSummary(actor);
  }
  async findOne(id: string, actor: AuthenticatedUser): Promise<Order> {
    return this.orderQueriesService.findOne(id, actor);
  }
  async draftCart(requestedCustomerId: string | undefined, actor: AuthenticatedUser): Promise<DraftCartView | null> {
    return this.orderQueriesService.draftCart(requestedCustomerId, actor);
  }
  async create(dto: CreateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    return this.createOrderUseCase.create(dto, actor);
  }
  async update(id: string, dto: UpdateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    return this.updateOrderUseCase.update(id, dto, actor);
  }
  async send(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    return this.orderSubmissionService.send(id, dto, actor);
  }
  async returnToDraft(id: string, dto: ReturnOrderDto, actor: AuthenticatedUser): Promise<Order> {
    return this.orderSubmissionService.returnToDraft(id, dto, actor);
  }
  async confirm(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    return this.orderConfirmationService.confirm(id, dto, actor);
  }
  async publicConfirmation(token: string): Promise<PublicOrderConfirmationView> {
    return this.orderConfirmationService.publicConfirmation(token);
  }
  async confirmPublic(token: string): Promise<PublicOrderConfirmationView> {
    return this.orderConfirmationService.confirmPublic(token);
  }
  async rescheduleToNextAvailable(id: string, actor: AuthenticatedUser): Promise<Order> {
    return this.rescheduleOrderUseCase.rescheduleToNextAvailable(id, actor);
  }
  async cancel(id: string, dto: CancelOrderDto, actor: AuthenticatedUser): Promise<Order> {
    return this.orderCancellationService.cancel(id, dto, actor);
  }
  async remove(
    id: string,
    dto: DeleteOrderDto,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; code: string; deleted: true }> {
    return this.orderCancellationService.remove(id, dto, actor);
  }
  async workflow(id: string, actor: AuthenticatedUser) {
    return this.orderQueriesService.workflow(id, actor);
  }
  async history(id: string, actor: AuthenticatedUser): Promise<OrderHistory[]> {
    return this.orderQueriesService.history(id, actor);
  }
}
