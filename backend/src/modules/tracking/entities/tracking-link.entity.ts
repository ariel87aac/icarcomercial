import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { TrackingLinkStatus } from './tracking.enums';
import { TrackingUpdate } from './tracking-update.entity';

@Entity({ name: 'enlaces_seguimiento' })
export class TrackingLink extends AuditableEntity {
  @Column({ name: 'pedido_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pedido_id' }) order: Order;
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true }) tokenHash: string;
  @Column({ name: 'estado', type: 'enum', enum: TrackingLinkStatus, enumName: 'estado_enlace_seguimiento_enum', default: TrackingLinkStatus.ACTIVE }) status: TrackingLinkStatus;
  @Column({ name: 'expira_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'creado_por', type: 'uuid' }) createdById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'creado_por' }) createdBy: User;
  @Column({ name: 'revocado_por', type: 'uuid', nullable: true }) revokedById: string | null;
  @Column({ name: 'revocado_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @OneToMany(() => TrackingUpdate, (update) => update.link) updates: TrackingUpdate[];
}

