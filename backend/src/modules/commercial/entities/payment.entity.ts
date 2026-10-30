import { Column, Entity, JoinColumn, ManyToOne, OneToMany, VersionColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentStatus } from './commercial.enums';
import { PaymentApplication } from './payment-application.entity';
import { PaymentHistory } from './payment-history.entity';
import { PaymentMethod } from './payment-method.entity';

@Entity({ name: 'pagos' })
export class Payment extends AuditableEntity {
  @Column({ name: 'codigo', type: 'integer', unique: true, generated: 'increment' }) code: number;
  @Column({ name: 'cliente_id', type: 'uuid' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'cliente_id' }) customer: Customer;
  @Column({ name: 'medio_pago_id', type: 'uuid' }) paymentMethodId: string;
  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'medio_pago_id' }) paymentMethod: PaymentMethod;
  @Column({ name: 'numero', type: 'varchar', length: 40, unique: true }) number: string;
  @Column({ name: 'registrado_por', type: 'uuid' }) registeredById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'registrado_por' }) registeredBy: User;
  @Column({ name: 'confirmado_por', type: 'uuid', nullable: true }) confirmedById: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'confirmado_por' }) confirmedBy: User | null;
  @Column({ name: 'anulado_por', type: 'uuid', nullable: true }) voidedById: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'anulado_por' }) voidedBy: User | null;
  @Column({ name: 'fecha_pago', type: 'date' }) paymentDate: string;
  @Column({ name: 'importe', type: 'numeric', precision: 14, scale: 2 }) amount: string;
  @Column({ name: 'referencia', type: 'varchar', length: 160, nullable: true }) reference: string | null;
  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true }) observation: string | null;
  @Column({ name: 'estado', type: 'enum', enum: PaymentStatus, enumName: 'estado_pago_enum', default: PaymentStatus.REGISTERED }) status: PaymentStatus;
  @Column({ name: 'confirmado_at', type: 'timestamptz', nullable: true }) confirmedAt: Date | null;
  @Column({ name: 'anulado_at', type: 'timestamptz', nullable: true }) voidedAt: Date | null;
  @Column({ name: 'motivo_anulacion', type: 'varchar', length: 500, nullable: true }) voidReason: string | null;
  @VersionColumn({ name: 'version' }) version: number;
  @OneToMany(() => PaymentApplication, (application) => application.payment) applications: PaymentApplication[];
  @OneToMany(() => PaymentHistory, (history) => history.payment) history: PaymentHistory[];
}
