import { Column, Entity, JoinColumn, ManyToOne, OneToMany, VersionColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { OrderPreparationDetail } from './order-preparation-detail.entity';
import { PreparationHistory } from './preparation-history.entity';
import { PreparationStatus } from './preparation.enums';

@Entity({ name: 'preparaciones_pedido' })
export class OrderPreparation extends AuditableEntity {
  @Column({ name: 'pedido_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  order: Order;

  @Column({ name: 'responsable_id', type: 'uuid' })
  responsibleId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsable_id' })
  responsible: User;

  @Column({ name: 'estado', type: 'enum', enum: PreparationStatus, enumName: 'estado_preparacion_enum', default: PreparationStatus.PENDING })
  status: PreparationStatus;

  @VersionColumn({ name: 'version' })
  version: number;

  @Column({ name: 'referencias_produccion', type: 'jsonb', default: () => "'[]'::jsonb" })
  productionReferences: string[];

  @Column({ name: 'iniciado_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'confirmado_por', type: 'uuid', nullable: true })
  confirmedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'confirmado_por' })
  confirmedBy: User | null;

  @Column({ name: 'confirmado_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'cancelado_por', type: 'uuid', nullable: true })
  canceledById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelado_por' })
  canceledBy: User | null;

  @Column({ name: 'cancelado_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 1000, nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'entregado_distribucion_por', type: 'uuid', nullable: true })
  handedOffById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'entregado_distribucion_por' })
  handedOffBy: User | null;

  @Column({ name: 'entregado_distribucion_at', type: 'timestamptz', nullable: true })
  handedOffAt: Date | null;

  @OneToMany(() => OrderPreparationDetail, (detail) => detail.preparation)
  details: OrderPreparationDetail[];

  @OneToMany(() => PreparationHistory, (history) => history.preparation)
  history: PreparationHistory[];

  shortageItemCount: number;
}
