import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PaymentStatus } from './commercial.enums';
import { Payment } from './payment.entity';

@Entity({ name: 'pagos_historial' })
export class PaymentHistory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'pago_codigo', type: 'integer' }) paymentCode: number;
  @ManyToOne(() => Payment, (payment) => payment.history, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'pago_codigo', referencedColumnName: 'code' }) payment: Payment;
  @Column({ name: 'usuario_id', type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'usuario_id' }) user: User;
  @Column({ name: 'estado_anterior', type: 'enum', enum: PaymentStatus, enumName: 'estado_pago_enum', nullable: true }) previousStatus: PaymentStatus | null;
  @Column({ name: 'estado_nuevo', type: 'enum', enum: PaymentStatus, enumName: 'estado_pago_enum' }) newStatus: PaymentStatus;
  @Column({ name: 'motivo', type: 'varchar', length: 500, nullable: true }) reason: string | null;
  @CreateDateColumn({ name: 'registrado_en', type: 'timestamptz' }) occurredAt: Date;
}
