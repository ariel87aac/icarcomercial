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
import { PreparationServiceParte02 } from './preparation.02-create';

export abstract class PreparationServiceParte01 extends PreparationServiceParte02 {
  async eligible(query: PreparationQueryDto) {
      const builder = this.orderRepository.createQueryBuilder('orders')
        .leftJoinAndSelect('orders.customer', 'customer')
        .leftJoinAndSelect('orders.address', 'address')
        .leftJoinAndSelect('address.zone', 'zone')
        .leftJoinAndSelect('orders.details', 'detail')
        .leftJoinAndSelect('detail.presentation', 'presentation')
        .leftJoinAndSelect('presentation.product', 'product')
        .leftJoinAndSelect('presentation.unit', 'unit')
        .where('orders.status = :status', { status: OrderStatus.CONFIRMED })
        .andWhere(`NOT EXISTS (
          SELECT 1 FROM preparaciones_pedido preparation
          WHERE preparation.pedido_id = orders.id
            AND preparation.estado <> :canceledStatus
        )`, { canceledStatus: PreparationStatus.CANCELED })
        .orderBy('orders.createdAt', 'ASC')
        .addOrderBy('orders.code', 'ASC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
      if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
      if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
      if (query.q?.trim()) {
        builder.andWhere(new Brackets((nested) => nested
          .where('orders.code ILIKE :query', { query: `%${query.q!.trim()}%` })
          .orWhere('orders.customerNameSnapshot ILIKE :query', { query: `%${query.q!.trim()}%` })
          .orWhere('customer.businessName ILIKE :query', { query: `%${query.q!.trim()}%` })));
      }
      const [orders, total] = await builder.getManyAndCount();
      return paginate(await this.withOrderStockMetrics(orders), total, query.page, query.limit);
    }

  async workQueue(query: PreparationQueryDto) {
      const builder = this.orderRepository.createQueryBuilder('orders')
        .leftJoinAndSelect('orders.customer', 'customer')
        .leftJoinAndSelect('orders.address', 'address')
        .leftJoinAndSelect('address.zone', 'zone')
        .leftJoinAndSelect('orders.details', 'detail')
        .leftJoinAndSelect('detail.presentation', 'presentation')
        .leftJoinAndSelect('presentation.product', 'product')
        .leftJoinAndSelect('presentation.unit', 'unit')
        .where('orders.status = :status', { status: OrderStatus.CONFIRMED })
        .andWhere(`NOT EXISTS (
          SELECT 1 FROM preparaciones_pedido terminal_preparation
           WHERE terminal_preparation.pedido_id = orders.id
             AND terminal_preparation.estado IN (:...terminalStatuses)
        )`, { terminalStatuses: [PreparationStatus.PREPARED, PreparationStatus.ASSIGNED, PreparationStatus.DISPATCHED] })
        .orderBy('orders.createdAt', 'ASC')
        .addOrderBy('orders.code', 'ASC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
      if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
      if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
      if (query.q?.trim()) {
        builder.andWhere(new Brackets((nested) => nested
          .where('orders.code ILIKE :query', { query: `%${query.q!.trim()}%` })
          .orWhere('orders.customerNameSnapshot ILIKE :query', { query: `%${query.q!.trim()}%` })
          .orWhere('customer.businessName ILIKE :query', { query: `%${query.q!.trim()}%` })));
      }
      const [orders, total] = await builder.getManyAndCount();
      const preparations = orders.length ? await this.preparationRepository.createQueryBuilder('preparation')
        .leftJoinAndSelect('preparation.responsible', 'responsible')
        .loadRelationCountAndMap('preparation.detailCount', 'preparation.details')
        .where('preparation.orderId IN (:...orderIds)', { orderIds: orders.map((order) => order.id) })
        .andWhere('preparation.status IN (:...statuses)', { statuses: [PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED] })
        .getMany() : [];
      const preparationByOrder = new Map(preparations.map((preparation) => [preparation.orderId, preparation]));
      const rows = await this.withOrderStockMetrics(orders);
      return paginate(rows.map((order) => ({ ...order, preparation: preparationByOrder.get(order.id) ?? null })), total, query.page, query.limit);
    }

  async findAll(query: PreparationQueryDto) {
      const builder = this.preparationRepository.createQueryBuilder('preparation')
        .leftJoinAndSelect('preparation.order', 'orders')
        .leftJoinAndSelect('orders.customer', 'customer')
        .leftJoinAndSelect('orders.address', 'address')
        .leftJoinAndSelect('address.zone', 'zone')
        .leftJoinAndSelect('preparation.responsible', 'responsible')
        .leftJoinAndSelect('preparation.confirmedBy', 'confirmedBy')
        .leftJoinAndSelect('preparation.handedOffBy', 'handedOffBy')
        .loadRelationCountAndMap('preparation.detailCount', 'preparation.details')
        .orderBy('orders.requestedDate', 'DESC')
        .addOrderBy('preparation.createdAt', 'DESC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
      if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
      if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
      if (query.status) builder.andWhere('preparation.status = :preparationStatus', { preparationStatus: query.status });
      if (query.stage === 'PREPARE') builder.andWhere('preparation.status IN (:...prepareStatuses)', { prepareStatuses: [PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED] });
      if (query.stage === 'READY') builder.andWhere('preparation.status = :readyStatus AND preparation.handedOffAt IS NULL', { readyStatus: PreparationStatus.PREPARED });
      if (query.stage === 'HANDED_OFF') builder.andWhere('preparation.status = :handedStatus AND preparation.handedOffAt IS NOT NULL', { handedStatus: PreparationStatus.PREPARED });
      if (query.q?.trim()) {
        builder.andWhere(new Brackets((nested) => nested
          .where('orders.code ILIKE :query', { query: `%${query.q!.trim()}%` })
          .orWhere('orders.customerNameSnapshot ILIKE :query', { query: `%${query.q!.trim()}%` })
          .orWhere('customer.businessName ILIKE :query', { query: `%${query.q!.trim()}%` })));
      }
      const [items, total] = await builder.getManyAndCount();
      if (items.length) {
        const shortages = await this.dataSource.query<Array<{ preparation_id: string; shortage_count: string }>>(`
          SELECT detail.preparacion_id,
                 COUNT(*) FILTER (WHERE stock.cantidad_fisica - stock.cantidad_reservada < 0)::text AS shortage_count
            FROM preparaciones_detalle detail
            JOIN existencias stock ON stock.id = detail.existencia_id
           WHERE detail.preparacion_id = ANY($1::uuid[])
           GROUP BY detail.preparacion_id
        `, [items.map((item) => item.id)]);
        const byPreparation = new Map(shortages.map((row) => [row.preparation_id, Number(row.shortage_count)]));
        for (const item of items) item.shortageItemCount = byPreparation.get(item.id) ?? 0;
      }
      return paginate(items, total, query.page, query.limit);
    }

  async findOne(id: string): Promise<OrderPreparation> {
      const preparation = await this.preparationRepository.findOne({
        where: { id },
        relations: {
          order: { customer: true, address: { zone: true }, details: { presentation: { product: true, unit: true } } },
          responsible: true,
          confirmedBy: true,
          canceledBy: true,
          handedOffBy: true,
          details: { orderDetail: { presentation: { product: true, unit: true } }, reservation: true, stock: true, verifiedBy: true },
          history: { user: true },
        },
        order: { history: { occurredAt: 'ASC' } },
      });
      if (!preparation) throw new NotFoundException('Preparación no encontrada');
      preparation.details.sort((a, b) => a.orderDetail.productDescriptionSnapshot.localeCompare(b.orderDetail.productDescriptionSnapshot));
      await this.attachOperationalDetailMetrics(preparation);
      return preparation;
    }
}
