import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OrderPreparationDetail } from '../../preparation/entities/order-preparation-detail.entity';
import { User } from '../../users/entities/user.entity';
import { VisitResult } from './visit-result.entity';

@Entity({ name: 'resultados_visita_detalle' })
export class VisitResultDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'resultado_visita_id', type: 'uuid' })
  visitResultId: string;

  @ManyToOne(() => VisitResult, (result) => result.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resultado_visita_id' })
  visitResult: VisitResult;

  @Column({ name: 'preparacion_detalle_id', type: 'uuid' })
  preparationDetailId: string;

  @ManyToOne(() => OrderPreparationDetail, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'preparacion_detalle_id' })
  preparationDetail: OrderPreparationDetail;

  @Column({ name: 'cantidad_entregada', type: 'numeric', precision: 14, scale: 3 })
  deliveredQuantity: string;

  @Column({ name: 'cantidad_devuelta', type: 'numeric', precision: 14, scale: 3 })
  returnedQuantity: string;

  @Column({ name: 'cantidad_devuelta_aceptada', type: 'numeric', precision: 14, scale: 3 })
  acceptedReturnQuantity: string;

  @Column({ name: 'devolucion_aceptada_por', type: 'uuid', nullable: true })
  returnAcceptedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'devolucion_aceptada_por' })
  returnAcceptedBy: User | null;

  @Column({ name: 'devolucion_aceptada_at', type: 'timestamptz', nullable: true })
  returnAcceptedAt: Date | null;
}
