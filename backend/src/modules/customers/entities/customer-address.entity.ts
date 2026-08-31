import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { DistributionDay } from '../../zones/entities/distribution-day.entity';
import { Zone } from '../../zones/entities/zone.entity';
import { Customer } from './customer.entity';

@Entity({ name: 'domicilios_cliente' })
export class CustomerAddress extends AuditableEntity {
  @Column({ name: 'cliente_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, (customer) => customer.addresses, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  customer: Customer;

  @Column({ name: 'zona_id', type: 'uuid', nullable: true })
  zoneId: string | null;

  @ManyToOne(() => Zone, { nullable: true, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'zona_id' })
  zone: Zone | null;

  @Column({ name: 'dia_distribucion_id', type: 'uuid', nullable: true })
  distributionDayId: string | null;

  @ManyToOne(() => DistributionDay, { nullable: true, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'dia_distribucion_id' })
  distributionDay: DistributionDay | null;

  @Column({ name: 'etiqueta', type: 'varchar', length: 80, default: 'Principal' })
  label: string;

  @Column({ name: 'direccion', type: 'varchar', length: 255 })
  address: string;

  @Column({ name: 'referencia', type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ name: 'latitud', type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude: string | null;

  @Column({ name: 'longitud', type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude: string | null;

  @Column({ name: 'es_principal', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;
}

