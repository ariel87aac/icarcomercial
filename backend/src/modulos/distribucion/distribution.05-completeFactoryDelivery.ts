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
import { DistributionServiceParte06 } from './distribution.06-registerVisit';

export abstract class DistributionServiceParte05 extends DistributionServiceParte06 {
  async completeFactoryDelivery(
      dto: CompleteFactoryDeliveryDto,
      actor: AuthenticatedUser,
    ): Promise<{ delivery: RouteDelivery; generatedSale?: Pick<Sale, 'id' | 'code' | 'dueDate' | 'total'> }> {
      const transactionResult = await workflowTransaction(this.dataSource, async (manager) => {
        const preparation = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
          .setLock('pessimistic_write', undefined, ['preparation'])
          .innerJoinAndSelect('preparation.order', 'orders')
          .innerJoinAndSelect('orders.customer', 'customer')
          .innerJoinAndSelect('orders.address', 'address')
          .innerJoinAndSelect('preparation.details', 'detail')
          .innerJoinAndSelect('detail.orderDetail', 'orderDetail')
          .where('preparation.id = :id', { id: dto.preparationId })
          .getOne();
        if (!preparation) throw new NotFoundException('Preparación no encontrada');
        if (preparation.status !== PreparationStatus.PREPARED || !preparation.handedOffAt) {
          throw new ConflictException('Solo un pedido preparado y entregado a Distribución puede cerrarse en fábrica');
        }
        const existingDelivery = await manager.getRepository(RouteDelivery).findOne({ where: { preparationId: preparation.id } });
        if (existingDelivery) throw new ConflictException('La preparación ya fue asignada a reparto o entrega en fábrica');
        if (dto.result !== VisitResultType.DELIVERED && !dto.observation?.trim()) {
          throw new BadRequestException('La entrega parcial o rechazada en fábrica requiere observación');
        }
  
        const detailById = new Map(preparation.details.map((detail) => [detail.id, detail]));
        if (dto.details.length !== detailById.size || new Set(dto.details.map((detail) => detail.preparationDetailId)).size !== detailById.size) {
          throw new BadRequestException('Debe registrar exactamente todos los productos preparados');
        }
        let deliveredTotal = 0;
        let preparedTotal = 0;
        for (const item of dto.details) {
          const detail = detailById.get(item.preparationDetailId);
          if (!detail) throw new UnprocessableEntityException('El producto no pertenece a la preparación seleccionada');
          const prepared = Number(detail.preparedQuantity);
          if (item.deliveredQuantity + item.returnedQuantity > prepared + 0.0005) {
            throw new BadRequestException('Las cantidades entregada y no retirada no pueden superar la preparada');
          }
          if (Math.abs(item.deliveredQuantity + item.returnedQuantity - prepared) > 0.0005) {
            throw new UnprocessableEntityException('Toda cantidad preparada debe quedar entregada o disponible nuevamente en Almacén');
          }
          deliveredTotal += item.deliveredQuantity;
          preparedTotal += prepared;
        }
        if (dto.result === VisitResultType.DELIVERED && Math.abs(deliveredTotal - preparedTotal) > 0.0005) {
          throw new UnprocessableEntityException('Una entrega completa debe entregar todas las cantidades');
        }
        if (dto.result === VisitResultType.NOT_DELIVERED && deliveredTotal > 0.0005) {
          throw new UnprocessableEntityException('Un pedido rechazado no puede registrar cantidades entregadas');
        }
        if (dto.result === VisitResultType.PARTIAL && (deliveredTotal <= 0 || deliveredTotal >= preparedTotal)) {
          throw new UnprocessableEntityException('Una entrega parcial debe registrar una cantidad mayor que cero y menor que la preparada');
        }
  
        const deliveryRepository = manager.getRepository(RouteDelivery);
        const delivery = await deliveryRepository.save(deliveryRepository.create({
          routeId: null,
          deliveryType: DistributionDeliveryType.FACTORY,
          preparationId: preparation.id,
          orderId: preparation.orderId,
          addressId: preparation.order.addressId,
          position: null,
          status: RouteDeliveryStatus.PENDING,
        }));
        const inputByDetail = new Map(dto.details.map((item) => [item.preparationDetailId, item]));
        for (const detail of [...preparation.details].sort((a, b) => a.stockId.localeCompare(b.stockId))) {
          const input = inputByDetail.get(detail.id)!;
          const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
            .setLock('pessimistic_write')
            .where('stock.id = :id', { id: detail.stockId })
            .getOneOrFail();
          const delivered = Number(input.deliveredQuantity);
          const previous = Number(stock.physicalQuantity);
          if (delivered > previous + 0.0005) throw new ConflictException('La existencia física es insuficiente para completar la entrega en fábrica');
          let reservationQuantity = 0;
          if (detail.reservationId) {
            const reservation = await manager.getRepository(InventoryReservation).createQueryBuilder('reservation')
              .setLock('pessimistic_write')
              .where('reservation.id = :id', { id: detail.reservationId })
              .getOne();
            if (!reservation || reservation.status !== InventoryReservationStatus.ACTIVE) {
              throw new ConflictException('La reserva ya fue consumida o no está disponible');
            }
            reservationQuantity = Number(reservation.quantity);
            reservation.status = InventoryReservationStatus.CONSUMED;
            await manager.getRepository(InventoryReservation).save(reservation);
          }
          const next = previous - delivered;
          const nextReserved = Number(stock.reservedQuantity) - reservationQuantity;
          if (nextReserved < -0.0005) throw new ConflictException('Los saldos reservados cambiaron durante la entrega');
          stock.physicalQuantity = next.toFixed(3);
          stock.reservedQuantity = Math.max(0, nextReserved).toFixed(3);
          await manager.getRepository(Stock).save(stock);
          if (delivered > 0) {
            await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
              stockId: stock.id,
              type: InventoryMovementType.DISPATCH_OUT,
              quantity: delivered.toFixed(3),
              previousBalance: previous.toFixed(3),
              newBalance: next.toFixed(3),
              reason: `Entrega en fábrica del pedido ${preparation.order.code}`,
              userId: actor.id,
              orderId: preparation.orderId,
              orderDetailId: detail.orderDetailId,
              routeDeliveryId: delivery.id,
            }));
          }
        }
  
        preparation.status = PreparationStatus.DISPATCHED;
        await manager.getRepository(OrderPreparation).save(preparation);
        await this.savePreparationHistory(manager, preparation.id, PreparationStatus.PREPARED, PreparationStatus.DISPATCHED, PreparationEvent.DISPATCH, actor.id, 'Entrega directa en fábrica');
  
        const resultRepository = manager.getRepository(VisitResult);
        const result = await resultRepository.save(resultRepository.create({
          routeDeliveryId: delivery.id,
          result: dto.result,
          userId: actor.id,
          observation: dto.observation?.trim() || null,
        }));
        for (const item of dto.details) {
          await manager.getRepository(VisitResultDetail).save(manager.getRepository(VisitResultDetail).create({
            visitResultId: result.id,
            preparationDetailId: item.preparationDetailId,
            deliveredQuantity: item.deliveredQuantity.toFixed(3),
            returnedQuantity: item.returnedQuantity.toFixed(3),
            acceptedReturnQuantity: item.returnedQuantity.toFixed(3),
            returnAcceptedById: item.returnedQuantity > 0 ? actor.id : null,
            returnAcceptedAt: item.returnedQuantity > 0 ? new Date() : null,
          }));
        }
        delivery.status = RouteDeliveryStatus.VISITED;
        await deliveryRepository.save(delivery);
  
        let saleId: string | null = null;
        if ([VisitResultType.DELIVERED, VisitResultType.PARTIAL].includes(dto.result)) {
          saleId = await this.saleService.createInTransaction(manager, result.id, actor);
        }
        const auditRepository = manager.getRepository(AuditEvent);
        await auditRepository.save(auditRepository.create({
          userId: actor.id,
          module: 'distribution',
          action: 'REGISTRAR_ENTREGA_FABRICA',
          entity: 'rutas_entregas',
          entityId: delivery.id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { preparationId: preparation.id, orderId: preparation.orderId, result: dto.result, deliveredTotal: deliveredTotal.toFixed(3), saleId },
        }));
        return { deliveryId: delivery.id, orderId: preparation.orderId, saleId };
      });
  
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureOrder(transactionResult.orderId, `factory.delivery:${transactionResult.deliveryId}`);
      const delivery = await this.loadDelivery(transactionResult.deliveryId);
      if (!transactionResult.saleId) return { delivery };
      const sale = await this.dataSource.getRepository(Sale).findOneOrFail({ where: { id: transactionResult.saleId } });
      return { delivery, generatedSale: { id: sale.id, code: sale.code, dueDate: sale.dueDate, total: sale.total } };
    }
}
