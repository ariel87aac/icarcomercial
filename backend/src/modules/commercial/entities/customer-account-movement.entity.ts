import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { AccountMovementType } from './commercial.enums';
import { PaymentApplication } from './payment-application.entity';
import { Sale } from './sale.entity';

@Entity({ name: 'movimientos_cuenta_cliente' })
export class CustomerAccountMovement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'cliente_id', type: 'uuid' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'cliente_id' }) customer: Customer;
  @Column({ name: 'venta_codigo', type: 'integer', nullable: true }) saleCode: number | null;
  @ManyToOne(() => Sale, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'venta_codigo', referencedColumnName: 'code' }) sale: Sale | null;
  @Column({ name: 'pago_aplicacion_id', type: 'uuid', nullable: true }) paymentApplicationId: string | null;
  @ManyToOne(() => PaymentApplication, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pago_aplicacion_id' }) paymentApplication: PaymentApplication | null;
  @Column({ name: 'tipo', type: 'enum', enum: AccountMovementType, enumName: 'tipo_movimiento_cuenta_enum' }) type: AccountMovementType;
  @Column({ name: 'debe', type: 'numeric', precision: 14, scale: 2, default: 0 }) debit: string;
  @Column({ name: 'haber', type: 'numeric', precision: 14, scale: 2, default: 0 }) credit: string;
  @Column({ name: 'saldo_resultante', type: 'numeric', precision: 14, scale: 2 }) resultingBalance: string;
  @Column({ name: 'descripcion', type: 'varchar', length: 240 }) description: string;
  @Column({ name: 'registrado_por', type: 'uuid' }) registeredById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'registrado_por' }) registeredBy: User;
  @CreateDateColumn({ name: 'registrado_en', type: 'timestamptz' }) occurredAt: Date;
}
