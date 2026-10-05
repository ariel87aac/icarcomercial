import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProductionConsolidation } from './production-consolidation.entity';
import { ProductionConsolidationStatus, ProductionHistoryEvent } from './production.enums';

@Entity({ name: 'consolidaciones_historial' })
export class ProductionConsolidationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'consolidacion_id', type: 'uuid' })
  consolidationId: string;

  @ManyToOne(() => ProductionConsolidation, (consolidation) => consolidation.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consolidacion_id' })
  consolidation: ProductionConsolidation;

  @Column({ name: 'estado_anterior', type: 'enum', enum: ProductionConsolidationStatus, enumName: 'estado_consolidacion_produccion_enum', nullable: true })
  previousStatus: ProductionConsolidationStatus | null;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: ProductionConsolidationStatus, enumName: 'estado_consolidacion_produccion_enum' })
  newStatus: ProductionConsolidationStatus;

  @Column({ name: 'evento', type: 'enum', enum: ProductionHistoryEvent, enumName: 'evento_historial_produccion_enum' })
  event: ProductionHistoryEvent;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'observacion', type: 'varchar', length: 1000, nullable: true })
  observation: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
