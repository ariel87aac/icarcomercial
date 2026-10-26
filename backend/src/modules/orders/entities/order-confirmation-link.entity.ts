import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from './order.entity';
import { OrderConfirmationLinkStatus } from './order.enums';

@Entity({ name: 'enlaces_confirmacion_pedido' })
export class OrderConfirmationLink extends AuditableEntity {
  @Column({ name: 'pedido_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  order: Order;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: OrderConfirmationLinkStatus,
    enumName: 'estado_enlace_confirmacion_pedido_enum',
    default: OrderConfirmationLinkStatus.ACTIVE,
  })
  status: OrderConfirmationLinkStatus;

  @Column({ name: 'expira_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'creado_por', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por' })
  createdBy: User;

  @Column({ name: 'usado_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'revocado_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
