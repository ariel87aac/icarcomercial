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
import { PreparationServiceParte03 } from './preparation.03-cancel';

export abstract class PreparationServiceParte02 extends PreparationServiceParte03 {
  async create(dto: CreatePreparationDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
      const id = await workflowTransaction(this.dataSource, async (manager) => {
        const order = await manager.getRepository(Order).createQueryBuilder('orders')
          .setLock('pessimistic_write')
          .where('orders.id = :id', { id: dto.orderId })
          .getOne();
        if (!order) throw new NotFoundException('Pedido no encontrado');
        if (order.status !== OrderStatus.CONFIRMED) throw new ConflictException('Solo un pedido Confirmado puede iniciar preparación');
        const duplicate = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
          .where('preparation.orderId = :orderId', { orderId: order.id })
          .andWhere('preparation.status <> :canceledStatus', { canceledStatus: PreparationStatus.CANCELED })
          .getOne();
        if (duplicate) throw new ConflictException('El pedido ya tiene una preparación registrada y no cancelada');
        const details = await manager.getRepository(OrderDetail).find({ where: { orderId: order.id } });
        if (!details.length) throw new UnprocessableEntityException('El pedido no contiene detalles para preparar');
        const productionReferences = await manager.query<{ id: string }[]>(`
          SELECT DISTINCT consolidation.id
            FROM consolidaciones_produccion consolidation
            JOIN consolidaciones_detalle consolidated_detail ON consolidated_detail.consolidacion_id = consolidation.id
            JOIN consolidaciones_origen source ON source.detalle_consolidado_id = consolidated_detail.id
           WHERE source.detalle_pedido_id = ANY($1::uuid[])
           ORDER BY consolidation.id
        `, [details.map((detail) => detail.id)]);
        const repository = manager.getRepository(OrderPreparation);
        const preparation = await repository.save(repository.create({
          orderId: order.id,
          responsibleId: actor.id,
          status: PreparationStatus.PENDING,
          productionReferences: productionReferences.map((row) => row.id),
          startedAt: new Date(),
          confirmedById: null,
          confirmedAt: null,
          handedOffById: null,
          handedOffAt: null,
        }));
        for (const detail of details) {
          const reservation = await manager.getRepository(InventoryReservation).findOne({ where: { orderDetailId: detail.id } });
          const stock = await manager.getRepository(Stock).findOne({ where: { presentationId: detail.presentationId } });
          if (!stock) throw new UnprocessableEntityException('No existe una existencia asociada a uno de los detalles');
          const requested = Number(detail.requestedQuantity);
          const reserved = Number(reservation?.quantity ?? detail.reservedQuantity);
          const physical = Number(stock.physicalQuantity);
          const available = physical - Number(stock.reservedQuantity);
          const shortage = Math.max(0, Number(stock.reservedQuantity) - physical);
          await manager.getRepository(OrderPreparationDetail).save(manager.getRepository(OrderPreparationDetail).create({
            preparationId: preparation.id,
            orderDetailId: detail.id,
            reservationId: reservation?.id ?? null,
            stockId: stock.id,
            requestedQuantity: requested.toFixed(3),
            reservedQuantity: reserved.toFixed(3),
            availableSnapshot: available.toFixed(3),
            physicalSnapshot: physical.toFixed(3),
            shortageSnapshot: shortage.toFixed(3),
            preparedQuantity: requested.toFixed(3),
            difference: '0.000',
            observation: null,
            verifiedById: null,
            verifiedAt: null,
          }));
        }
        await this.saveHistory(manager, preparation.id, null, PreparationStatus.PENDING, PreparationEvent.START, actor.id, 'Preparación iniciada', {
          orderId: order.id,
          productionReferences: preparation.productionReferences,
        });
        await this.saveAudit(manager, actor.id, 'INICIAR_PREPARACION', preparation.id, { orderId: order.id });
        return preparation.id;
      });
      const result = await this.findOne(id);
      await this.trackingService.safeCaptureOrder(result.orderId, `preparation.started:${id}`);
      return result;
    }

  async progress(id: string, dto: RegisterPreparationProgressDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
      if (!dto.details.length) throw new BadRequestException('Debe registrar al menos un detalle');
      await workflowTransaction(this.dataSource, async (manager) => {
        const preparation = await this.lockPreparation(manager, id);
        if (![PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED].includes(preparation.status)) {
          throw new ConflictException('La preparación ya no admite avances');
        }
        const details = await manager.getRepository(OrderPreparationDetail).createQueryBuilder('detail')
          .setLock('pessimistic_write')
          .where('detail.preparationId = :id', { id })
          .getMany();
        const detailById = new Map(details.map((detail) => [detail.id, detail]));
        if (new Set(dto.details.map((detail) => detail.preparationDetailId)).size !== dto.details.length) {
          throw new BadRequestException('No puede repetir un detalle en el mismo avance');
        }
        const changes: Record<string, unknown>[] = [];
        for (const item of dto.details) {
          const detail = detailById.get(item.preparationDetailId);
          if (!detail) throw new UnprocessableEntityException('El detalle no pertenece a la preparación');
          if (item.preparedQuantity > Number(detail.requestedQuantity)) {
            throw new BadRequestException('La cantidad preparada no puede superar la solicitada');
          }
          detail.preparedQuantity = item.preparedQuantity.toFixed(3);
          detail.difference = (item.preparedQuantity - Number(detail.requestedQuantity)).toFixed(3);
          detail.observation = item.observation?.trim() || null;
          detail.verifiedById = item.verified ? actor.id : null;
          detail.verifiedAt = item.verified ? new Date() : null;
          await manager.getRepository(OrderPreparationDetail).save(detail);
          changes.push({ detailId: detail.id, preparedQuantity: detail.preparedQuantity, difference: detail.difference, verified: item.verified });
        }
        const allDetails = await manager.getRepository(OrderPreparationDetail).find({ where: { preparationId: id } });
        const previous = preparation.status;
        preparation.status = allDetails.some((detail) => Number(detail.difference) !== 0)
          ? PreparationStatus.OBSERVED
          : PreparationStatus.IN_PROGRESS;
        await manager.getRepository(OrderPreparation).save(preparation);
        await this.saveHistory(manager, id, previous, preparation.status, PreparationEvent.PROGRESS, actor.id, 'Cantidades de preparación actualizadas', { changes });
        await this.saveAudit(manager, actor.id, 'REGISTRAR_AVANCE_PREPARACION', id, { details: changes.length });
      });
      const result = await this.findOne(id);
      await this.trackingService.safeCaptureOrder(result.orderId, `preparation.progress:${id}:${result.version}`);
      return result;
    }

  async confirm(id: string, dto: ConfirmPreparationDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const preparation = await this.lockPreparation(manager, id);
        if (![PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED].includes(preparation.status)) {
          throw new ConflictException('La preparación debe tener detalles verificados antes de confirmarse');
        }
        const details = await manager.getRepository(OrderPreparationDetail).find({ where: { preparationId: id } });
        if (!details.length || details.some((detail) => !detail.verifiedAt)) {
          throw new UnprocessableEntityException('Todos los detalles deben estar verificados');
        }
        const unjustified = details.find((detail) => Number(detail.difference) !== 0 && !detail.observation?.trim());
        if (unjustified) throw new UnprocessableEntityException('Toda diferencia requiere una observación antes de confirmar');
        // Serialize stock decisions before evaluating priority and coverage.
        for (const stockId of [...new Set(details.map((detail) => detail.stockId))].sort()) {
          await manager.getRepository(Stock).createQueryBuilder('stock').setLock('pessimistic_write')
            .where('stock.id = :stockId', { stockId }).getOneOrFail();
        }
        const coverage = await coverageForOrders(manager, [preparation.orderId]);
        for (const detail of details) {
          const available = Number(coverage.get(detail.orderDetailId)?.cubierto ?? 0);
          if (Number(detail.preparedQuantity) !== Number(detail.requestedQuantity)) {
            throw new UnprocessableEntityException('El pedido debe prepararse completo; manténgalo En preparación hasta cubrir todos sus productos');
          }
          if (Number(detail.preparedQuantity) > available + 0.0005) {
            throw new UnprocessableEntityException(`El pedido todavía no dispone de cobertura por prioridad. Cantidad cubierta: ${available.toFixed(3)}`);
          }
        }
        const previous = preparation.status;
        preparation.status = PreparationStatus.PREPARED;
        preparation.confirmedById = actor.id;
        preparation.confirmedAt = new Date();
        await manager.getRepository(OrderPreparation).save(preparation);
        await this.saveHistory(manager, id, previous, PreparationStatus.PREPARED, PreparationEvent.CONFIRMATION, actor.id, dto.observation?.trim() || 'Preparación confirmada');
        await this.saveAudit(manager, actor.id, 'CONFIRMAR_PREPARACION', id, { orderId: preparation.orderId });
      });
      const result = await this.findOne(id);
      await this.trackingService.safeCaptureOrder(result.orderId, `preparation.confirmed:${id}:${result.version}`);
      await this.trackingService.refreshStock(`stock.preparation.confirm:${id}`);
      return result;
    }
}
