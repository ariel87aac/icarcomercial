import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'eventos_auditoria' })
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  user: User | null;

  @Column({ name: 'modulo', type: 'varchar', length: 80 })
  module: string;

  @Column({ name: 'accion', type: 'varchar', length: 120 })
  action: string;

  @Column({ name: 'entidad', type: 'varchar', length: 100 })
  entity: string;

  @Column({ name: 'entidad_id', type: 'varchar', length: 100, nullable: true })
  entityId: string | null;

  @Column({ name: 'resultado', type: 'varchar', length: 30 })
  result: string;

  @Column({ name: 'ip_origen', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'metadatos', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}

