import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { User } from '../../users/entities/user.entity';
import { ProductionConsolidationDetail } from './production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './production-consolidation-history.entity';
import { ProductionConsolidationStatus, ProductionConsolidationType } from './production.enums';

@Entity({ name: 'consolidaciones_produccion' })
export class ProductionConsolidation extends AuditableEntity {
  @Column({ name: 'codigo', type: 'integer', unique: true, generated: 'increment' })
  code: number;

  @Column({ name: 'fecha_entrega', type: 'date' })
  deliveryDate: string;

  @Column({ name: 'fecha_limite_preparacion', type: 'timestamptz', nullable: true })
  preparationDeadlineAt: Date | null;

  @Column({ name: 'version', type: 'integer' })
  version: number;

  @Column({ name: 'tipo', type: 'enum', enum: ProductionConsolidationType, enumName: 'tipo_consolidacion_produccion_enum' })
  type: ProductionConsolidationType;

  @Column({ name: 'estado', type: 'enum', enum: ProductionConsolidationStatus, enumName: 'estado_consolidacion_produccion_enum', default: ProductionConsolidationStatus.DRAFT })
  status: ProductionConsolidationStatus;

  @Column({ name: 'generado_por', type: 'uuid' })
  generatedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'generado_por' })
  generatedBy: User;

  @Column({ name: 'emitido_por', type: 'uuid', nullable: true })
  emittedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'emitido_por' })
  emittedBy: User | null;

  @Column({ name: 'emitido_at', type: 'timestamptz', nullable: true })
  emittedAt: Date | null;

  @Column({ name: 'cerrado_por', type: 'uuid', nullable: true })
  closedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cerrado_por' })
  closedBy: User | null;

  @Column({ name: 'cerrado_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'observacion_cierre_incompleto', type: 'varchar', length: 1000, nullable: true })
  incompleteCloseObservation: string | null;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 1000, nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'cancelado_por', type: 'uuid', nullable: true })
  canceledById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelado_por' })
  canceledBy: User | null;

  @Column({ name: 'cancelado_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @OneToMany(() => ProductionConsolidationDetail, (detail) => detail.consolidation)
  details: ProductionConsolidationDetail[];

  @OneToMany(() => ProductionConsolidationHistory, (history) => history.consolidation)
  history: ProductionConsolidationHistory[];
}
