import { ProductionError } from '../dominio/production-error';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrderDetail } from '../../pedidos/entidades/order-detail.entity';

@Injectable()
export class ProductionSourcesReader {
  constructor() {}

  async eligibleOrderDetailIds(manager: EntityManager, deliveryDate: string): Promise<string[]> {
    const filters = [`orders.estado = 'CONFIRMADO'`, 'orders.fecha_solicitada = $1', 'source.id IS NULL'];
    const rows = await manager.query<{ id: string }[]>(
      `SELECT order_detail.id
           FROM pedidos_detalle order_detail
           JOIN pedidos orders ON orders.id = order_detail.pedido_id
           LEFT JOIN consolidaciones_origen source ON source.detalle_pedido_id = order_detail.id
          WHERE ${filters.join(' AND ')}
          ORDER BY order_detail.id
          FOR UPDATE OF order_detail`,
      [deliveryDate],
    );
    return rows.map((row) => row.id);
  }

  loadOrderDetails(manager: EntityManager, ids: string[]): Promise<OrderDetail[]> {
    return manager
      .getRepository(OrderDetail)
      .createQueryBuilder('detail')
      .leftJoinAndSelect('detail.order', 'order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('detail.presentation', 'presentation')
      .leftJoinAndSelect('presentation.unit', 'presentationUnit')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.productLine', 'productLine')
      .leftJoinAndSelect('product.baseUnit', 'baseUnit')
      .where('detail.id IN (:...ids)', { ids })
      .orderBy('detail.id', 'ASC')
      .getMany();
  }

  async preparationDeadline(manager: EntityManager, detailIds: string[]): Promise<Date> {
    const rows = await manager.query<Array<{ deadline: Date }>>(
      `SELECT MIN(orders.fecha_preparacion) AS deadline
           FROM pedidos_detalle detail
           JOIN pedidos orders ON orders.id = detail.pedido_id
          WHERE detail.id = ANY($1::uuid[])`,
      [detailIds],
    );
    if (!rows[0]?.deadline)
      throw new ProductionError('inconsistent', 'Los pedidos no tienen una fecha límite de preparación válida');
    return new Date(rows[0].deadline);
  }
}
