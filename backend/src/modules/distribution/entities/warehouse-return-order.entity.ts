import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DistributionRoute } from './distribution-route.entity';
import { WarehouseReturnStatus } from './distribution.enums';
import { WarehouseReturnOrderDetail } from './warehouse-return-order-detail.entity';

@Entity({ name: 'ordenes_retorno_almacen' })
export class WarehouseReturnOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo', type: 'integer', unique: true, generated: 'increment' })
  code: number;

  @Column({ name: 'ruta_id', type: 'uuid', unique: true })
  routeId: string;

  @OneToOne(() => DistributionRoute, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ruta_id' })
  route: DistributionRoute;

  @Column({ name: 'estado', type: 'enum', enum: WarehouseReturnStatus, enumName: 'estado_orden_retorno_almacen_enum', default: WarehouseReturnStatus.PENDING })
  status: WarehouseReturnStatus;

  @Column({ name: 'cantidad_esperada', type: 'numeric', precision: 14, scale: 3 })
  expectedQuantity: string;

  @Column({ name: 'cantidad_recibida', type: 'numeric', precision: 14, scale: 3, default: 0 })
  receivedQuantity: string;

  @Column({ name: 'creado_por', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por' })
  createdBy: User;

  @Column({ name: 'creado_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'recibido_por', type: 'uuid', nullable: true })
  receivedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recibido_por' })
  receivedBy: User | null;

  @Column({ name: 'recibido_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'observacion', type: 'varchar', length: 1000, nullable: true })
  observation: string | null;

  @OneToMany(() => WarehouseReturnOrderDetail, (detail) => detail.returnOrder)
  details: WarehouseReturnOrderDetail[];
}
