import { BeforeInsert, BeforeUpdate, Column, Entity } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';

@Entity({ name: 'unidades_medida' })
export class UnitMeasure extends AuditableEntity {
  @Column({ name: 'nombre', type: 'varchar', length: 80, unique: true })
  name: string;

  @Column({ name: 'abreviatura', type: 'varchar', length: 20, unique: true })
  abbreviation: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @BeforeInsert()
  @BeforeUpdate()
  normalize(): void {
    if (this.name !== undefined) this.name = this.name.trim();
    if (this.abbreviation !== undefined) this.abbreviation = this.abbreviation.trim();
  }
}
