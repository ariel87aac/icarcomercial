import { Column, Entity, JoinColumn, ManyToOne, OneToMany, VersionColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Vehicle } from '../../fleet/entities/vehicle.entity';
import { User } from '../../users/entities/user.entity';
import { Zone } from '../../zones/entities/zone.entity';
import { DistributionRouteStatus } from './distribution.enums';
import { RouteDelivery } from './route-delivery.entity';
import { RouteHistory } from './route-history.entity';
import { RouteResponsible } from './route-responsible.entity';

@Entity({ name: 'rutas_distribucion' })
export class DistributionRoute extends AuditableEntity {
  @Column({ name: 'codigo', type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ name: 'fecha', type: 'date' })
  date: string;

  @Column({ name: 'zona_id', type: 'uuid' })
  zoneId: string;

  @ManyToOne(() => Zone, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'zona_id' })
  zone: Zone;

  @Column({ name: 'vehiculo_id', type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Vehicle;

  @Column({ name: 'estado', type: 'enum', enum: DistributionRouteStatus, enumName: 'estado_ruta_enum', default: DistributionRouteStatus.DRAFT })
  status: DistributionRouteStatus;

  @Column({ name: 'creado_por', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por' })
  createdBy: User;

  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true })
  observation: string | null;

  @Column({ name: 'salida_por', type: 'uuid', nullable: true })
  departedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'salida_por' })
  departedBy: User | null;

  @Column({ name: 'salida_at', type: 'timestamptz', nullable: true })
  departedAt: Date | null;

  @Column({ name: 'finalizado_por', type: 'uuid', nullable: true })
  finishedById: string | null;

  @Column({ name: 'finalizado_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'liquidado_por', type: 'uuid', nullable: true })
  settledById: string | null;

  @Column({ name: 'liquidado_at', type: 'timestamptz', nullable: true })
  settledAt: Date | null;

  @VersionColumn({ name: 'version' })
  version: number;

  @OneToMany(() => RouteResponsible, (responsible) => responsible.route)
  responsibles: RouteResponsible[];

  @OneToMany(() => RouteDelivery, (delivery) => delivery.route)
  deliveries: RouteDelivery[];

  @OneToMany(() => RouteHistory, (history) => history.route)
  history: RouteHistory[];
}
