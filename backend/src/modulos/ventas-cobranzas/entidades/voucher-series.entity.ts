import { Column, Entity } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';

@Entity({ name: 'series_comprobante' })
export class VoucherSeries extends AuditableEntity {
  @Column({ name: 'tipo', type: 'varchar', length: 60 }) type: string;
  @Column({ name: 'serie', type: 'varchar', length: 20 }) series: string;
  @Column({ name: 'siguiente_numero', type: 'bigint', default: 1 }) nextNumber: string;
  @Column({ name: 'estado', type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE }) status: RecordStatus;
}
