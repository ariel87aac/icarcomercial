import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'configuracion_programacion_pedidos' })
export class OrderSchedulingSetting {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  @Column({ name: 'hora_cierre_pedidos', type: 'time', default: '13:00' })
  orderCutoffTime: string;

  @Column({ name: 'dias_anticipacion_cierre', type: 'smallint', default: 1 })
  orderCutoffLeadDays: number;

  @Column({ name: 'hora_limite_consolidado', type: 'time', default: '18:00' })
  consolidationDeadlineTime: string;

  @Column({ name: 'dias_anticipacion_preparacion', type: 'smallint', default: 1 })
  preparationLeadDays: number;

  @Column({ name: 'actualizado_por', type: 'uuid', nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actualizado_por' })
  updatedBy: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
