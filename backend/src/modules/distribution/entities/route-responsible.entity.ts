import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DistributionRoute } from './distribution-route.entity';
import { RouteResponsibleFunction } from './distribution.enums';

@Entity({ name: 'rutas_responsables' })
export class RouteResponsible {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ruta_id', type: 'uuid' })
  routeId: string;

  @ManyToOne(() => DistributionRoute, (route) => route.responsibles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ruta_id' })
  route: DistributionRoute;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'funcion', type: 'enum', enum: RouteResponsibleFunction, enumName: 'funcion_responsable_ruta_enum' })
  function: RouteResponsibleFunction;

  @Column({ name: 'es_principal', type: 'boolean', default: false })
  isPrincipal: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
