import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';
import { OrderDetail } from '../../pedidos/entidades/order-detail.entity';
import { ProductionConsolidationDetail } from './production-consolidation-detail.entity';

@Entity({ name: 'consolidaciones_origen' })
export class ProductionConsolidationSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'detalle_consolidado_id', type: 'uuid' })
  consolidatedDetailId: string;

  @ManyToOne(() => ProductionConsolidationDetail, (detail) => detail.sources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'detalle_consolidado_id' })
  consolidatedDetail: ProductionConsolidationDetail;

  @Column({ name: 'detalle_pedido_id', type: 'uuid' })
  orderDetailId: string;

  @ManyToOne(() => OrderDetail, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'detalle_pedido_id' })
  orderDetail: OrderDetail;

  @Column({ name: 'presentacion_id', type: 'uuid' })
  presentationId: string;

  @ManyToOne(() => ProductPresentation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation;

  @Column({ name: 'cantidad_original', type: 'numeric', precision: 18, scale: 6 })
  originalQuantity: string;

  @Column({ name: 'cantidad_reservada_original', type: 'numeric', precision: 18, scale: 6, default: 0 })
  reservedQuantity: string;

  @Column({ name: 'cantidad_pendiente_original', type: 'numeric', precision: 18, scale: 6, default: 0 })
  pendingQuantity: string;

  @Column({ name: 'factor_aplicado', type: 'numeric', precision: 18, scale: 6 })
  appliedFactor: string;

  @Column({ name: 'aporte_unidad_base', type: 'numeric', precision: 18, scale: 6 })
  baseContribution: string;

  @Column({ name: 'aporte_almacen_base', type: 'numeric', precision: 18, scale: 6, default: 0 })
  warehouseContribution: string;

  @Column({ name: 'aporte_produccion_base', type: 'numeric', precision: 18, scale: 6, default: 0 })
  productionContribution: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
