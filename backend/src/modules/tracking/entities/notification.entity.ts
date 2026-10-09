import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Order } from '../../orders/entities/order.entity';
import { NotificationEvent, NotificationStatus } from './tracking.enums';
import { TrackingLink } from './tracking-link.entity';
import { NotificationTemplate } from './notification-template.entity';
import { NotificationAttempt } from './notification-attempt.entity';

@Entity({ name: 'notificaciones' })
export class Notification extends AuditableEntity {
  @Column({ name: 'pedido_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pedido_id' }) order: Order;
  @Column({ name: 'cliente_id', type: 'uuid' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'cliente_id' }) customer: Customer;
  @Column({ name: 'enlace_id', type: 'uuid', nullable: true }) linkId: string | null;
  @ManyToOne(() => TrackingLink, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'enlace_id' }) link: TrackingLink | null;
  @Column({ name: 'plantilla_id', type: 'uuid' }) templateId: string;
  @ManyToOne(() => NotificationTemplate, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plantilla_id' }) template: NotificationTemplate;
  @Column({ name: 'reenvio_de_id', type: 'uuid', nullable: true }) resentFromId: string | null;
  @ManyToOne(() => Notification, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'reenvio_de_id' }) resentFrom: Notification | null;
  @Column({ name: 'destinatario', type: 'varchar', length: 20 }) recipient: string;
  @Column({ name: 'evento', type: 'enum', enum: NotificationEvent, enumName: 'evento_notificacion_enum' }) event: NotificationEvent;
  @Column({ name: 'cuerpo_renderizado', type: 'text' }) renderedBody: string;
  @Column({ name: 'clave_idempotencia', type: 'varchar', length: 200, unique: true }) idempotencyKey: string;
  @Column({ name: 'version_evento', type: 'integer', default: 1 }) eventVersion: number;
  @Column({ name: 'estado', type: 'enum', enum: NotificationStatus, enumName: 'estado_notificacion_enum', default: NotificationStatus.PENDING }) status: NotificationStatus;
  @Column({ name: 'programada_at', type: 'timestamptz' }) scheduledAt: Date;
  @Column({ name: 'proximo_intento_at', type: 'timestamptz' }) nextAttemptAt: Date;
  @Column({ name: 'procesada_at', type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @Column({ name: 'proveedor_mensaje_id', type: 'varchar', length: 160, nullable: true }) providerMessageId: string | null;
  @Column({ name: 'ultimo_error', type: 'varchar', length: 500, nullable: true }) lastError: string | null;
  @OneToMany(() => NotificationAttempt, (attempt) => attempt.notification) attempts: NotificationAttempt[];
}
