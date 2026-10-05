import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DistributionRoute } from './distribution-route.entity';

@Entity({ name: 'liquidaciones_ruta' })
export class RouteSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ruta_id', type: 'uuid', unique: true })
  routeId: string;

  @OneToOne(() => DistributionRoute, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ruta_id' })
  route: DistributionRoute;

  @Column({ name: 'entregas_completas', type: 'integer' })
  completeDeliveries: number;

  @Column({ name: 'entregas_parciales', type: 'integer' })
  partialDeliveries: number;

  @Column({ name: 'no_entregadas', type: 'integer' })
  notDelivered: number;

  @Column({ name: 'cantidad_devuelta_aceptada', type: 'numeric', precision: 14, scale: 3 })
  acceptedReturnQuantity: string;

  @Column({ name: 'responsable_id', type: 'uuid' })
  responsibleId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsable_id' })
  responsible: User;

  @Column({ name: 'observacion', type: 'varchar', length: 1000, nullable: true })
  observation: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
