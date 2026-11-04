import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { Sale } from '../../ventas-cobranzas/entidades/sale.entity';
import { RouteDelivery } from '../entidades/route-delivery.entity';
import { buildThermalDeliveryTicket, createThermalDeliveryTicketPdf } from './thermal-delivery-ticket';

@Injectable()
export class ThermalDeliveryTicketService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async export(deliveryId: string, actor: AuthenticatedUser) {
    const delivery = await this.dataSource.getRepository(RouteDelivery).findOne({
      where: { id: deliveryId },
      relations: {
        route: { vehicle: true, zone: true, responsibles: { user: true } },
        order: { customer: true },
        address: { zone: true },
        preparation: { details: { orderDetail: { presentation: { product: true, unit: true } } } },
        result: { user: true, details: true },
      },
    });
    if (!delivery) throw new NotFoundException('Entrega no encontrada');
    this.assertScope(delivery, actor);
    const sale = delivery.result
      ? await this.dataSource.getRepository(Sale).findOne({ where: { visitResultId: delivery.result.id } })
      : null;
    const content = await createThermalDeliveryTicketPdf(buildThermalDeliveryTicket({
      delivery,
      sale,
      generatedBy: actor.name,
      generatedAt: new Date(),
    }));
    await this.audit.record({
      userId: actor.id,
      module: 'distribution',
      action: 'IMPRIMIR_TICKET_ENTREGA_80MM',
      entity: 'rutas_entregas',
      entityId: delivery.id,
      result: 'EXITOSO',
      metadata: {
        orderCode: delivery.order.code,
        routeId: delivery.routeId,
        deliveryType: delivery.deliveryType,
        visitResult: delivery.result?.result ?? null,
        saleCode: sale?.code ?? null,
      },
    });
    return {
      filename: `icar-entrega-${safeFilename(delivery.order.code)}-80mm.pdf`,
      mime: 'application/pdf',
      content,
    };
  }

  private assertScope(delivery: RouteDelivery, actor: AuthenticatedUser): void {
    if (!delivery.routeId || actor.roles.some((role) => ['ADMINISTRADOR', 'COMERCIALIZACION'].includes(role))) return;
    const assigned = delivery.route?.responsibles?.some((item) => item.userId === actor.id);
    if (!assigned) throw new ForbiddenException('La entrega no pertenece a una ruta asignada al usuario');
  }
}

function safeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
