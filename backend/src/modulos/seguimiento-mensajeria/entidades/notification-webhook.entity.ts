import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'notificaciones_webhooks' })
export class NotificationWebhook {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'evento_externo_id', type: 'varchar', length: 180, unique: true }) externalEventId: string;
  @Column({ name: 'proveedor_mensaje_id', type: 'varchar', length: 160, nullable: true }) providerMessageId: string | null;
  @Column({ name: 'hash_contenido', type: 'varchar', length: 64, unique: true }) contentHash: string;
  @Column({ name: 'estado_recibido', type: 'varchar', length: 40 }) receivedStatus: string;
  @Column({ name: 'contenido_sanitizado', type: 'jsonb', default: () => "'{}'::jsonb" }) sanitizedContent: Record<string, unknown>;
  @Column({ name: 'fecha_evento', type: 'timestamptz', nullable: true }) eventAt: Date | null;
  @Column({ name: 'procesado_at', type: 'timestamptz' }) processedAt: Date;
}
