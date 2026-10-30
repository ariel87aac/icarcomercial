import { workflowTransaction } from './order-workflow';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { attachOrderWorkflow } from './order-workflow';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { CustomerAddress } from '../clientes/entidades/customer-address.entity';
import { Customer } from '../clientes/entidades/customer.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { InventoryReservationStatus } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { PricingService } from '../productos/precios/pricing.service';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { NotificationService } from '../seguimiento-mensajeria/notification.service';
import { NotificationEvent } from '../seguimiento-mensajeria/entidades/tracking.enums';
import {
  CancelOrderDto,
  CreateOrderDto,
  DeleteOrderDto,
  OrderItemDto,
  OrderQueryDto,
  ReturnOrderDto,
  TransitionOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { OrderDetail } from './entidades/order-detail.entity';
import { OrderConfirmationLink } from './entidades/order-confirmation-link.entity';
import { OrderHistory } from './entidades/order-history.entity';
import { Order } from './entidades/order.entity';
import { OrderConfirmationLinkStatus, OrderOrigin, OrderStatus } from './entidades/order.enums';
import { OrderScheduleWindow, OrderSchedulingService } from './order-scheduling.service';

interface ResolvedItem {
  presentation: ProductPresentation;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PublicOrderConfirmationView {
  trackingUrl?: string;
  orderReference: string;
  customerName: string;
  requestedDate: string;
  orderCutoffAt: Date;
  status: OrderStatus;
  total: string;
  canConfirm: boolean;
  details: Array<{
    product: string;
    presentation: string;
    unit: string;
    quantity: string;
    subtotal: string;
  }>;
}
import { OrdersServiceParte02 } from './orders.02-update';

export abstract class OrdersServiceParte01 extends OrdersServiceParte02 {
  async findAll(query: OrderQueryDto, actor: AuthenticatedUser) {
      const builder = this.orderRepository.createQueryBuilder('order')
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
      if (actor.type === UserType.CUSTOMER) {
        builder.andWhere('order.customerId = :scopedCustomerId', { scopedCustomerId: actor.customerId });
      } else if (query.customerId) {
        builder.andWhere('order.customerId = :customerId', { customerId: query.customerId });
      }
      if (query.q) {
        builder.andWhere(new Brackets((where) => where
          .where('order.code ILIKE :q', { q: `%${query.q}%` })
          .orWhere('unaccent(customer.businessName) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
      }
      if (query.status) builder.andWhere('order.status = :status', { status: query.status });
      if (query.from) builder.andWhere('order.requestedDate >= :from', { from: query.from });
      if (query.to) builder.andWhere('order.requestedDate <= :to', { to: query.to });
      const [data, total] = await builder.getManyAndCount();
      return paginate(await attachOrderWorkflow(this.dataSource.manager, data), total, query.page, query.limit);
    }

  async statusSummary(actor: AuthenticatedUser): Promise<Record<OrderStatus, number>> {
      const builder = this.orderRepository.createQueryBuilder('order')
        .select('order.status', 'status')
        .addSelect('COUNT(order.id)', 'count')
        .groupBy('order.status');
      if (actor.type === UserType.CUSTOMER) {
        builder.where('order.customerId = :customerId', { customerId: actor.customerId });
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

  async findOne(id: string, actor: AuthenticatedUser): Promise<Order> {
      const order = await this.loadOrder(id);
      await this.assertScope(order, actor);
      await attachOrderWorkflow(this.dataSource.manager, [order]);
      return order;
    }

  async create(dto: CreateOrderDto, actor: AuthenticatedUser): Promise<Order> {
      const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : dto.customerId;
      if (!customerId) throw new BadRequestException('Debe seleccionar un cliente');
      const origin = this.origin(actor);
      const { customer, address, items, schedule } = await this.validateOrder(
        customerId,
        dto.addressId,
        dto.requestedDate,
        dto.details,
      );
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      const rawConfirmationToken = randomBytes(32).toString('base64url');
      const orderId = await workflowTransaction(this.dataSource, async (manager) => {
        const sequence = await manager.query<{ nextval: string }[]>(`SELECT nextval('pedidos_codigo_seq')::text AS nextval`);
        const code = sequence[0].nextval;
        const order = await manager.getRepository(Order).save(manager.getRepository(Order).create({
          code,
          customerId: customer.id,
          addressId: address.id,
          requestedDate: dto.requestedDate,
          orderCutoffAt: schedule.orderCutoffAt,
          preparationAt: schedule.preparationAt,
          status: OrderStatus.DRAFT,
          origin,
          observations: dto.observations?.trim() || null,
          total: total.toFixed(2),
          createdById: actor.id,
          confirmedById: null,
          canceledById: null,
          receivedAt: null,
          confirmedAt: null,
          canceledAt: null,
          cancellationReason: null,
          customerNameSnapshot: null,
          customerTypeSnapshot: null,
          addressSnapshot: null,
          zoneSnapshot: null,
          distributionWeekdaySnapshot: null,
        }));
        await manager.getRepository(OrderDetail).save(items.map((item) => this.detailEntity(manager, order.id, item)));
        await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
          orderId: order.id,
          previousStatus: null,
          newStatus: OrderStatus.DRAFT,
          userId: actor.id,
          origin,
          observation: 'Pedido registrado',
        }));
        await manager.getRepository(OrderConfirmationLink).save(manager.getRepository(OrderConfirmationLink).create({
          orderId: order.id,
          tokenHash: this.hashToken(rawConfirmationToken),
          status: OrderConfirmationLinkStatus.ACTIVE,
          expiresAt: schedule.orderCutoffAt,
          createdById: actor.id,
          usedAt: null,
          revokedAt: null,
        }));
        return order.id;
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
      const created = await this.findOne(orderId, actor);
      const trackingUrl = await this.trackingService.ensureOrderLink(created);
      await this.trackingService.safeCaptureOrder(orderId, `order.created:${orderId}`, false);
      await this.notificationService.safeEnqueueOrderLifecycle(
        created,
        NotificationEvent.ORDER_DRAFT,
        actor.id,
        {
          trackingUrl,
          confirmationUrl: `${this.publicBaseUrl()}/confirmar-pedido/${rawConfirmationToken}`,
          productList: this.productList(created),
        },
      );
      return created;
    }
}
