import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Payment } from './payment.entity';
import { Sale } from './sale.entity';

@Entity({ name: 'pagos_aplicaciones' })
export class PaymentApplication extends AuditableEntity {
  @Column({ name: 'pago_id', type: 'uuid' }) paymentId: string;
  @ManyToOne(() => Payment, (payment) => payment.applications, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'pago_id' }) payment: Payment;
  @Column({ name: 'venta_id', type: 'uuid' }) saleId: string;
  @ManyToOne(() => Sale, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'venta_id' }) sale: Sale;
  @Column({ name: 'importe_aplicado', type: 'numeric', precision: 14, scale: 2 }) appliedAmount: string;
}
