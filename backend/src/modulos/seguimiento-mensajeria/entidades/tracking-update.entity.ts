import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from '../../pedidos/entidades/order.entity';
import { PublicTrackingStatus } from './tracking.enums';
import { TrackingLink } from './tracking-link.entity';

@Entity({ name: 'actualizaciones_seguimiento' })
export class TrackingUpdate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'enlace_id', type: 'uuid', nullable: true }) linkId: string | null;
  @ManyToOne(() => TrackingLink, (link) => link.updates, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'enlace_id' }) link: TrackingLink;
  @Column({ name: 'pedido_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pedido_id' }) order: Order;
  @Column({ name: 'estado_visible', type: 'varchar', length: 40 }) visibleStatus: PublicTrackingStatus;
  @Column({ name: 'evento_origen', type: 'varchar', length: 180, unique: true }) sourceEvent: string;
  @Column({ name: 'paradas_previas_pendientes', type: 'integer', default: 0 }) pendingPriorStops: number;
  @Column({ name: 'estimado_desde', type: 'timestamptz', nullable: true }) estimatedFrom: Date | null;
  @Column({ name: 'estimado_hasta', type: 'timestamptz', nullable: true }) estimatedUntil: Date | null;
  @Column({ name: 'notificacion_procesada', type: 'boolean', default: true }) notificationHandled: boolean;
  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' }) occurredAt: Date;
}

