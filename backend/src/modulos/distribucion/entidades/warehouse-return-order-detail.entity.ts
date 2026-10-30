import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Stock } from '../../almacen/entidades/stock.entity';
import { VisitResultDetail } from './visit-result-detail.entity';
import { WarehouseReturnOrder } from './warehouse-return-order.entity';

@Entity({ name: 'ordenes_retorno_almacen_detalle' })
export class WarehouseReturnOrderDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'orden_retorno_id', type: 'uuid' })
  returnOrderId: string;

  @ManyToOne(() => WarehouseReturnOrder, (returnOrder) => returnOrder.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_retorno_id' })
  returnOrder: WarehouseReturnOrder;

  @Column({ name: 'resultado_visita_detalle_id', type: 'uuid', unique: true })
  visitResultDetailId: string;

  @ManyToOne(() => VisitResultDetail, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resultado_visita_detalle_id' })
  visitResultDetail: VisitResultDetail;

  @Column({ name: 'existencia_id', type: 'uuid' })
  stockId: string;

  @ManyToOne(() => Stock, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'existencia_id' })
  stock: Stock;

  @Column({ name: 'cantidad_esperada', type: 'numeric', precision: 14, scale: 3 })
  expectedQuantity: string;

  @Column({ name: 'cantidad_recibida', type: 'numeric', precision: 14, scale: 3, default: 0 })
  receivedQuantity: string;
}
