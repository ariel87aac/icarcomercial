import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { ProductPresentation } from '../../catalog/entities/product-presentation.entity';
import { Order } from './order.entity';

@Entity({ name: 'pedidos_detalle' })
export class OrderDetail extends AuditableEntity {
  @Column({ name: 'pedido_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  order: Order;

  @Column({ name: 'presentacion_id', type: 'uuid' })
  presentationId: string;

  @ManyToOne(() => ProductPresentation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation;

  @Column({ name: 'cantidad_solicitada', type: 'numeric', precision: 14, scale: 3 })
  requestedQuantity: string;

  @Column({ name: 'cantidad_reservada', type: 'numeric', precision: 14, scale: 3, default: 0 })
  reservedQuantity: string;

  @Column({ name: 'cantidad_pendiente', type: 'numeric', precision: 14, scale: 3, default: 0 })
  pendingQuantity: string;

  @Column({ name: 'precio_unitario', type: 'numeric', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2 })
  subtotal: string;

  @Column({ name: 'producto_descripcion_copia', type: 'varchar', length: 160 })
  productDescriptionSnapshot: string;

  @Column({ name: 'presentacion_descripcion_copia', type: 'varchar', length: 160 })
  presentationDescriptionSnapshot: string;

  @Column({ name: 'unidad_abreviatura_copia', type: 'varchar', length: 20 })
  unitAbbreviationSnapshot: string;
}
