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
import { DistributionServiceParte09 } from './distribution.09-loadDeliveries';

export abstract class DistributionServiceParte08 extends DistributionServiceParte09 {
  async receiveWarehouseReturn(id: string, dto: ReceiveWarehouseReturnDto, actor: AuthenticatedUser): Promise<WarehouseReturnOrder> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const returnOrder = await manager.getRepository(WarehouseReturnOrder).createQueryBuilder('returnOrder')
          .setLock('pessimistic_write')
          .innerJoinAndSelect('returnOrder.route', 'route')
          .where('returnOrder.id = :id', { id })
          .getOne();
        if (!returnOrder) throw new NotFoundException('Orden de retorno a Almacén no encontrada');
        if (returnOrder.status !== WarehouseReturnStatus.PENDING) throw new ConflictException('La orden de retorno ya fue recibida');
        const details = await manager.getRepository(WarehouseReturnOrderDetail).find({
          where: { returnOrderId: id },
          relations: {
            visitResultDetail: {
              preparationDetail: true,
              visitResult: { delivery: true },
            },
          },
        });
        if (dto.details.length !== details.length || new Set(dto.details.map((item) => item.detailId)).size !== details.length) {
          throw new BadRequestException('Debe verificar exactamente todos los productos de la orden de retorno');
        }
        const detailById = new Map(details.map((detail) => [detail.id, detail]));
        let receivedTotal = 0;
        for (const input of dto.details) {
          const detail = detailById.get(input.detailId);
          if (!detail) throw new UnprocessableEntityException('El detalle no pertenece a la orden de retorno');
          const expected = Number(detail.expectedQuantity);
          if (input.quantity > expected + 0.0005) throw new BadRequestException('La cantidad recibida no puede superar la cantidad retornada');
          const visitDetail = detail.visitResultDetail;
          if (input.quantity > 0) {
            const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
              .setLock('pessimistic_write')
              .where('stock.id = :id', { id: detail.stockId })
              .getOneOrFail();
            const previous = Number(stock.physicalQuantity);
            const next = previous + input.quantity;
            stock.physicalQuantity = next.toFixed(3);
            await manager.getRepository(Stock).save(stock);
            await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
              stockId: stock.id,
              type: InventoryMovementType.RETURN_IN,
              quantity: input.quantity.toFixed(3),
              previousBalance: previous.toFixed(3),
              newBalance: next.toFixed(3),
              reason: `Recepción de retorno N.º ${returnOrder.code} · ${returnOrder.route.code}`,
              userId: actor.id,
              orderId: visitDetail.visitResult.delivery.orderId,
              orderDetailId: visitDetail.preparationDetail.orderDetailId,
              routeDeliveryId: visitDetail.visitResult.delivery.id,
            }));
          }
          detail.receivedQuantity = input.quantity.toFixed(3);
          await manager.getRepository(WarehouseReturnOrderDetail).save(detail);
          visitDetail.acceptedReturnQuantity = input.quantity.toFixed(3);
          visitDetail.returnAcceptedById = actor.id;
          visitDetail.returnAcceptedAt = new Date();
          await manager.getRepository(VisitResultDetail).save(visitDetail);
          receivedTotal += input.quantity;
        }
        if (Math.abs(receivedTotal - Number(returnOrder.expectedQuantity)) > 0.0005 && !dto.observation?.trim()) {
          throw new BadRequestException('Una recepción con diferencia requiere observación');
        }
  
        const routeDeliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: returnOrder.routeId }, relations: { result: true } });
        const counts = routeDeliveries.reduce((value, delivery) => {
          if (delivery.result?.result === VisitResultType.DELIVERED) value.complete += 1;
          if (delivery.result?.result === VisitResultType.PARTIAL) value.partial += 1;
          if (delivery.result?.result === VisitResultType.NOT_DELIVERED) value.notDelivered += 1;
          return value;
        }, { complete: 0, partial: 0, notDelivered: 0 });
        await manager.getRepository(RouteSettlement).save(manager.getRepository(RouteSettlement).create({
          routeId: returnOrder.routeId,
          completeDeliveries: counts.complete,
          partialDeliveries: counts.partial,
          notDelivered: counts.notDelivered,
          acceptedReturnQuantity: receivedTotal.toFixed(3),
          responsibleId: actor.id,
          observation: dto.observation?.trim() || null,
        }));
        returnOrder.status = WarehouseReturnStatus.RECEIVED;
        returnOrder.receivedQuantity = receivedTotal.toFixed(3);
        returnOrder.receivedById = actor.id;
        returnOrder.receivedAt = new Date();
        returnOrder.observation = dto.observation?.trim() || null;
        await manager.getRepository(WarehouseReturnOrder).save(returnOrder);
        returnOrder.route.status = DistributionRouteStatus.SETTLED;
        returnOrder.route.settledById = actor.id;
        returnOrder.route.settledAt = new Date();
        await manager.getRepository(DistributionRoute).save(returnOrder.route);
        await this.saveHistory(manager, returnOrder.routeId, DistributionRouteStatus.FINISHED, DistributionRouteStatus.SETTLED, RouteHistoryEvent.SETTLEMENT, actor.id, dto.observation?.trim() || `Retorno N.º ${returnOrder.code} recibido por Almacén`, { ...counts, returnOrderId: returnOrder.id, expectedQuantity: returnOrder.expectedQuantity, receivedQuantity: receivedTotal.toFixed(3) });
        await this.saveAudit(manager, actor.id, 'RECIBIR_RETORNO_ALMACEN', returnOrder.routeId, { returnOrderId: returnOrder.id, expectedQuantity: returnOrder.expectedQuantity, receivedQuantity: receivedTotal.toFixed(3) });
      });
      return this.warehouseReturn(id);
    }

  async history(id: string): Promise<RouteHistory[]> {
      await this.findOne(id);
      return this.historyRepository.find({ where: { routeId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
    }

  protected applyFilters(builder: ReturnType<Repository<DistributionRoute>['createQueryBuilder']>, query: DistributionRouteQueryDto): void {
      if (query.date) builder.andWhere('route.date = :date', { date: query.date });
      if (query.zoneId) builder.andWhere('route.zoneId = :zoneId', { zoneId: query.zoneId });
      if (query.vehicleId) builder.andWhere('route.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
      if (query.status) builder.andWhere('route.status = :status', { status: query.status });
      if (query.q?.trim()) {
        builder.andWhere('(route.code ILIKE :query OR zone.name ILIKE :query OR vehicle.plate ILIKE :query)', { query: `%${query.q.trim()}%` });
      }
    }

  protected async loadDelivery(id: string): Promise<RouteDelivery> {
      const delivery = await this.deliveryRepository.findOne({
        where: { id },
        relations: {
          order: { customer: true },
          address: { zone: true },
          preparation: true,
          result: { user: true, details: { preparationDetail: true } },
        },
      });
      if (!delivery) throw new NotFoundException('Entrega no encontrada');
      const preparation = await this.dataSource.getRepository(OrderPreparation).findOne({
        where: { id: delivery.preparationId },
        relations: {
          details: {
            orderDetail: { presentation: { product: true, unit: true } },
            stock: true,
          },
        },
      });
      if (preparation) delivery.preparation = preparation;
      if (delivery.result) {
        const detailById = new Map((preparation?.details ?? []).map((detail) => [detail.id, detail]));
        for (const resultDetail of delivery.result.details) {
          const completeDetail = detailById.get(resultDetail.preparationDetailId);
          if (completeDetail) resultDetail.preparationDetail = completeDetail;
        }
      }
      return delivery;
    }
}
