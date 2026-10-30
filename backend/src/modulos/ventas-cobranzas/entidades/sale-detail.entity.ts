import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { OrderDetail } from '../../pedidos/entidades/order-detail.entity';
import { Sale } from './sale.entity';

@Entity({ name: 'ventas_detalle' })
export class SaleDetail extends AuditableEntity {
  @Column({ name: 'venta_codigo', type: 'integer' }) saleCode: number;
  @ManyToOne(() => Sale, (sale) => sale.details, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'venta_codigo', referencedColumnName: 'code' }) sale: Sale;
  @Column({ name: 'pedido_detalle_id', type: 'uuid' }) orderDetailId: string;
  @ManyToOne(() => OrderDetail, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pedido_detalle_id' }) orderDetail: OrderDetail;
  @Column({ name: 'cantidad_entregada', type: 'numeric', precision: 14, scale: 3 }) deliveredQuantity: string;
  @Column({ name: 'precio_unitario', type: 'numeric', precision: 14, scale: 2 }) unitPrice: string;
  @Column({ name: 'descuento', type: 'numeric', precision: 14, scale: 2, default: 0 }) discount: string;
  @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2 }) subtotal: string;
  @Column({ name: 'producto_copia', type: 'varchar', length: 160 }) productSnapshot: string;
  @Column({ name: 'presentacion_copia', type: 'varchar', length: 160 }) presentationSnapshot: string;
  @Column({ name: 'unidad_copia', type: 'varchar', length: 20 }) unitSnapshot: string;
}
