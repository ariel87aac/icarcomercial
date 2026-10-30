import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { Payment } from './payment.entity';
import { Sale } from './sale.entity';

@Entity({ name: 'pagos_aplicaciones' })
export class PaymentApplication extends AuditableEntity {
  @Column({ name: 'pago_codigo', type: 'integer' }) paymentCode: number;
  @ManyToOne(() => Payment, (payment) => payment.applications, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'pago_codigo', referencedColumnName: 'code' }) payment: Payment;
  @Column({ name: 'venta_codigo', type: 'integer' }) saleCode: number;
  @ManyToOne(() => Sale, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'venta_codigo', referencedColumnName: 'code' }) sale: Sale;
  @Column({ name: 'importe_aplicado', type: 'numeric', precision: 14, scale: 2 }) appliedAmount: string;
}
