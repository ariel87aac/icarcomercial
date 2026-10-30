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
import { OrdersServiceParte04 } from './orders.04-rescheduleToNextAvailable';

export abstract class OrdersServiceParte03 extends OrdersServiceParte04 {
  protected async confirmOrder(id: string, input: {
      actorId: string | null;
      reservationUserId: string;
      allowedStatuses: OrderStatus[];
      origin: OrderOrigin;
      observation: string;
      action: string;
      confirmationTokenHash?: string;
    }): Promise<void> {
      await workflowTransaction(this.dataSource, async (manager) => {
        let confirmationLink: OrderConfirmationLink | null = null;
        if (input.confirmationTokenHash) {
          confirmationLink = await manager.getRepository(OrderConfirmationLink).createQueryBuilder('link')
            .setLock('pessimistic_write')
            .where('link.tokenHash = :tokenHash', { tokenHash: input.confirmationTokenHash })
            .getOne();
          if (!confirmationLink || confirmationLink.orderId !== id || confirmationLink.status !== OrderConfirmationLinkStatus.ACTIVE) {
            throw new NotFoundException('El enlace de confirmación no está disponible');
          }
          if (confirmationLink.expiresAt <= new Date()) {
            confirmationLink.status = OrderConfirmationLinkStatus.EXPIRED;
            await manager.getRepository(OrderConfirmationLink).save(confirmationLink);
            throw new ConflictException('El plazo de confirmación del pedido finalizó');
          }
        }
        const order = await manager.getRepository(Order).createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :id', { id })
          .getOne();
        if (!order) throw new NotFoundException('Pedido no encontrado');
        if (!input.allowedStatuses.includes(order.status)) {
          throw new ConflictException(input.confirmationTokenHash
            ? 'El pedido ya no puede confirmarse mediante este enlace'
            : 'Solo un pedido Recibido puede confirmarse');
        }
        const previousStatus = order.status;
        const details = await manager.getRepository(OrderDetail).find({ where: { orderId: id }, order: { presentationId: 'ASC' } });
        const { customer, address, items, schedule } = await this.validateOrder(
          order.customerId,
          order.addressId,
          order.requestedDate,
          details.map((detail) => ({ presentationId: detail.presentationId, quantity: Number(detail.requestedQuantity) })),
          manager,
        );
        let total = 0;
        for (const item of [...items].sort((a, b) => a.presentation.id.localeCompare(b.presentation.id))) {
          await manager.query(
            `INSERT INTO existencias (presentacion_id, cantidad_fisica, cantidad_reservada)
             VALUES ($1, 0, 0) ON CONFLICT (presentacion_id) DO NOTHING`,
            [item.presentation.id],
          );
          const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
            .setLock('pessimistic_write')
            .where('stock.presentationId = :presentationId', { presentationId: item.presentation.id })
            .getOneOrFail();
          const available = Math.max(0, Number(stock.physicalQuantity) - Number(stock.reservedQuantity));
          const reserved = Math.min(item.quantity, available);
          const pending = item.quantity - reserved;
          stock.reservedQuantity = (Number(stock.reservedQuantity) + item.quantity).toFixed(3);
          await manager.getRepository(Stock).save(stock);
          const detail = details.find((value) => value.presentationId === item.presentation.id)!;
          Object.assign(detail, this.detailValues(item), {
            reservedQuantity: reserved.toFixed(3),
            pendingQuantity: pending.toFixed(3),
          });
          await manager.getRepository(OrderDetail).save(detail);
          await manager.getRepository(InventoryReservation).save(manager.getRepository(InventoryReservation).create({
            orderDetailId: detail.id,
            stockId: stock.id,
            quantity: item.quantity.toFixed(3),
            status: InventoryReservationStatus.ACTIVE,
            userId: input.reservationUserId,
          }));
          total += item.subtotal;
        }
        order.status = OrderStatus.CONFIRMED;
        order.confirmedById = input.actorId;
        order.confirmedAt = new Date();
        order.total = total.toFixed(2);
        order.customerNameSnapshot = customer.businessName;
        order.customerTypeSnapshot = customer.type;
        order.addressSnapshot = address.address;
        order.zoneSnapshot = address.zone?.name ?? null;
        order.distributionWeekdaySnapshot = schedule.weekday;
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus,
          newStatus: OrderStatus.CONFIRMED,
          userId: input.actorId,
          origin: input.origin,
          observation: input.observation,
        }));
        if (confirmationLink) {
          confirmationLink.status = OrderConfirmationLinkStatus.USED;
          confirmationLink.usedAt = new Date();
          await manager.getRepository(OrderConfirmationLink).save(confirmationLink);
        } else {
          await manager.getRepository(OrderConfirmationLink).update(
            { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
            { status: OrderConfirmationLinkStatus.REVOKED, revokedAt: new Date() },
          );
        }
        await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
          userId: input.actorId,
          module: 'orders',
          action: input.action,
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { customerId: customer.id, total: total.toFixed(2), origin: input.origin },
        }));
      });
    }
}
