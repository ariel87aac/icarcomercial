import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductPresentation } from '../../catalog/entities/product-presentation.entity';
import { OrderDetail } from '../../orders/entities/order-detail.entity';
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

  @Column({ name: 'factor_aplicado', type: 'numeric', precision: 18, scale: 6 })
  appliedFactor: string;

  @Column({ name: 'aporte_unidad_base', type: 'numeric', precision: 18, scale: 6 })
  baseContribution: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
