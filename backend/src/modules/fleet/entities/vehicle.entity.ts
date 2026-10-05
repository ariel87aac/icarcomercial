import { BeforeInsert, BeforeUpdate, Column, Entity } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';

@Entity({ name: 'vehiculos' })
export class Vehicle extends AuditableEntity {
  @Column({ name: 'placa', type: 'varchar', length: 20 })
  plate: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 160 })
  description: string;

  @Column({ name: 'capacidad_referencial', type: 'numeric', precision: 14, scale: 3, nullable: true })
  referenceCapacity: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @BeforeInsert()
  @BeforeUpdate()
  normalize(): void {
    this.plate = this.plate.trim().toUpperCase();
    this.description = this.description.trim();
  }
}
