import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { User } from '../../seguridad/usuarios/entidades/user.entity';
import { Zone } from '../../zonas-reparto/entidades/zone.entity';
import { Vehicle } from '../flota/entidades/vehicle.entity';
import { DistributionRoute } from './distribution-route.entity';
import { VehicleDispatchStatus } from './distribution.enums';

@Entity({ name: 'despachos_vehiculos' })
export class VehicleDispatch extends AuditableEntity {
  @Column({ name: 'codigo', type: 'integer', unique: true, generated: 'increment' })
  code: number;

  @Column({ name: 'vehiculo_id', type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculo_id' })
  vehicle: Vehicle;

  @Column({ name: 'responsable_id', type: 'uuid' })
  responsibleId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsable_id' })
  responsible: User;

  @ManyToMany(() => Zone)
  @JoinTable({
    name: 'despachos_vehiculos_zonas',
    joinColumn: { name: 'despacho_vehiculo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'zona_id', referencedColumnName: 'id' },
  })
  zones: Zone[];

  @Column({ name: 'estado', type: 'enum', enum: VehicleDispatchStatus, enumName: 'estado_despacho_vehiculo_enum', default: VehicleDispatchStatus.PENDING })
  status: VehicleDispatchStatus;

  @Column({ name: 'creado_por', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creado_por' })
  createdBy: User;

  @Column({ name: 'entregado_por', type: 'uuid', nullable: true })
  handedOverById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'entregado_por' })
  handedOverBy: User | null;

  @Column({ name: 'entregado_at', type: 'timestamptz', nullable: true })
  handedOverAt: Date | null;

  @Column({ name: 'kilometraje_inicial', type: 'numeric', precision: 14, scale: 1, nullable: true })
  initialOdometer: string | null;

  @Column({ name: 'observacion_entrega', type: 'varchar', length: 1000, nullable: true })
  handoverObservation: string | null;

  @Column({ name: 'devolucion_registrada_por', type: 'uuid', nullable: true })
  returnRegisteredById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'devolucion_registrada_por' })
  returnRegisteredBy: User | null;

  @Column({ name: 'devuelto_at', type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @Column({ name: 'kilometraje_final', type: 'numeric', precision: 14, scale: 1, nullable: true })
  finalOdometer: string | null;

  @Column({ name: 'observacion_devolucion', type: 'varchar', length: 1000, nullable: true })
  returnObservation: string | null;

  @OneToMany(() => DistributionRoute, (route) => route.vehicleDispatch)
  routes: DistributionRoute[];

  routeCount?: number;

  assignedOrderCount?: number;

  deliveredOrderCount?: number;

  pendingOrderCount?: number;

  pendingReturnCount?: number;

  openRouteCount?: number;

  canClose?: boolean;

  closeBlockReason?: string | null;
}
