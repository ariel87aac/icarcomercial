import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../seguridad/usuarios/entidades/user.entity';
import { ProductionConsolidationDetail } from './production-consolidation-detail.entity';
import { ProductionDeliveryStatus } from './production.enums';

@Entity({ name: 'entregas_produccion' })
export class ProductionDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'detalle_consolidado_id', type: 'uuid' })
  consolidatedDetailId: string;

  @ManyToOne(() => ProductionConsolidationDetail, (detail) => detail.deliveries, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'detalle_consolidado_id' })
  consolidatedDetail: ProductionConsolidationDetail;

  @Column({ name: 'cantidad_entregada', type: 'numeric', precision: 18, scale: 6 })
  deliveredQuantity: string;

  @Column({ name: 'entrega_final', type: 'boolean', default: false })
  finalDelivery: boolean;

  @Column({ name: 'incidencia_produccion', type: 'varchar', length: 1000, nullable: true })
  productionIncident: string | null;

  @Column({ name: 'estado', type: 'enum', enum: ProductionDeliveryStatus, enumName: 'estado_entrega_produccion_enum', default: ProductionDeliveryStatus.PENDING })
  status: ProductionDeliveryStatus;

  @Column({ name: 'entregado_por', type: 'uuid' })
  deliveredById: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'entregado_por' })
  deliveredBy: User;

  @CreateDateColumn({ name: 'entregado_at', type: 'timestamptz' })
  deliveredAt: Date;

  @Column({ name: 'cantidad_recibida', type: 'numeric', precision: 18, scale: 6, nullable: true })
  receivedQuantity: string | null;

  @Column({ name: 'recibido_por', type: 'uuid', nullable: true })
  receivedById: string | null;

  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recibido_por' })
  receivedBy: User | null;

  @Column({ name: 'recibido_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'observacion_almacen', type: 'varchar', length: 1000, nullable: true })
  warehouseObservation: string | null;
}
