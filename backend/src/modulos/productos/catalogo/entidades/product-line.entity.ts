import { Column, Entity } from 'typeorm';
import { AuditableEntity } from '../../../../compartido/entidades/auditable.entity';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

@Entity({ name: 'lineas_productivas' })
export class ProductLine extends AuditableEntity {
  @Column({ name: 'codigo', type: 'integer', unique: true, generated: 'increment' })
  code: number;

  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;
}
