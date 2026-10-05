import { Column, Entity } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';

@Entity({ name: 'lineas_productivas' })
export class ProductLine extends AuditableEntity {
  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;
}
