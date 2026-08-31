import { Column, Entity, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { DistributionDay } from './distribution-day.entity';

@Entity({ name: 'zonas' })
export class Zone extends AuditableEntity {
  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany(() => DistributionDay, (day) => day.zone, { eager: true })
  distributionDays: DistributionDay[];
}

