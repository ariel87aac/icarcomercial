import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { ProductLine } from '../../productos/catalogo/entidades/product-line.entity';
import { Product } from '../../productos/catalogo/entidades/product.entity';
import { ProductCategory } from '../../productos/catalogo/entidades/product-category.entity';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';
import { UnitMeasure } from '../../productos/catalogo/entidades/unit-measure.entity';
import { ProductionArea } from './production-area.entity';
import { StockReplenishmentRequestDetail } from '../../almacen/entidades/stock-replenishment-request-detail.entity';
import { ProductionConsolidation } from './production-consolidation.entity';
import { ProductionDelivery } from './production-delivery.entity';
import { ProductionConsolidationSource } from './production-consolidation-source.entity';
import { ProductionProgress } from './production-progress.entity';
import { ProductionDetailStage } from './production.enums';
import { User } from '../../seguridad/usuarios/entidades/user.entity';

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

  @Column({ name: 'categoria_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  category: ProductCategory | null;

  @Column({ name: 'presentacion_id', type: 'uuid', nullable: true })
  presentationId: string | null;

  @ManyToOne(() => ProductPresentation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation | null;

  @Column({ name: 'area_produccion_id', type: 'uuid', nullable: true })
  productionAreaId: string | null;

  @ManyToOne(() => ProductionArea, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'area_produccion_id' })
  productionArea: ProductionArea | null;

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

  @Column({ name: 'cantidad_cubierta_almacen', type: 'numeric', precision: 18, scale: 6, default: 0 })
  warehouseCoveredQuantity: string;

  @Column({ name: 'cantidad_requerida_produccion', type: 'numeric', precision: 18, scale: 6, default: 0 })
  productionRequiredQuantity: string;

  @Column({ name: 'cantidad_solicitada_stock', type: 'numeric', precision: 18, scale: 6, default: 0 })
  stockRequestedQuantity: string;

  @Column({ name: 'solicitud_abastecimiento_detalle_id', type: 'uuid', nullable: true, unique: true })
  stockRequestDetailId: string | null;

  @OneToOne(() => StockReplenishmentRequestDetail, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'solicitud_abastecimiento_detalle_id' })
  stockRequestDetail: StockReplenishmentRequestDetail | null;

  @Column({ name: 'ajuste_lote', type: 'numeric', precision: 18, scale: 6, default: 0 })
  additionalProductionQuantity: string;

  @Column({ name: 'cantidad_planificada', type: 'numeric', precision: 18, scale: 6, default: 0 })
  plannedQuantity: string;

  @Column({ name: 'motivo_ajuste_lote', type: 'varchar', length: 500, nullable: true })
  additionalProductionReason: string | null;

  @Column({ name: 'cantidad_preparada', type: 'numeric', precision: 18, scale: 6, default: 0 })
  preparedQuantity: string;

  @Column({ name: 'cantidad_recibida_almacen', type: 'numeric', precision: 18, scale: 6, default: 0 })
  receivedQuantity: string;

  @Column({ name: 'etapa', type: 'enum', enum: ProductionDetailStage, enumName: 'etapa_detalle_produccion_enum', default: ProductionDetailStage.PENDING })
  stage: ProductionDetailStage;

  @Column({ name: 'fecha_programada', type: 'date' })
  scheduledDate: string;

  @Column({ name: 'secuencia', type: 'integer' })
  sequence: number;

  @Column({ name: 'iniciado_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'concluido_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelado_por', type: 'uuid', nullable: true })
  canceledById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelado_por' })
  canceledBy: User | null;

  @Column({ name: 'cancelado_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 1000, nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'diferencia', type: 'numeric', precision: 18, scale: 6 })
  difference: string;

  @OneToMany(() => ProductionConsolidationSource, (source) => source.consolidatedDetail)
  sources: ProductionConsolidationSource[];

  @OneToMany(() => ProductionProgress, (progress) => progress.consolidatedDetail)
  progress: ProductionProgress[];

  @OneToMany(() => ProductionDelivery, (delivery) => delivery.consolidatedDetail)
  deliveries: ProductionDelivery[];
}
