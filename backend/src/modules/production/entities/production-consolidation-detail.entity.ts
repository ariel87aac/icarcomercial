import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { ProductLine } from '../../catalog/entities/product-line.entity';
import { Product } from '../../catalog/entities/product.entity';
import { UnitMeasure } from '../../catalog/entities/unit-measure.entity';
import { ProductionConsolidation } from './production-consolidation.entity';
import { ProductionConsolidationSource } from './production-consolidation-source.entity';
import { ProductionProgress } from './production-progress.entity';

@Entity({ name: 'consolidaciones_detalle' })
export class ProductionConsolidationDetail extends AuditableEntity {
  @Column({ name: 'consolidacion_id', type: 'uuid' })
  consolidationId: string;

  @ManyToOne(() => ProductionConsolidation, (consolidation) => consolidation.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consolidacion_id' })
  consolidation: ProductionConsolidation;

  @Column({ name: 'producto_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  product: Product;

  @Column({ name: 'linea_productiva_id', type: 'uuid' })
  productLineId: string;

  @ManyToOne(() => ProductLine, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'linea_productiva_id' })
  productLine: ProductLine;

  @Column({ name: 'unidad_base_id', type: 'uuid' })
  baseUnitId: string;

  @ManyToOne(() => UnitMeasure, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_base_id' })
  baseUnit: UnitMeasure;

  @Column({ name: 'cantidad_solicitada', type: 'numeric', precision: 18, scale: 6 })
  requestedQuantity: string;

  @Column({ name: 'cantidad_preparada', type: 'numeric', precision: 18, scale: 6, default: 0 })
  preparedQuantity: string;

  @Column({ name: 'diferencia', type: 'numeric', precision: 18, scale: 6 })
  difference: string;

  @OneToMany(() => ProductionConsolidationSource, (source) => source.consolidatedDetail)
  sources: ProductionConsolidationSource[];

  @OneToMany(() => ProductionProgress, (progress) => progress.consolidatedDetail)
  progress: ProductionProgress[];
}
