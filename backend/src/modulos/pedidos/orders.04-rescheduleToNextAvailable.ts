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
import { OrdersServiceParte05 } from './orders.05-cancel';

export abstract class OrdersServiceParte04 extends OrdersServiceParte05 {
  async rescheduleToNextAvailable(id: string, actor: AuthenticatedUser): Promise<Order> {
      const current = await this.findOne(id, actor);
      if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(current.status)) {
        throw new ConflictException('Solo un pedido en Borrador o Recibido puede reprogramarse');
      }
      if (new Date(current.orderCutoffAt).getTime() > Date.now()) {
        throw new ConflictException('El pedido todavía se encuentra dentro de su plazo de modificación');
      }
  
      const nextWindow = (await this.schedulingService.deliveryOptions(current.addressId, current.customerId, actor))
        .find((option) => option.deliveryDate > current.requestedDate);
      if (!nextWindow) {
        throw new UnprocessableEntityException('No existe una siguiente fecha de entrega disponible para la zona del pedido');
      }
  
      await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :id', { id })
          .getOneOrFail();
        if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(order.status)) {
          throw new ConflictException('El pedido ya no admite reprogramación');
        }
        if (new Date(order.orderCutoffAt).getTime() > Date.now()) {
          throw new ConflictException('El pedido ya fue reprogramado o todavía se encuentra dentro del plazo');
        }
  
        const details = await manager.getRepository(OrderDetail).find({ where: { orderId: id } });
        const previousRequestedDate = order.requestedDate;
        const { items, schedule } = await this.validateOrder(
          order.customerId,
          order.addressId,
          nextWindow.deliveryDate,
          details.map((detail) => ({
            presentationId: detail.presentationId,
            quantity: Number(detail.requestedQuantity),
          })),
          manager,
        );
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  
        order.requestedDate = nextWindow.deliveryDate;
        order.orderCutoffAt = schedule.orderCutoffAt;
        order.preparationAt = schedule.preparationAt;
        order.total = total.toFixed(2);
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderConfirmationLink).update(
          { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
          { expiresAt: schedule.orderCutoffAt },
        );
        await manager.getRepository(OrderDetail).delete({ orderId: id });
        await manager.getRepository(OrderDetail).save(items.map((item) => this.detailEntity(manager, id, item)));
        await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus: order.status,
          newStatus: order.status,
          userId: actor.id,
          origin: this.origin(actor),
          observation: `Pedido reprogramado de ${previousRequestedDate} a ${nextWindow.deliveryDate} por cierre vencido`,
        }));
        await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
          userId: actor.id,
          module: 'orders',
          action: 'REPROGRAMAR_PEDIDO_SIGUIENTE_FECHA',
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: {
            previousRequestedDate,
            requestedDate: nextWindow.deliveryDate,
            orderCutoffAt: schedule.orderCutoffAt,
            preparationAt: schedule.preparationAt,
          },
        }));
      });
      return this.findOne(id, actor);
    }
}
