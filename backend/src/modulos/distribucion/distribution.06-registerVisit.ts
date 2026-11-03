import { workflowTransaction } from '../pedidos/order-workflow';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { Sale } from '../ventas-cobranzas/entidades/sale.entity';
import { RegisterVisitResultDto, RouteTransitionDto } from './dto/distribution.dto';
import { DistributionRoute } from './entidades/distribution-route.entity';
import {
  DistributionDeliveryType,
  DistributionRouteStatus,
  RouteDeliveryStatus,
  RouteHistoryEvent,
  VisitResultType,
  WarehouseReturnStatus,
} from './entidades/distribution.enums';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';
import { VisitResultDetail } from './entidades/visit-result-detail.entity';
import { VisitResult } from './entidades/visit-result.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';
import { DistributionServiceParte07 } from './distribution.07-settle';

export abstract class DistributionServiceParte06 extends DistributionServiceParte07 {
  async registerVisit(deliveryId: string, dto: RegisterVisitResultDto, actor: AuthenticatedUser): Promise<DistributionRoute & { generatedSale?: Pick<Sale, 'id' | 'code' | 'dueDate' | 'total'> }> {
      const transactionResult = await workflowTransaction(this.dataSource, async (manager) => {
        const delivery = await manager.getRepository(RouteDelivery).createQueryBuilder('delivery')
          .setLock('pessimistic_write', undefined, ['delivery'])
          .leftJoinAndSelect('delivery.route', 'route')
          .leftJoinAndSelect('delivery.preparation', 'preparation')
          .leftJoinAndSelect('preparation.details', 'detail')
          .where('delivery.id = :deliveryId', { deliveryId })
          .getOne();
        if (!delivery) throw new NotFoundException('Entrega de ruta no encontrada');
        if (delivery.deliveryType !== DistributionDeliveryType.ROUTE || !delivery.route || !delivery.routeId) {
          throw new ConflictException('La entrega en fábrica debe completarse desde Pedidos pendientes');
        }
        const route = delivery.route;
        const routeId = delivery.routeId;
        if (route.status !== DistributionRouteStatus.IN_DELIVERY) throw new ConflictException('La ruta no está En reparto');
        await this.assertAssigned(manager, routeId, actor);
        const existing = await manager.getRepository(VisitResult).findOne({ where: { routeDeliveryId: deliveryId } });
        if (existing) throw new ConflictException('La visita ya tiene un resultado registrado');
        if (dto.result !== VisitResultType.DELIVERED && !dto.observation?.trim()) throw new BadRequestException('La entrega parcial o no entregada requiere observación');
        const detailById = new Map(delivery.preparation.details.map((detail) => [detail.id, detail]));
        if (dto.details.length !== detailById.size || new Set(dto.details.map((detail) => detail.preparationDetailId)).size !== detailById.size) {
          throw new BadRequestException('Debe registrar exactamente todos los detalles preparados');
        }
        let deliveredTotal = 0;
        let preparedTotal = 0;
        for (const item of dto.details) {
          const detail = detailById.get(item.preparationDetailId);
          if (!detail) throw new UnprocessableEntityException('El detalle no pertenece a la preparación de la entrega');
          const prepared = Number(detail.preparedQuantity);
          if (item.deliveredQuantity + item.returnedQuantity > prepared + 0.0005) throw new BadRequestException('Las cantidades entregada y devuelta no pueden superar la preparada');
          if (Math.abs(item.deliveredQuantity + item.returnedQuantity - prepared) > 0.0005) throw new UnprocessableEntityException('Toda cantidad despachada debe quedar entregada o devuelta');
          deliveredTotal += item.deliveredQuantity;
          preparedTotal += prepared;
        }
        if (dto.result === VisitResultType.DELIVERED && Math.abs(deliveredTotal - preparedTotal) > 0.0005) throw new UnprocessableEntityException('Una entrega completa debe entregar todas las cantidades');
        if (dto.result === VisitResultType.NOT_DELIVERED && deliveredTotal > 0.0005) throw new UnprocessableEntityException('Una visita no entregada no puede registrar cantidades entregadas');
        if (dto.result === VisitResultType.PARTIAL && (deliveredTotal <= 0 || deliveredTotal >= preparedTotal)) throw new UnprocessableEntityException('Una entrega parcial debe registrar una cantidad entregada menor que la preparada');
        const resultRepository = manager.getRepository(VisitResult);
        const result = await resultRepository.save(resultRepository.create({ routeDeliveryId: delivery.id, result: dto.result, userId: actor.id, observation: dto.observation?.trim() || null }));
        for (const item of dto.details) {
          await manager.getRepository(VisitResultDetail).save(manager.getRepository(VisitResultDetail).create({
            visitResultId: result.id,
            preparationDetailId: item.preparationDetailId,
            deliveredQuantity: item.deliveredQuantity.toFixed(3),
            returnedQuantity: item.returnedQuantity.toFixed(3),
            acceptedReturnQuantity: '0.000',
            returnAcceptedById: null,
            returnAcceptedAt: null,
          }));
        }
        delivery.status = RouteDeliveryStatus.VISITED;
        await manager.getRepository(RouteDelivery).save(delivery);
        let saleId: string | null = null;
        if ([VisitResultType.DELIVERED, VisitResultType.PARTIAL].includes(dto.result)) {
          saleId = await this.saleService.createInTransaction(manager, result.id, actor);
          const auditRepository = manager.getRepository(AuditEvent);
          await auditRepository.save(auditRepository.create({
            userId: actor.id,
            module: 'commercial',
            action: 'EMITIR_VENTA_AUTOMATICA',
            entity: 'ventas',
            entityId: saleId,
            result: 'EXITOSO',
            ipAddress: null,
            metadata: { visitResultId: result.id, routeDeliveryId: delivery.id, orderId: delivery.orderId },
          }));
        }
        await this.saveHistory(manager, routeId, route.status, route.status, RouteHistoryEvent.VISIT, actor.id, dto.observation?.trim() || dto.result, { deliveryId, result: dto.result });
        await this.saveAudit(manager, actor.id, 'REGISTRAR_RESULTADO_VISITA', deliveryId, { routeId, result: dto.result, saleId });
        return { routeId, saleId };
      });
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureRoute(transactionResult.routeId, `route.visit:${deliveryId}`);
      const route = await this.findOne(transactionResult.routeId) as DistributionRoute & { generatedSale?: Pick<Sale, 'id' | 'code' | 'dueDate' | 'total'> };
      if (transactionResult.saleId) {
        const sale = await this.dataSource.getRepository(Sale).findOneOrFail({ where: { id: transactionResult.saleId } });
        route.generatedSale = { id: sale.id, code: sale.code, dueDate: sale.dueDate, total: sale.total };
      }
      return route;
    }

  async sendWarehouseReturn(id: string, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.IN_DELIVERY, 'Solo una ruta En reparto puede enviar devoluciones');
        await this.assertAssigned(manager, id, actor);
        const deliveries = await manager.getRepository(RouteDelivery).find({
          where: { routeId: id },
          relations: { result: { details: { preparationDetail: true } } },
        });
        if (!deliveries.length || deliveries.some((delivery) => delivery.status !== RouteDeliveryStatus.VISITED)) {
          throw new UnprocessableEntityException('Todas las entregas deben tener un resultado antes de enviar la devolución');
        }
        const returnOrder = await this.createWarehouseReturnOrder(manager, route, deliveries, actor.id);
        if (!returnOrder) throw new BadRequestException('El recorrido no tiene productos para devolver a Almacén');
        if (returnOrder.status === WarehouseReturnStatus.RECEIVED) throw new ConflictException('La devolución ya fue recepcionada; puede finalizar el recorrido');
        await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.VISIT, actor.id, `Devolución N.º ${returnOrder.code} enviada a Almacén`, {
          returnOrderId: returnOrder.id,
          returnedQuantity: returnOrder.expectedQuantity,
        });
      });
      return this.findOne(id);
    }

  async finish(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.IN_DELIVERY, 'Solo una ruta En reparto puede finalizarse');
        await this.assertAssigned(manager, id, actor);
        const deliveries = await manager.getRepository(RouteDelivery).find({
          where: { routeId: id },
          relations: { result: { details: { preparationDetail: true } } },
        });
        if (!deliveries.length || deliveries.some((delivery) => delivery.status !== RouteDeliveryStatus.VISITED)) {
          throw new UnprocessableEntityException('Todas las entregas deben tener un resultado antes de finalizar el recorrido');
        }
        const returnedQuantity = deliveries
          .flatMap((delivery) => delivery.result?.details ?? [])
          .reduce((total, detail) => total + Number(detail.returnedQuantity), 0);
        const returnOrder = await manager.getRepository(WarehouseReturnOrder).findOne({ where: { routeId: id } });
        if (returnedQuantity > 0 && !returnOrder) {
          throw new ConflictException('Debe enviar los productos devueltos a Almacén antes de finalizar el recorrido');
        }
        if (returnOrder?.status === WarehouseReturnStatus.PENDING) {
          throw new ConflictException('Almacén debe recepcionar la devolución antes de finalizar el recorrido');
        }
        const finishedAt = new Date();
        route.status = DistributionRouteStatus.SETTLED;
        route.finishedById = actor.id;
        route.finishedAt = finishedAt;
        route.settledById = actor.id;
        route.settledAt = finishedAt;
        const counts = deliveries.reduce((value, delivery) => {
          if (delivery.result?.result === VisitResultType.DELIVERED) value.complete += 1;
          if (delivery.result?.result === VisitResultType.PARTIAL) value.partial += 1;
          if (delivery.result?.result === VisitResultType.NOT_DELIVERED) value.notDelivered += 1;
          return value;
        }, { complete: 0, partial: 0, notDelivered: 0 });
        await manager.getRepository(RouteSettlement).save(manager.getRepository(RouteSettlement).create({
          routeId: route.id, completeDeliveries: counts.complete, partialDeliveries: counts.partial,
          notDelivered: counts.notDelivered, acceptedReturnQuantity: returnOrder?.receivedQuantity ?? '0.000', responsibleId: actor.id,
          observation: dto.observation?.trim() || (returnOrder ? 'Recorrido liquidado después de la recepción de la devolución' : 'Recorrido sin devoluciones liquidado automáticamente'),
        }));
        await manager.getRepository(DistributionRoute).save(route);
        await this.saveHistory(manager, id, DistributionRouteStatus.IN_DELIVERY, DistributionRouteStatus.FINISHED, RouteHistoryEvent.FINISH, actor.id, dto.observation?.trim() || 'Recorrido finalizado', {
          returnOrderId: returnOrder?.id ?? null,
          returnedQuantity: returnOrder?.receivedQuantity ?? '0.000',
        });
        await this.saveHistory(manager, id, DistributionRouteStatus.FINISHED, DistributionRouteStatus.SETTLED, RouteHistoryEvent.SETTLEMENT, actor.id, returnOrder ? 'Devolución recepcionada y recorrido liquidado' : 'Recorrido sin devoluciones liquidado automáticamente');
        await this.saveAudit(manager, actor.id, 'FINALIZAR_RUTA', id, { deliveries: deliveries.length, returnOrderId: returnOrder?.id ?? null, warehouseReturnReceived: returnOrder?.status === WarehouseReturnStatus.RECEIVED });
      });
      return this.findOne(id);
    }
}
