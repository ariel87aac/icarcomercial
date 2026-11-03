import { OrderLinkPort } from './puertos/order-link.port';
import { ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { Order } from '../entidades/order.entity';
import { OrderStatus, OrderConfirmationLinkStatus } from '../entidades/order.enums';
import { PublicOrderConfirmationView } from './public-order-confirmation.view';
import { createHash } from 'node:crypto';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { OrderPublicUrlPort } from './puertos/order-public-url.port';

@Injectable()
export class OrderLinksService {
  constructor(
    private readonly links: OrderLinkPort,
    private readonly urls: OrderPublicUrlPort,
  ) {}

  async resolveConfirmationLink(token: string, allowUsed: boolean): Promise<OrderConfirmationLink> {
    if (token.length < 32 || token.length > 200)
      throw new NotFoundException('El enlace de confirmación no está disponible');
    const link = await this.links.findByHash(this.hashToken(token));
    if (!link) throw new NotFoundException('El enlace de confirmación no está disponible');
    if (link.status === OrderConfirmationLinkStatus.ACTIVE && link.expiresAt <= new Date()) {
      link.status = OrderConfirmationLinkStatus.EXPIRED;
      await this.links.save(link);
      throw new ConflictException('El plazo de confirmación del pedido finalizó');
    }
    if (
      link.status !== OrderConfirmationLinkStatus.ACTIVE &&
      !(allowUsed && link.status === OrderConfirmationLinkStatus.USED)
    ) {
      throw new NotFoundException('El enlace de confirmación no está disponible');
    }
    return link;
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  publicBaseUrl(): string {
    return this.urls.publicBaseUrl();
  }

  publicConfirmationView(order: Order, linkActive: boolean): PublicOrderConfirmationView {
    return {
      orderReference: order.code,
      customerName: order.customer.businessName,
      requestedDate: order.requestedDate,
      orderCutoffAt: order.orderCutoffAt,
      status: order.status,
      total: order.total,
      canConfirm: linkActive && order.status === OrderStatus.RECEIVED,
      details: order.details.map((detail) => ({
        product: detail.productDescriptionSnapshot,
        presentation: detail.presentationDescriptionSnapshot,
        unit: detail.unitAbbreviationSnapshot,
        quantity: detail.requestedQuantity,
        subtotal: detail.subtotal,
      })),
    };
  }
}
