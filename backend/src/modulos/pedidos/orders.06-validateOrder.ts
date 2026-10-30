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
import { OrdersServiceBase } from './orders.base';

export abstract class OrdersServiceParte06 extends OrdersServiceBase {
  protected async validateOrder(
      customerId: string,
      addressId: string,
      requestedDate: string,
      details: OrderItemDto[],
      manager?: EntityManager,
      requireOpen = true,
    ): Promise<{ customer: Customer; address: CustomerAddress; items: ResolvedItem[]; schedule: OrderScheduleWindow }> {
      const customerRepository = manager?.getRepository(Customer) ?? this.customerRepository;
      const addressRepository = manager?.getRepository(CustomerAddress) ?? this.addressRepository;
      const presentationRepository = manager?.getRepository(ProductPresentation) ?? this.presentationRepository;
      const customer = await customerRepository.findOne({ where: { id: customerId, status: RecordStatus.ACTIVE } });
      if (!customer) throw new NotFoundException('Cliente no encontrado o inactivo');
      const address = await addressRepository.findOne({
        where: { id: addressId, customerId, status: RecordStatus.ACTIVE },
        relations: { zone: { distributionDays: true }, distributionDay: true },
      });
      if (!address) throw new UnprocessableEntityException('El domicilio no pertenece al cliente o está inactivo');
      const schedule = await this.schedulingService.resolve(address, requestedDate, requireOpen);
      if (!details.length) throw new BadRequestException('El pedido debe incluir al menos un detalle');
      const uniqueIds = new Set(details.map((detail) => detail.presentationId));
      if (uniqueIds.size !== details.length) throw new BadRequestException('Una presentación no puede repetirse en el detalle');
      const today = new Date().toISOString().slice(0, 10);
      const items: ResolvedItem[] = [];
      for (const detail of details) {
        const presentation = await presentationRepository.findOne({
          where: { id: detail.presentationId, status: RecordStatus.ACTIVE },
          relations: { product: true, unit: true },
        });
        if (!presentation || presentation.product.status !== RecordStatus.ACTIVE) {
          throw new UnprocessableEntityException('El pedido contiene un producto o presentación inactiva');
        }
        const price = await this.pricingService.resolveApplicablePrice(presentation.id, customer, today, manager);
        if (!price) throw new UnprocessableEntityException(`No existe un precio aplicable para ${presentation.description}`);
        const unitPrice = Number(price.amount);
        items.push({ presentation, quantity: detail.quantity, unitPrice, subtotal: unitPrice * detail.quantity });
      }
      return { customer, address, items, schedule };
    }

  protected detailEntity(manager: EntityManager, orderId: string, item: ResolvedItem): OrderDetail {
      return manager.getRepository(OrderDetail).create({ orderId, presentationId: item.presentation.id, ...this.detailValues(item) });
    }

  protected detailValues(item: ResolvedItem): Partial<OrderDetail> {
      return {
        requestedQuantity: item.quantity.toFixed(3),
        reservedQuantity: '0.000',
        pendingQuantity: '0.000',
        unitPrice: item.unitPrice.toFixed(2),
        subtotal: item.subtotal.toFixed(2),
        productDescriptionSnapshot: item.presentation.product.name,
        presentationDescriptionSnapshot: item.presentation.description,
        unitAbbreviationSnapshot: item.presentation.unit.abbreviation,
      };
    }

  protected async loadOrder(id: string): Promise<Order> {
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
      if (!order) throw new NotFoundException('Pedido no encontrado');
      return order;
    }

  protected async resolveConfirmationLink(token: string, allowUsed: boolean): Promise<OrderConfirmationLink> {
      if (token.length < 32 || token.length > 200) throw new NotFoundException('El enlace de confirmación no está disponible');
      const link = await this.confirmationLinkRepository.findOne({ where: { tokenHash: this.hashToken(token) } });
      if (!link) throw new NotFoundException('El enlace de confirmación no está disponible');
      if (link.status === OrderConfirmationLinkStatus.ACTIVE && link.expiresAt <= new Date()) {
        link.status = OrderConfirmationLinkStatus.EXPIRED;
        await this.confirmationLinkRepository.save(link);
        throw new ConflictException('El plazo de confirmación del pedido finalizó');
      }
      if (link.status !== OrderConfirmationLinkStatus.ACTIVE && !(allowUsed && link.status === OrderConfirmationLinkStatus.USED)) {
        throw new NotFoundException('El enlace de confirmación no está disponible');
      }
      return link;
    }

  protected async afterConfirmation(order: Order, notificationOwnerId: string, sourceEvent: string): Promise<void> {
      await this.notificationService.safeEnqueueOrderLifecycle(
        order,
        NotificationEvent.ORDER_CONFIRMED,
        notificationOwnerId,
        { productList: this.productList(order), trackingUrl: await this.trackingService.ensureOrderLink(order) },
      );
      await this.trackingService.safeCaptureOrder(order.id, sourceEvent);
      await this.trackingService.refreshStock(`stock.confirm:${order.id}`);
    }

  protected publicConfirmationView(order: Order, linkActive: boolean): PublicOrderConfirmationView {
      return {
        orderReference: order.code,
        customerName: order.customer.businessName,
        requestedDate: order.requestedDate,
        orderCutoffAt: order.orderCutoffAt,
        status: order.status,
        total: order.total,
        canConfirm: linkActive && [OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(order.status),
        details: order.details.map((detail) => ({
          product: detail.productDescriptionSnapshot,
          presentation: detail.presentationDescriptionSnapshot,
          unit: detail.unitAbbreviationSnapshot,
          quantity: detail.requestedQuantity,
          subtotal: detail.subtotal,
        })),
      };
    }

  protected productList(order: Order): string {
      return order.details
        .map((detail) => `- ${detail.productDescriptionSnapshot} · ${detail.presentationDescriptionSnapshot}: ${Number(detail.requestedQuantity)} ${detail.unitAbbreviationSnapshot}`)
        .join('\n');
    }

  protected hashToken(token: string): string {
      return createHash('sha256').update(token).digest('hex');
    }

  protected publicBaseUrl(): string {
      const configured = this.config.get<string>('PUBLIC_APP_URL', '').trim();
      if (configured) return configured.replace(/\/$/, '');
      return this.config.get<string>('CORS_ORIGIN', 'http://localhost:8080').split(',')[0].trim().replace(/\/$/, '');
    }

  protected async assertScope(order: Order, actor: AuthenticatedUser): Promise<void> {
      if (actor.type !== UserType.CUSTOMER || order.customerId === actor.customerId) return;
      await this.auditService.record({
        userId: actor.id,
        module: 'orders',
        action: 'ACCESO_PEDIDO_AJENO',
        entity: 'pedidos',
        entityId: order.id,
        result: 'RECHAZADO',
        metadata: { scopedCustomerId: actor.customerId },
      });
      throw new NotFoundException('Pedido no encontrado');
    }

  protected origin(actor: AuthenticatedUser): OrderOrigin {
      return actor.type === UserType.CUSTOMER ? OrderOrigin.PORTAL : OrderOrigin.INTERNAL;
    }
}
