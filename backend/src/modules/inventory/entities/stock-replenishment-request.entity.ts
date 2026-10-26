import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { ProductionConsolidation } from '../../production/entities/production-consolidation.entity';
import { User } from '../../users/entities/user.entity';
import { StockReplenishmentRequestStatus } from './inventory.enums';
import { StockReplenishmentRequestDetail } from './stock-replenishment-request-detail.entity';

@Entity({ name: 'solicitudes_abastecimiento' })
export class StockReplenishmentRequest extends AuditableEntity {
  @Column({ name: 'codigo', type: 'integer', unique: true })
  code: number;

  @Column({ name: 'fecha_requerida', type: 'date' })
  requiredDate: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: StockReplenishmentRequestStatus,
    enumName: 'estado_solicitud_abastecimiento_enum',
    default: StockReplenishmentRequestStatus.DRAFT,
  })
  status: StockReplenishmentRequestStatus;

  @Column({ name: 'solicitado_por', type: 'uuid' })
  requestedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'solicitado_por' })
  requestedBy: User;

  @Column({ name: 'enviado_por', type: 'uuid', nullable: true })
  sentById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'enviado_por' })
  sentBy: User | null;

  @Column({ name: 'enviado_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'consolidacion_produccion_id', type: 'uuid', nullable: true })
  productionConsolidationId: string | null;

  @OneToOne(() => ProductionConsolidation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'consolidacion_produccion_id' })
  productionConsolidation: ProductionConsolidation | null;

  @Column({ name: 'programado_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'cerrado_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'observacion_cierre', type: 'varchar', length: 1000, nullable: true })
  closeObservation: string | null;

  @Column({ name: 'cerrado_por', type: 'uuid', nullable: true })
  closedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cerrado_por' })
  closedBy: User | null;

  @OneToMany(() => StockReplenishmentRequestDetail, (detail) => detail.request)
  details: StockReplenishmentRequestDetail[];
}
