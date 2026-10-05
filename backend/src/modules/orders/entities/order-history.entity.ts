import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from './order.entity';
import { OrderOrigin, OrderStatus } from './order.enums';

@Entity({ name: 'pedidos_estados_historial' })
export class OrderHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pedido_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  order: Order;

  @Column({ name: 'estado_anterior', type: 'enum', enum: OrderStatus, nullable: true })
  previousStatus: OrderStatus | null;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: OrderStatus })
  newStatus: OrderStatus;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'origen', type: 'enum', enum: OrderOrigin })
  origin: OrderOrigin;

  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true })
  observation: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
