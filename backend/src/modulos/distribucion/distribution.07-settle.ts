import { workflowTransaction } from '../pedidos/order-workflow';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { SaleService } from '../ventas-cobranzas/sale.service';
import { Sale } from '../ventas-cobranzas/entidades/sale.entity';
import { Vehicle } from './flota/entidades/vehicle.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { InventoryMovementType, InventoryReservationStatus } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderPreparationDetail } from '../preparacion/entidades/order-preparation-detail.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { PreparationHistory } from '../preparacion/entidades/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from '../preparacion/entidades/preparation.enums';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import {
  AddRouteDeliveriesDto,
  CancelRouteDto,
  CompleteFactoryDeliveryDto,
  CreateDistributionRouteDto,
  DistributionRouteQueryDto,
  PendingDistributionQueryDto,
  RegisterVisitResultDto,
  ReceiveWarehouseReturnDto,
  RescheduleRouteDto,
  RouteTransitionDto,
  SettleRouteDto,
  UpdatePresentationWeightsDto,
  UpdateRouteSequenceDto,
  UpdateRouteVehicleDto,
  WeightReadinessQueryDto,
  WarehouseReturnQueryDto,
} from './dto/distribution.dto';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { DistributionDeliveryType, DistributionRouteStatus, RouteDeliveryStatus, RouteHistoryEvent, RouteResponsibleFunction, VisitResultType, WarehouseReturnStatus } from './entidades/distribution.enums';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteHistory } from './entidades/route-history.entity';
import { RouteResponsible } from './entidades/route-responsible.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';
import { VisitResultDetail } from './entidades/visit-result-detail.entity';
import { VisitResult } from './entidades/visit-result.entity';
import { WarehouseReturnOrderDetail } from './entidades/warehouse-return-order-detail.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';

const ACTIVE_ROUTE_STATUSES = [
  DistributionRouteStatus.DRAFT,
  DistributionRouteStatus.PLANNED,
  DistributionRouteStatus.IN_DELIVERY,
];
import { DistributionServiceParte08 } from './distribution.08-receiveWarehouseReturn';

export abstract class DistributionServiceParte07 extends DistributionServiceParte08 {
  async settle(id: string, dto: SettleRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.FINISHED, 'Solo una ruta Finalizada puede liquidarse');
        const pendingReturn = await manager.getRepository(WarehouseReturnOrder).findOne({ where: { routeId: id, status: WarehouseReturnStatus.PENDING } });
        if (pendingReturn) throw new ConflictException(`La orden de retorno ${pendingReturn.code} debe ser recibida desde Almacén antes de liquidar la ruta`);
        const deliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: id }, relations: { result: { details: { preparationDetail: true } } } });
        if (!deliveries.length || deliveries.some((delivery) => !delivery.result)) throw new UnprocessableEntityException('Todas las visitas deben conservar un resultado');
        const visitDetails = deliveries.flatMap((delivery) => delivery.result?.details ?? []);
        const visitDetailById = new Map(visitDetails.map((detail) => [detail.id, detail]));
        if (new Set(dto.acceptedReturns.map((item) => item.visitDetailId)).size !== dto.acceptedReturns.length) throw new BadRequestException('No puede repetir una devolución');
        let acceptedTotal = 0;
        for (const accepted of dto.acceptedReturns) {
          const visitDetail = visitDetailById.get(accepted.visitDetailId);
          if (!visitDetail) throw new UnprocessableEntityException('La devolución no pertenece a la ruta');
          if (accepted.quantity > Number(visitDetail.returnedQuantity)) throw new BadRequestException('La cantidad aceptada no puede superar la devuelta');
          if (accepted.quantity <= 0) continue;
          const preparationDetail = visitDetail.preparationDetail;
          const stock = await manager.getRepository(Stock).createQueryBuilder('stock').setLock('pessimistic_write').where('stock.id = :id', { id: preparationDetail.stockId }).getOneOrFail();
          const previous = Number(stock.physicalQuantity);
          const next = previous + accepted.quantity;
          stock.physicalQuantity = next.toFixed(3);
          await manager.getRepository(Stock).save(stock);
          const delivery = deliveries.find((candidate) => candidate.result?.id === visitDetail.visitResultId)!;
          await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
            stockId: stock.id,
            type: InventoryMovementType.RETURN_IN,
            quantity: accepted.quantity.toFixed(3),
            previousBalance: previous.toFixed(3),
            newBalance: next.toFixed(3),
            reason: `Devolución aceptada en ${route.code}`,
            userId: actor.id,
            orderId: delivery.orderId,
            orderDetailId: preparationDetail.orderDetailId,
            routeDeliveryId: delivery.id,
          }));
          visitDetail.acceptedReturnQuantity = accepted.quantity.toFixed(3);
          visitDetail.returnAcceptedById = actor.id;
          visitDetail.returnAcceptedAt = new Date();
          await manager.getRepository(VisitResultDetail).save(visitDetail);
          acceptedTotal += accepted.quantity;
        }
        const counts = deliveries.reduce((value, delivery) => {
          if (delivery.result!.result === VisitResultType.DELIVERED) value.complete += 1;
          if (delivery.result!.result === VisitResultType.PARTIAL) value.partial += 1;
          if (delivery.result!.result === VisitResultType.NOT_DELIVERED) value.notDelivered += 1;
          return value;
        }, { complete: 0, partial: 0, notDelivered: 0 });
        await manager.getRepository(RouteSettlement).save(manager.getRepository(RouteSettlement).create({
          routeId: route.id,
          completeDeliveries: counts.complete,
          partialDeliveries: counts.partial,
          notDelivered: counts.notDelivered,
          acceptedReturnQuantity: acceptedTotal.toFixed(3),
          responsibleId: actor.id,
          observation: dto.observation?.trim() || null,
        }));
        route.status = DistributionRouteStatus.SETTLED;
        route.settledById = actor.id;
        route.settledAt = new Date();
        await manager.getRepository(DistributionRoute).save(route);
        await this.saveHistory(manager, id, DistributionRouteStatus.FINISHED, DistributionRouteStatus.SETTLED, RouteHistoryEvent.SETTLEMENT, actor.id, dto.observation?.trim() || 'Liquidación operativa registrada', { ...counts, acceptedReturnQuantity: acceptedTotal });
        await this.saveAudit(manager, actor.id, 'LIQUIDAR_RUTA', id, { ...counts, acceptedReturnQuantity: acceptedTotal });
      });
      return this.findOne(id);
    }

  async warehouseReturns(query: WarehouseReturnQueryDto) {
      const builder = this.dataSource.getRepository(WarehouseReturnOrder).createQueryBuilder('returnOrder')
        .innerJoinAndSelect('returnOrder.route', 'route')
        .innerJoinAndSelect('route.zone', 'zone')
        .innerJoinAndSelect('route.vehicle', 'vehicle')
        .innerJoinAndSelect('returnOrder.createdBy', 'createdBy')
        .leftJoinAndSelect('returnOrder.receivedBy', 'receivedBy')
        .loadRelationCountAndMap('returnOrder.detailCount', 'returnOrder.details')
        .orderBy('returnOrder.createdAt', 'DESC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      if (query.status) builder.andWhere('returnOrder.status = :status', { status: query.status });
      if (query.q?.trim()) {
        builder.andWhere('(CAST(returnOrder.code AS text) ILIKE :q OR route.code ILIKE :q OR vehicle.plate ILIKE :q)', { q: `%${query.q.trim()}%` });
      }
      const [items, total] = await builder.getManyAndCount();
      return paginate(items, total, query.page, query.limit);
    }

  async warehouseReturn(id: string): Promise<WarehouseReturnOrder> {
      const item = await this.dataSource.getRepository(WarehouseReturnOrder).findOne({
        where: { id },
        relations: {
          route: { zone: true, vehicle: true },
          createdBy: true,
          receivedBy: true,
          details: {
            stock: { presentation: { product: true, unit: true } },
            visitResultDetail: {
              preparationDetail: { orderDetail: true },
              visitResult: { delivery: { order: { customer: true } } },
            },
          },
        },
      });
      if (!item) throw new NotFoundException('Orden de retorno a Almacén no encontrada');
      return item;
    }
}
