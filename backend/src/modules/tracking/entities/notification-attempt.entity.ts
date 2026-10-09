import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationAttemptStatus } from './tracking.enums';

@Entity({ name: 'notificaciones_intentos' })
export class NotificationAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'notificacion_id', type: 'uuid' }) notificationId: string;
  @ManyToOne(() => Notification, (notification) => notification.attempts, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'notificacion_id' }) notification: Notification;
  @Column({ name: 'numero_intento', type: 'integer' }) attemptNumber: number;
  @Column({ name: 'estado', type: 'enum', enum: NotificationAttemptStatus, enumName: 'estado_intento_notificacion_enum' }) status: NotificationAttemptStatus;
  @Column({ name: 'codigo_http', type: 'integer', nullable: true }) httpStatus: number | null;
  @Column({ name: 'respuesta_sanitizada', type: 'jsonb', default: () => "'{}'::jsonb" }) sanitizedResponse: Record<string, unknown>;
  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' }) occurredAt: Date;
}

