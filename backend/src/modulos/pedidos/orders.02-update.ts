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
import { OrdersServiceParte03 } from './orders.03-confirmOrder';

export abstract class OrdersServiceParte02 extends OrdersServiceParte03 {
  async update(id: string, dto: UpdateOrderDto, actor: AuthenticatedUser): Promise<Order> {
      const current = await this.findOne(id, actor);
      if (current.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
      if (current.status === OrderStatus.CANCELED) throw new ConflictException('Un pedido cancelado es inmutable');
      if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(current.status)) throw new ConflictException('El pedido no admite cambios');
      this.schedulingService.assertOrderOpen(current.orderCutoffAt);
      const itemsDto = dto.details ?? current.details.map((detail: OrderDetail) => ({
        presentationId: detail.presentationId,
        quantity: Number(detail.requestedQuantity),
      }));
      const addressId = dto.addressId ?? current.addressId;
      const requestedDate = dto.requestedDate ?? current.requestedDate;
      const scheduleChanged = addressId !== current.addressId || requestedDate !== current.requestedDate;
      const { items, schedule } = await this.validateOrder(current.customerId, addressId, requestedDate, itemsDto, undefined, scheduleChanged);
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :id', { id })
          .getOneOrFail();
        if (order.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
        if (order.status === OrderStatus.CANCELED) throw new ConflictException('Un pedido cancelado es inmutable');
        order.addressId = addressId;
        order.requestedDate = requestedDate;
        if (scheduleChanged) {
          order.orderCutoffAt = schedule.orderCutoffAt;
          order.preparationAt = schedule.preparationAt;
          await manager.getRepository(OrderConfirmationLink).update(
            { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
            { expiresAt: schedule.orderCutoffAt },
          );
        }
        if (dto.observations !== undefined) order.observations = dto.observations.trim() || null;
        order.total = total.toFixed(2);
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderDetail).delete({ orderId: id });
        await manager.getRepository(OrderDetail).save(items.map((item) => this.detailEntity(manager, id, item)));
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
      return this.findOne(id, actor);
    }

  async send(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
      const current = await this.findOne(id, actor);
      if (current.status !== OrderStatus.DRAFT) throw new ConflictException('Solo un pedido en Borrador puede enviarse');
      this.schedulingService.assertOrderOpen(current.orderCutoffAt);
      const itemsDto = current.details.map((detail: OrderDetail) => ({ presentationId: detail.presentationId, quantity: Number(detail.requestedQuantity) }));
      const { items } = await this.validateOrder(current.customerId, current.addressId, current.requestedDate, itemsDto, undefined, false);
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('order').setLock('pessimistic_write').where('order.id = :id', { id }).getOneOrFail();
        if (order.status !== OrderStatus.DRAFT) throw new ConflictException('El pedido ya cambió de estado');
        order.status = OrderStatus.RECEIVED;
        order.receivedAt = new Date();
        order.total = total.toFixed(2);
        await manager.getRepository(Order).save(order);
        for (const item of items) {
          await manager.getRepository(OrderDetail).update(
            { orderId: id, presentationId: item.presentation.id },
            this.detailValues(item),
          );
        }
        await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus: OrderStatus.DRAFT,
          newStatus: OrderStatus.RECEIVED,
          userId: actor.id,
          origin: this.origin(actor),
          observation: dto.observation?.trim() || 'Pedido enviado para revisión',
        }));
      });
      await this.auditService.record({ userId: actor.id, module: 'orders', action: 'ENVIAR_PEDIDO', entity: 'pedidos', entityId: id, result: 'EXITOSO' });
      const received = await this.findOne(id, actor);
      await this.trackingService.safeCaptureOrder(id, `order.received:${id}:${received.updatedAt.getTime()}`, false);
      await this.notificationService.safeEnqueueOrderLifecycle(
        received,
        NotificationEvent.ORDER_RECEIVED,
        actor.id,
        { productList: this.productList(received), trackingUrl: await this.trackingService.ensureOrderLink(received) },
      );
      return received;
    }

  async returnToDraft(id: string, dto: ReturnOrderDto, actor: AuthenticatedUser): Promise<Order> {
      if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
      const current = await this.findOne(id, actor);
      if (current.status !== OrderStatus.RECEIVED) throw new ConflictException('Solo un pedido Recibido puede devolverse');
      this.schedulingService.assertOrderOpen(current.orderCutoffAt);
      await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('order').setLock('pessimistic_write').where('order.id = :id', { id }).getOneOrFail();
        if (order.status !== OrderStatus.RECEIVED) throw new ConflictException('El pedido ya cambió de estado');
        order.status = OrderStatus.DRAFT;
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus: OrderStatus.RECEIVED,
          newStatus: OrderStatus.DRAFT,
          userId: actor.id,
          origin: OrderOrigin.INTERNAL,
          observation: dto.observation.trim(),
        }));
      });
      await this.auditService.record({ userId: actor.id, module: 'orders', action: 'DEVOLVER_PEDIDO', entity: 'pedidos', entityId: id, result: 'EXITOSO', metadata: { observation: dto.observation } });
      await this.trackingService.safeCaptureOrder(id, `order.returned:${id}:${Date.now()}`, false);
      return this.findOne(id, actor);
    }

  async confirm(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
      if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
      await this.confirmOrder(id, {
        actorId: actor.id,
        reservationUserId: actor.id,
        allowedStatuses: [OrderStatus.RECEIVED],
        origin: OrderOrigin.INTERNAL,
        observation: dto.observation?.trim() || 'Pedido confirmado y reservado',
        action: 'CONFIRMAR_PEDIDO',
      });
      const confirmed = await this.findOne(id, actor);
      await this.afterConfirmation(confirmed, actor.id, `order.confirmed:${id}`);
      return confirmed;
    }

  async publicConfirmation(token: string): Promise<PublicOrderConfirmationView> {
      const link = await this.resolveConfirmationLink(token, true);
      const order = await this.loadOrder(link.orderId);
      return { ...this.publicConfirmationView(order, link.status === OrderConfirmationLinkStatus.ACTIVE), trackingUrl: await this.trackingService.ensureOrderLink(order) };
    }

  async confirmPublic(token: string): Promise<PublicOrderConfirmationView> {
      const tokenHash = this.hashToken(token);
      const currentLink = await this.resolveConfirmationLink(token, false);
      const order = await this.loadOrder(currentLink.orderId);
      await this.confirmOrder(order.id, {
        actorId: null,
        reservationUserId: order.createdById,
        allowedStatuses: [OrderStatus.DRAFT, OrderStatus.RECEIVED],
        origin: OrderOrigin.PORTAL,
        observation: 'Pedido confirmado por el cliente mediante enlace seguro',
        action: 'CONFIRMAR_PEDIDO_CLIENTE',
        confirmationTokenHash: tokenHash,
      });
      const confirmed = await this.loadOrder(order.id);
      await this.afterConfirmation(confirmed, order.createdById, `order.confirmed.public:${order.id}`);
      return { ...this.publicConfirmationView(confirmed, false), trackingUrl: await this.trackingService.ensureOrderLink(confirmed) };
    }
}
