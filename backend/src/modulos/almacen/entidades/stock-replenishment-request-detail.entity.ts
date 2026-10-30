import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { ProductCategory } from '../../productos/catalogo/entidades/product-category.entity';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';
import { ProductionArea } from '../../produccion/entidades/production-area.entity';
import { StockReplenishmentRequest } from './stock-replenishment-request.entity';

@Entity({ name: 'solicitudes_abastecimiento_detalle' })
export class StockReplenishmentRequestDetail extends AuditableEntity {
  @Column({ name: 'solicitud_id', type: 'uuid' })
  requestId: string;

  @ManyToOne(() => StockReplenishmentRequest, (request) => request.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitud_id' })
  request: StockReplenishmentRequest;

  @Column({ name: 'presentacion_id', type: 'uuid' })
  presentationId: string;

  @ManyToOne(() => ProductPresentation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation;

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => ProductCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  category: ProductCategory;

  @Column({ name: 'area_produccion_id', type: 'uuid', nullable: true })
  productionAreaId: string | null;

  @ManyToOne(() => ProductionArea, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'area_produccion_id' })
  productionArea: ProductionArea | null;

  @Column({ name: 'cantidad_fisica_copia', type: 'numeric', precision: 18, scale: 6, default: 0 })
  physicalQuantitySnapshot: string;

  @Column({ name: 'cantidad_reservada_copia', type: 'numeric', precision: 18, scale: 6, default: 0 })
  reservedQuantitySnapshot: string;

  @Column({ name: 'cantidad_demanda_copia', type: 'numeric', precision: 18, scale: 6, default: 0 })
  demandQuantitySnapshot: string;

  @Column({ name: 'cantidad_faltante_copia', type: 'numeric', precision: 18, scale: 6, default: 0 })
  shortageQuantitySnapshot: string;

  @Column({ name: 'cantidad_adicional_stock', type: 'numeric', precision: 18, scale: 6 })
  additionalStockQuantity: string;

  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true })
  observation: string | null;
}
