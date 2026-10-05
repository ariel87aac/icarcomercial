import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrderPreparation } from './order-preparation.entity';
import { PreparationEvent, PreparationStatus } from './preparation.enums';

@Entity({ name: 'preparaciones_historial' })
export class PreparationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'preparacion_id', type: 'uuid' })
  preparationId: string;

  @ManyToOne(() => OrderPreparation, (preparation) => preparation.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'preparacion_id' })
  preparation: OrderPreparation;

  @Column({ name: 'estado_anterior', type: 'enum', enum: PreparationStatus, enumName: 'estado_preparacion_enum', nullable: true })
  previousStatus: PreparationStatus | null;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: PreparationStatus, enumName: 'estado_preparacion_enum' })
  newStatus: PreparationStatus;

  @Column({ name: 'evento', type: 'enum', enum: PreparationEvent, enumName: 'evento_preparacion_enum' })
  event: PreparationEvent;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'observacion', type: 'varchar', length: 1000, nullable: true })
  observation: string | null;

  @Column({ name: 'metadatos', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
