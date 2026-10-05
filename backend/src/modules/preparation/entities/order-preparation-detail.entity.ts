import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { InventoryReservation } from '../../inventory/entities/inventory-reservation.entity';
import { Stock } from '../../inventory/entities/stock.entity';
import { OrderDetail } from '../../orders/entities/order-detail.entity';
import { User } from '../../users/entities/user.entity';
import { OrderPreparation } from './order-preparation.entity';

@Entity({ name: 'preparaciones_detalle' })
export class OrderPreparationDetail extends AuditableEntity {
  @Column({ name: 'preparacion_id', type: 'uuid' })
  preparationId: string;

  @ManyToOne(() => OrderPreparation, (preparation) => preparation.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'preparacion_id' })
  preparation: OrderPreparation;

  @Column({ name: 'detalle_pedido_id', type: 'uuid' })
  orderDetailId: string;

  @ManyToOne(() => OrderDetail, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'detalle_pedido_id' })
  orderDetail: OrderDetail;

  @Column({ name: 'reserva_id', type: 'uuid', nullable: true })
  reservationId: string | null;

  @ManyToOne(() => InventoryReservation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reserva_id' })
  reservation: InventoryReservation | null;

  @Column({ name: 'existencia_id', type: 'uuid' })
  stockId: string;

  @ManyToOne(() => Stock, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'existencia_id' })
  stock: Stock;

  @Column({ name: 'cantidad_solicitada', type: 'numeric', precision: 14, scale: 3 })
  requestedQuantity: string;

  @Column({ name: 'cantidad_reservada', type: 'numeric', precision: 14, scale: 3 })
  reservedQuantity: string;

  @Column({ name: 'disponible_copia', type: 'numeric', precision: 14, scale: 3 })
  availableSnapshot: string;

  @Column({ name: 'cantidad_preparada', type: 'numeric', precision: 14, scale: 3, default: 0 })
  preparedQuantity: string;

  @Column({ name: 'diferencia', type: 'numeric', precision: 14, scale: 3 })
  difference: string;

  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true })
  observation: string | null;

  @Column({ name: 'verificado_por', type: 'uuid', nullable: true })
  verifiedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'verificado_por' })
  verifiedBy: User | null;

  @Column({ name: 'verificado_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;
}
