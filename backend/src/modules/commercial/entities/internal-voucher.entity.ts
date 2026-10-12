import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { User } from '../../users/entities/user.entity';
import { VoucherStatus } from './commercial.enums';
import { Sale } from './sale.entity';
import { VoucherSeries } from './voucher-series.entity';

@Entity({ name: 'comprobantes_internos' })
export class InternalVoucher extends AuditableEntity {
  @Column({ name: 'venta_id', type: 'uuid', unique: true }) saleId: string;
  @OneToOne(() => Sale, (sale) => sale.voucher, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'venta_id' }) sale: Sale;
  @Column({ name: 'serie_id', type: 'uuid' }) seriesId: string;
  @ManyToOne(() => VoucherSeries, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'serie_id' }) series: VoucherSeries;
  @Column({ name: 'numero', type: 'bigint' }) number: string;
  @Column({ name: 'emitido_por', type: 'uuid' }) issuedById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'emitido_por' }) issuedBy: User;
  @Column({ name: 'emitido_at', type: 'timestamptz' }) issuedAt: Date;
  @Column({ name: 'estado', type: 'enum', enum: VoucherStatus, enumName: 'estado_comprobante_interno_enum', default: VoucherStatus.ISSUED }) status: VoucherStatus;
}
