import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Order } from '../entidades/order.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { OrderStatus } from '../entidades/order.enums';
import { attachOrderWorkflow } from '../order-workflow';
import { OrderReadPort, OrderReadCriteria } from '../aplicacion/puertos/order-read.port';

@Injectable()
export class TypeOrmOrderReadAdapter extends OrderReadPort {
  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderHistory) private readonly historyRepository: Repository<OrderHistory>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }
  async findAll(query: OrderReadCriteria) {
    const builder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.createdBy', 'createdBy')
      .leftJoinAndSelect('order.confirmedBy', 'confirmedBy')
      .leftJoinAndSelect('order.canceledBy', 'canceledBy')
      .loadRelationCountAndMap('order.detailCount', 'order.details')
      .addSelect('CAST("order"."codigo" AS bigint)', 'order_numeric_code')
      .orderBy('order_numeric_code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.customerId !== undefined) {
      builder.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }
    if (query.q) {
      builder.andWhere(
        new Brackets((where) =>
          where
            .where('order.code ILIKE :q', { q: `%${query.q}%` })
            .orWhere('unaccent(customer.businessName) ILIKE unaccent(:q)', { q: `%${query.q}%` }),
        ),
      );
    }
    if (query.status) builder.andWhere('order.status = :status', { status: query.status });
    if (query.view !== 'ALL' && query.status !== OrderStatus.CANCELED) {
      builder
        .innerJoin('pedido_flujo_actual', 'workflow', 'workflow.pedido_id = "order"."id"')
        .andWhere('workflow.estado NOT IN (:...finishedStatuses)', {
          finishedStatuses: ['ENTREGADO', 'CANCELADO'],
        });
    }
    if (query.from) builder.andWhere('order.requestedDate >= :from', { from: query.from });
    if (query.to) builder.andWhere('order.requestedDate <= :to', { to: query.to });
    const [data, total] = await builder.getManyAndCount();
    return { data: await attachOrderWorkflow(this.dataSource.manager, data), total };
  }
  async statusSummary(customerId?: string | null): Promise<Record<OrderStatus, number>> {
    const builder = this.orderRepository
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .groupBy('order.status');
    if (customerId !== undefined) {
      builder.where('order.customerId = :customerId', { customerId });
    }
    const rows = await builder.getRawMany<{ status: OrderStatus; count: string }>();
    const summary: Record<OrderStatus, number> = {
      [OrderStatus.DRAFT]: 0,
      [OrderStatus.RECEIVED]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.CANCELED]: 0,
    };
    for (const row of rows) summary[row.status] = Number(row.count);
    return summary;
  }
  async loadOrder(id: string): Promise<Order | null> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: {
        customer: true,
        address: { zone: { distributionDays: true }, distributionDay: true },
        createdBy: true,
        confirmedBy: true,
        canceledBy: true,
        details: { presentation: { product: true, unit: true } },
      },
      order: { details: { createdAt: 'ASC' } },
    });
    return order;
  }
  async findDraftId(customerId: string): Promise<string | null> {
    const order = await this.orderRepository.findOne({
      where: { customerId, status: OrderStatus.DRAFT },
      order: { updatedAt: 'DESC' },
    });
    return order?.id ?? null;
  }

  async latestDraft(customerId: string): Promise<Order | null> {
    return this.orderRepository.findOne({
      where: { customerId, status: OrderStatus.DRAFT },
      relations: { details: { presentation: { product: true, unit: true } } },
      order: { updatedAt: 'DESC', details: { createdAt: 'ASC' } },
    });
  }
  async enrichWorkflow(order: Order): Promise<void> {
    await attachOrderWorkflow(this.dataSource.manager, [order]);
  }
  async history(orderId: string): Promise<OrderHistory[]> {
    return this.historyRepository.find({ where: { orderId }, relations: { user: true }, order: { occurredAt: 'ASC' } });
  }
}
