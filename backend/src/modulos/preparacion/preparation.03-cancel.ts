import { workflowTransaction } from '../pedidos/order-workflow';
import { attachOrderWorkflow, coverageForOrders } from '../pedidos/order-workflow';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { CancelPreparationDto, ConfirmPreparationDto, CreatePreparationDto, PreparationQueryDto, RegisterPreparationProgressDto } from './dto/preparation.dto';
import { OrderPreparationDetail } from './entidades/order-preparation-detail.entity';
import { OrderPreparation } from './entidades/order-preparation.entity';
import { PreparationHistory } from './entidades/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from './entidades/preparation.enums';
import { PreparationServiceParte04 } from './preparation.04-lockPreparation';

export abstract class PreparationServiceParte03 extends PreparationServiceParte04 {
  async cancel(id: string, dto: CancelPreparationDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const preparation = await this.lockPreparation(manager, id);
        if (![PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED, PreparationStatus.PREPARED].includes(preparation.status)) {
          throw new ConflictException('Solo una preparación no asignada ni despachada puede cancelarse');
        }
        if (preparation.handedOffAt) throw new ConflictException('La preparación ya fue entregada a Distribución');
        const routeDelivery = await manager.query<Array<{ id: string }>>('SELECT id FROM rutas_entregas WHERE preparacion_id = $1 LIMIT 1', [id]);
        if (routeDelivery.length) throw new ConflictException('La preparación pertenece a una ruta; retírela o cancele la ruta antes de continuar');
        const previous = preparation.status;
        preparation.status = PreparationStatus.CANCELED;
        preparation.canceledById = actor.id;
        preparation.canceledAt = new Date();
        preparation.cancellationReason = dto.reason.trim();
        await manager.getRepository(OrderPreparation).save(preparation);
        await this.saveHistory(manager, id, previous, PreparationStatus.CANCELED, PreparationEvent.CANCELLATION, actor.id, preparation.cancellationReason, { orderId: preparation.orderId });
        await this.saveAudit(manager, actor.id, 'CANCELAR_PREPARACION', id, { orderId: preparation.orderId, reason: preparation.cancellationReason });
      });
      const result = await this.findOne(id);
      await this.trackingService.safeCaptureOrder(result.orderId, `preparation.canceled:${id}:${result.version}`);
      await this.trackingService.refreshStock(`stock.preparation.cancel:${id}`);
      return result;
    }

  async reopen(id: string, actor: AuthenticatedUser): Promise<OrderPreparation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const preparation = await this.lockPreparation(manager, id);
        if (preparation.status !== PreparationStatus.PREPARED) throw new ConflictException('Solo una preparación lista para despacho puede editarse');
        if (preparation.handedOffAt) throw new ConflictException('La preparación ya fue entregada a Distribución');
        const assigned = await manager.query<Array<{ id: string }>>('SELECT id FROM rutas_entregas WHERE preparacion_id = $1 LIMIT 1', [id]);
        if (assigned.length) throw new ConflictException('La preparación ya pertenece a una ruta');
        preparation.status = PreparationStatus.IN_PROGRESS;
        preparation.confirmedById = null;
        preparation.confirmedAt = null;
        await manager.getRepository(OrderPreparation).save(preparation);
        await manager.getRepository(OrderPreparationDetail).update({ preparationId: id }, { verifiedById: null, verifiedAt: null });
        await this.saveHistory(manager, id, PreparationStatus.PREPARED, PreparationStatus.IN_PROGRESS, PreparationEvent.REOPENING, actor.id, 'Preparación reabierta para edición antes de su entrega');
        await this.saveAudit(manager, actor.id, 'REABRIR_PREPARACION', id, { orderId: preparation.orderId });
      });
      const result = await this.findOne(id);
      await this.trackingService.safeCaptureOrder(result.orderId, `preparation.reopened:${id}:${result.version}`);
      await this.trackingService.refreshStock(`stock.reopened:${id}:${result.version}`);
      return result;
    }

  async handoff(id: string, actor: AuthenticatedUser): Promise<OrderPreparation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const preparation = await this.lockPreparation(manager, id);
        if (preparation.status !== PreparationStatus.PREPARED) throw new ConflictException('Solo una preparación confirmada puede entregarse a Distribución');
        if (preparation.handedOffAt) throw new ConflictException('La preparación ya fue entregada a Distribución');
        preparation.handedOffById = actor.id;
        preparation.handedOffAt = new Date();
        await manager.getRepository(OrderPreparation).save(preparation);
        await this.saveHistory(manager, id, PreparationStatus.PREPARED, PreparationStatus.PREPARED, PreparationEvent.DISTRIBUTION_HANDOFF, actor.id, 'Pedido preparado entregado al flujo de Distribución');
        await this.saveAudit(manager, actor.id, 'ENTREGAR_PREPARACION_DISTRIBUCION', id, { orderId: preparation.orderId });
      });
      const result = await this.findOne(id);
      await this.trackingService.safeCaptureOrder(result.orderId, `preparation.handoff:${id}:${result.version}`);
      return result;
    }

  async history(id: string): Promise<PreparationHistory[]> {
      await this.findOne(id);
      return this.historyRepository.find({ where: { preparationId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
    }

  protected async attachOperationalDetailMetrics(preparation: OrderPreparation): Promise<void> {
      if (!preparation.details.length) return;
      const orderDetailIds = preparation.details.map((detail) => detail.orderDetailId);
      const productionRows = await this.dataSource.query<Array<{
          order_detail_id: string;
          id: string;
          code: number;
          status: string;
          scheduled_date: string;
          received_quantity: string;
          planned_quantity: string;
          attributable_received: string;
          production_contribution: string;
        }>>(`
          SELECT source.detalle_pedido_id AS order_detail_id,
                 consolidation.id,
                 consolidation.codigo AS code,
                 consolidation.estado AS status,
                 detail.fecha_programada AS scheduled_date,
                 detail.cantidad_recibida_almacen::text AS received_quantity,
                 detail.cantidad_planificada::text AS planned_quantity,
                 CASE
                   WHEN detail.cantidad_requerida_produccion > 0
                     THEN LEAST(source.aporte_produccion_base,
                       detail.cantidad_recibida_almacen * source.aporte_produccion_base / detail.cantidad_requerida_produccion)::text
                   ELSE '0'
                 END AS attributable_received,
                 source.aporte_produccion_base::text AS production_contribution
            FROM consolidaciones_origen source
            JOIN consolidaciones_detalle detail ON detail.id = source.detalle_consolidado_id
            JOIN consolidaciones_produccion consolidation ON consolidation.id = detail.consolidacion_id
           WHERE source.detalle_pedido_id = ANY($1::uuid[])
           ORDER BY consolidation.codigo, detail.secuencia
        `, [orderDetailIds]);
      const coverage = await coverageForOrders(this.dataSource.manager, [preparation.orderId]);
      const productionByDetail = new Map<string, typeof productionRows>();
      for (const row of productionRows) productionByDetail.set(row.order_detail_id, [...(productionByDetail.get(row.order_detail_id) ?? []), row]);
      for (const detail of preparation.details) {
        const physical = Number(detail.stock.physicalQuantity);
        const totalReserved = Number(detail.stock.reservedQuantity);
        const related = productionByDetail.get(detail.orderDetailId) ?? [];
        const received = related.reduce((sum, row) => sum + Number(row.attributable_received), 0);
        const productionRequired = related.reduce((sum, row) => sum + Number(row.production_contribution), 0);
        detail.physicalQuantityCurrent = physical.toFixed(3);
        detail.totalReservedQuantityCurrent = totalReserved.toFixed(3);
        detail.availableQuantityCurrent = (physical - totalReserved).toFixed(3);
        detail.shortageQuantityCurrent = Math.max(0, totalReserved - physical).toFixed(3);
        detail.pickableQuantityCurrent = coverage.get(detail.orderDetailId)?.cubierto ?? '0.000';
        detail.shortageQuantityCurrent = coverage.get(detail.orderDetailId)?.faltante ?? detail.requestedQuantity;
        detail.productionReceivedQuantity = received.toFixed(3);
        detail.productionPendingQuantity = Math.max(0, productionRequired - received).toFixed(3);
        detail.relatedProductionOrders = related.map((row) => ({
          id: row.id,
          code: Number(row.code),
          status: row.status,
          scheduledDate: row.scheduled_date,
          receivedQuantity: Number(row.received_quantity).toFixed(3),
          plannedQuantity: Number(row.planned_quantity).toFixed(3),
        }));
      }
    }

  protected async withOrderStockMetrics(orders: Order[]) {
      const detailIds = orders.flatMap((order) => order.details.map((detail) => detail.id));
      const presentationIds = orders.flatMap((order) => order.details.map((detail) => detail.presentationId));
      const [stocks, reservations] = await Promise.all([
        presentationIds.length ? this.stockRepository.find({ where: { presentationId: In(presentationIds) } }) : [],
        detailIds.length ? this.reservationRepository.find({ where: { orderDetailId: In(detailIds) } }) : [],
      ]);
      const stockByPresentation = new Map(stocks.map((stock) => [stock.presentationId, stock]));
      const reservationByDetail = new Map(reservations.map((reservation) => [reservation.orderDetailId, reservation]));
      await attachOrderWorkflow(this.dataSource.manager, orders);
      const coverage = await coverageForOrders(this.dataSource.manager, orders.map(order => order.id));
      return orders.map((order) => ({
        ...order,
        details: order.details.map((detail) => {
          const stock = stockByPresentation.get(detail.presentationId);
          return {
            ...detail,
            reservation: reservationByDetail.get(detail.id) ?? null,
            physicalQuantity: Number(stock?.physicalQuantity ?? 0).toFixed(3),
            totalReservedQuantity: Number(stock?.reservedQuantity ?? 0).toFixed(3),
            availableQuantity: stock ? (Number(stock.physicalQuantity) - Number(stock.reservedQuantity)).toFixed(3) : '0.000',
            coveredQuantity: coverage.get(detail.id)?.cubierto ?? '0.000',
            shortageQuantity: coverage.get(detail.id)?.faltante ?? detail.requestedQuantity,
            availability: coverage.get(detail.id)?.disponibilidad ?? 'PENDIENTE_STOCK',
            pickableQuantity: coverage.get(detail.id)?.cubierto ?? '0.000',
          };
        }),
      }));
    }
}
