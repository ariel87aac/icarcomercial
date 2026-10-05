import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OrderDetail } from '../../orders/entities/order-detail.entity';
import { User } from '../../users/entities/user.entity';
import { InventoryReservationStatus } from './inventory.enums';
import { Stock } from './stock.entity';

@Entity({ name: 'reservas_inventario' })
export class InventoryReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'detalle_pedido_id', type: 'uuid', unique: true })
  orderDetailId: string;

  @ManyToOne(() => OrderDetail, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'detalle_pedido_id' })
  orderDetail: OrderDetail;

  @Column({ name: 'existencia_id', type: 'uuid' })
  stockId: string;

  @ManyToOne(() => Stock, (stock) => stock.reservations, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'existencia_id' })
  stock: Stock;

  @Column({ name: 'cantidad', type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'estado', type: 'enum', enum: InventoryReservationStatus, default: InventoryReservationStatus.ACTIVE })
  status: InventoryReservationStatus;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  createdAt: Date;
}
