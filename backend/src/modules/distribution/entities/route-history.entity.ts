import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DistributionRoute } from './distribution-route.entity';
import { DistributionRouteStatus, RouteHistoryEvent } from './distribution.enums';

@Entity({ name: 'rutas_historial' })
export class RouteHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ruta_id', type: 'uuid' })
  routeId: string;

  @ManyToOne(() => DistributionRoute, (route) => route.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ruta_id' })
  route: DistributionRoute;

  @Column({ name: 'estado_anterior', type: 'enum', enum: DistributionRouteStatus, enumName: 'estado_ruta_enum', nullable: true })
  previousStatus: DistributionRouteStatus | null;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: DistributionRouteStatus, enumName: 'estado_ruta_enum' })
  newStatus: DistributionRouteStatus;

  @Column({ name: 'evento', type: 'enum', enum: RouteHistoryEvent, enumName: 'evento_ruta_enum' })
  event: RouteHistoryEvent;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'observacion', type: 'varchar', length: 1000, nullable: true })
  observation: string | null;

  @Column({ name: 'metadatos', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
