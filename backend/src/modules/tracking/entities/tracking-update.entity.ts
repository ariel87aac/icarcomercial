import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { PublicTrackingStatus } from './tracking.enums';
import { TrackingLink } from './tracking-link.entity';

@Entity({ name: 'actualizaciones_seguimiento' })
export class TrackingUpdate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'enlace_id', type: 'uuid' }) linkId: string;
  @ManyToOne(() => TrackingLink, (link) => link.updates, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'enlace_id' }) link: TrackingLink;
  @Column({ name: 'pedido_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pedido_id' }) order: Order;
  @Column({ name: 'estado_visible', type: 'enum', enum: PublicTrackingStatus, enumName: 'estado_publico_seguimiento_enum' }) visibleStatus: PublicTrackingStatus;
  @Column({ name: 'evento_origen', type: 'varchar', length: 180, unique: true }) sourceEvent: string;
  @Column({ name: 'paradas_previas_pendientes', type: 'integer', default: 0 }) pendingPriorStops: number;
  @Column({ name: 'estimado_desde', type: 'timestamptz', nullable: true }) estimatedFrom: Date | null;
  @Column({ name: 'estimado_hasta', type: 'timestamptz', nullable: true }) estimatedUntil: Date | null;
  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' }) occurredAt: Date;
}

