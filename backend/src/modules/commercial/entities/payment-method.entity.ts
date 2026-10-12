import { Column, Entity } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';

@Entity({ name: 'medios_pago' })
export class PaymentMethod extends AuditableEntity {
  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true }) name: string;
  @Column({ name: 'requiere_referencia', type: 'boolean', default: false }) requiresReference: boolean;
  @Column({ name: 'estado', type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE }) status: RecordStatus;
}
