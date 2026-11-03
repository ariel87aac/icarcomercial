import { OrderReadPort } from './puertos/order-read.port';
import { NotFoundException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { UserType } from '../../seguridad/usuarios/entidades/user-type.enum';
import { Order } from '../entidades/order.entity';
import { OrderOrigin } from '../entidades/order.enums';
import { OrderAuditPort } from './puertos/order-audit.port';

@Injectable()
export class OrderAccessService {
  constructor(
    private readonly orders: OrderReadPort,
    private readonly auditService: OrderAuditPort,
  ) {}

  async loadOrder(id: string): Promise<Order> {
    const order = await this.orders.loadOrder(id);
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  async assertScope(order: Order, actor: AuthenticatedUser): Promise<void> {
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

  origin(actor: AuthenticatedUser): OrderOrigin {
    return actor.type === UserType.CUSTOMER ? OrderOrigin.PORTAL : OrderOrigin.INTERNAL;
  }
}
