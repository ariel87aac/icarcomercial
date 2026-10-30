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
import { OrdersServiceParte06 } from './orders.06-validateOrder';

export abstract class OrdersServiceParte05 extends OrdersServiceParte06 {
  async cancel(id: string, dto: CancelOrderDto, actor: AuthenticatedUser): Promise<Order> {
      await this.findOne(id, actor);
      await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :id', { id })
          .getOne();
        if (!order) throw new NotFoundException('Pedido no encontrado');
        if (order.status === OrderStatus.CANCELED) throw new ConflictException('El pedido ya está cancelado');
        if (![OrderStatus.DRAFT, OrderStatus.RECEIVED, OrderStatus.CONFIRMED].includes(order.status)) {
          throw new ConflictException('El pedido no puede cancelarse en su estado actual');
        }
        const previousStatus = order.status;
        let releasedQuantity = 0;
        if (previousStatus === OrderStatus.CONFIRMED) {
          const downstream = await manager.query<Array<{ has_preparation: boolean; has_delivery: boolean; has_sale: boolean }>>(`
            SELECT
              EXISTS (SELECT 1 FROM preparaciones_pedido WHERE pedido_id = $1) AS has_preparation,
              EXISTS (SELECT 1 FROM rutas_entregas WHERE pedido_id = $1) AS has_delivery,
              EXISTS (SELECT 1 FROM ventas WHERE pedido_id = $1) AS has_sale
          `, [id]);
          if (downstream[0]?.has_preparation || downstream[0]?.has_delivery || downstream[0]?.has_sale) {
            throw new ConflictException('El pedido ya tiene preparación, entrega o venta asociada y no puede cancelarse desde Pedidos');
          }
  
          const reservations = await manager.getRepository(InventoryReservation).createQueryBuilder('reservation')
            .innerJoin(OrderDetail, 'detail', 'detail.id = reservation.orderDetailId')
            .setLock('pessimistic_write')
            .where('detail.orderId = :id', { id })
            .orderBy('reservation.stockId', 'ASC')
            .getMany();
          if (reservations.some((reservation) => reservation.status === InventoryReservationStatus.CONSUMED)) {
            throw new ConflictException('El pedido tiene inventario despachado y no puede cancelarse desde Pedidos');
          }
          if (reservations.some((reservation) => reservation.status !== InventoryReservationStatus.ACTIVE)) {
            throw new ConflictException('Las reservas del pedido ya no se encuentran disponibles para liberación');
          }
          for (const reservation of reservations) {
            const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
              .setLock('pessimistic_write')
              .where('stock.id = :id', { id: reservation.stockId })
              .getOneOrFail();
            const quantity = Number(reservation.quantity);
            const nextReserved = Number(stock.reservedQuantity) - quantity;
            if (nextReserved < -0.0005) throw new ConflictException('El saldo reservado cambió durante la cancelación');
            stock.reservedQuantity = Math.max(0, nextReserved).toFixed(3);
            await manager.getRepository(Stock).save(stock);
            reservation.status = InventoryReservationStatus.RELEASED;
            await manager.getRepository(InventoryReservation).save(reservation);
            releasedQuantity += quantity;
          }
          await manager.getRepository(OrderDetail).update({ orderId: id }, { reservedQuantity: '0.000', pendingQuantity: '0.000' });
        }
  
        order.status = OrderStatus.CANCELED;
        order.canceledById = actor.id;
        order.canceledAt = new Date();
        order.cancellationReason = dto.reason.trim();
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus,
          newStatus: OrderStatus.CANCELED,
          userId: actor.id,
          origin: this.origin(actor),
          observation: order.cancellationReason,
        }));
        await manager.getRepository(OrderConfirmationLink).update(
          { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
          { status: OrderConfirmationLinkStatus.REVOKED, revokedAt: new Date() },
        );
        await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
          userId: actor.id,
          module: 'orders',
          action: 'CANCELAR_PEDIDO',
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { previousStatus, reason: order.cancellationReason, releasedQuantity: releasedQuantity.toFixed(3) },
        }));
      });
      const canceled = await this.findOne(id, actor);
      await this.trackingService.safeCaptureOrder(id, `order.canceled:${id}`, false);
      await this.trackingService.refreshStock(`stock.cancel:${id}`);
      await this.notificationService.safeEnqueueOrderLifecycle(
        canceled,
        NotificationEvent.ORDER_CANCELED,
        actor.id,
        {
          trackingUrl: await this.trackingService.ensureOrderLink(canceled),
          productList: this.productList(canceled),
          cancellationReason: canceled.cancellationReason ?? dto.reason.trim(),
        },
      );
      return canceled;
    }

  async remove(id: string, dto: DeleteOrderDto, actor: AuthenticatedUser): Promise<{ id: string; code: string; deleted: true }> {
      const current = await this.findOne(id, actor);
      if (current.status !== OrderStatus.CANCELED) {
        throw new ConflictException('Para eliminar el pedido primero debe cancelarlo desde Flujo del pedido');
      }
      const snapshot = {
        code: current.code,
        customerId: current.customerId,
        status: current.status,
        total: current.total,
        reason: dto.reason.trim(),
      };
      await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :id', { id })
          .getOne();
        if (!order) throw new NotFoundException('Pedido no encontrado');
        if (order.status !== OrderStatus.CANCELED) {
          throw new ConflictException('Para eliminar el pedido primero debe cancelarlo desde Flujo del pedido');
        }
        order.deletedById = actor.id;
        order.deletionReason = dto.reason.trim();
        await manager.getRepository(Order).save(order);
        await manager.getRepository(Order).softDelete(id);
        await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
          userId: actor.id,
          module: 'orders',
          action: 'ELIMINAR_PEDIDO',
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: snapshot,
        }));
      });
      return { id, code: current.code, deleted: true };
    }

  async workflow(id: string, actor: AuthenticatedUser) {
      await this.findOne(id, actor);
      return this.trackingService.orderSnapshot(id);
    }

  async history(id: string, actor: AuthenticatedUser): Promise<OrderHistory[]> {
      await this.findOne(id, actor);
      return this.historyRepository.find({ where: { orderId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
    }
}
