import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { Zone } from './zone.entity';

@Entity({ name: 'dias_distribucion' })
export class DistributionDay extends AuditableEntity {
  @Column({ name: 'zona_id', type: 'uuid' })
  zoneId: string;

  @ManyToOne(() => Zone, (zone) => zone.distributionDays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zona_id' })
  zone: Zone;

  @Column({ name: 'dia_semana', type: 'smallint' })
  weekday: number;

  @Column({ name: 'hora_inicio', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'hora_fin', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;
}

