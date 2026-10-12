import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CommercialOutboxStatus } from './commercial.enums';

@Entity({ name: 'eventos_comerciales_salida' })
export class CommercialOutbox {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'clave_idempotencia', type: 'varchar', length: 200, unique: true }) idempotencyKey: string;
  @Column({ name: 'tipo_evento', type: 'varchar', length: 80 }) eventType: string;
  @Column({ name: 'pago_id', type: 'uuid' }) paymentId: string;
  @Column({ name: 'version_evento', type: 'integer', default: 1 }) eventVersion: number;
  @Column({ name: 'estado', type: 'enum', enum: CommercialOutboxStatus, enumName: 'estado_evento_comercial_enum', default: CommercialOutboxStatus.PENDING }) status: CommercialOutboxStatus;
  @Column({ name: 'intentos', type: 'integer', default: 0 }) attempts: number;
  @Column({ name: 'ultimo_error', type: 'varchar', length: 500, nullable: true }) lastError: string | null;
  @Column({ name: 'publicado_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
