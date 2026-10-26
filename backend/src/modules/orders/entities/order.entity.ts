import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { CustomerAddress } from '../../customers/entities/customer-address.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { CustomerType } from '../../customers/entities/customer.enums';
import { User } from '../../users/entities/user.entity';
import { OrderDetail } from './order-detail.entity';
import { OrderHistory } from './order-history.entity';
import { OrderOrigin, OrderStatus } from './order.enums';

@Entity({ name: 'pedidos' })
export class Order extends AuditableEntity {
  @Column({ name: 'codigo', type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ name: 'cliente_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  customer: Customer;

  @Column({ name: 'domicilio_id', type: 'uuid' })
  addressId: string;

  @ManyToOne(() => CustomerAddress, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'domicilio_id' })
  address: CustomerAddress;

  @Column({ name: 'fecha_solicitada', type: 'date' })
  requestedDate: string;

  @Column({ name: 'fecha_cierre_pedido', type: 'timestamptz' })
  orderCutoffAt: Date;

  @Column({ name: 'fecha_preparacion', type: 'timestamptz' })
  preparationAt: Date;

  @Column({ name: 'estado', type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ name: 'origen', type: 'enum', enum: OrderOrigin })
  origin: OrderOrigin;

  @Column({ name: 'observaciones', type: 'varchar', length: 500, nullable: true })
  observations: string | null;

  @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ name: 'creado_por', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por' })
  createdBy: User;

  @Column({ name: 'confirmado_por', type: 'uuid', nullable: true })
  confirmedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'confirmado_por' })
  confirmedBy: User | null;

  @Column({ name: 'recibido_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'confirmado_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'cancelado_por', type: 'uuid', nullable: true })
  canceledById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelado_por' })
  canceledBy: User | null;

  @Column({ name: 'cancelado_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 500, nullable: true })
  cancellationReason: string | null;

  @DeleteDateColumn({ name: 'eliminado_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'eliminado_por', type: 'uuid', nullable: true })
  deletedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'eliminado_por' })
  deletedBy: User | null;

  @Column({ name: 'motivo_eliminacion', type: 'varchar', length: 500, nullable: true })
  deletionReason: string | null;

  @Column({ name: 'cliente_nombre_copia', type: 'varchar', length: 160, nullable: true })
  customerNameSnapshot: string | null;

  @Column({ name: 'cliente_tipo_copia', type: 'enum', enum: CustomerType, nullable: true })
  customerTypeSnapshot: CustomerType | null;

  @Column({ name: 'domicilio_copia', type: 'varchar', length: 255, nullable: true })
  addressSnapshot: string | null;

  @Column({ name: 'zona_copia', type: 'varchar', length: 100, nullable: true })
  zoneSnapshot: string | null;

  @Column({ name: 'dia_distribucion_copia', type: 'smallint', nullable: true })
  distributionWeekdaySnapshot: number | null;

  @OneToMany(() => OrderDetail, (detail) => detail.order)
  details: OrderDetail[];

  @OneToMany(() => OrderHistory, (history) => history.order)
  history: OrderHistory[];
}
