import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, VersionColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { VisitResult } from '../../distribution/entities/visit-result.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { InternalVoucher } from './internal-voucher.entity';
import { SaleDetail } from './sale-detail.entity';
import { SaleStatus } from './commercial.enums';

@Entity({ name: 'ventas' })
export class Sale extends AuditableEntity {
  @Column({ name: 'codigo', type: 'integer', unique: true, generated: 'increment' }) code: number;
  @Column({ name: 'pedido_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pedido_id' }) order: Order;
  @Column({ name: 'cliente_id', type: 'uuid' }) customerId: string;
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'cliente_id' }) customer: Customer;
  @Column({ name: 'resultado_visita_id', type: 'uuid' }) visitResultId: string;
  @ManyToOne(() => VisitResult, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'resultado_visita_id' }) visitResult: VisitResult;
  @Column({ name: 'numero', type: 'varchar', length: 40, unique: true }) number: string;
  @Column({ name: 'fecha_emision', type: 'date' }) issuedDate: string;
  @Column({ name: 'fecha_vencimiento', type: 'date' }) dueDate: string;
  @Column({ name: 'dias_credito_copia', type: 'smallint' }) creditDaysSnapshot: number;
  @Column({ name: 'estado', type: 'enum', enum: SaleStatus, enumName: 'estado_venta_enum', default: SaleStatus.DRAFT }) status: SaleStatus;
  @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2 }) total: string;
  @Column({ name: 'saldo', type: 'numeric', precision: 14, scale: 2 }) balance: string;
  @Column({ name: 'creado_por', type: 'uuid' }) createdById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'creado_por' }) createdBy: User;
  @Column({ name: 'emitido_por', type: 'uuid' }) issuedById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'emitido_por' }) issuedBy: User;
  @Column({ name: 'anulado_por', type: 'uuid', nullable: true }) voidedById: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'anulado_por' }) voidedBy: User | null;
  @Column({ name: 'anulado_at', type: 'timestamptz', nullable: true }) voidedAt: Date | null;
  @Column({ name: 'motivo_anulacion', type: 'varchar', length: 500, nullable: true }) voidReason: string | null;
  @VersionColumn({ name: 'version' }) version: number;
  @OneToMany(() => SaleDetail, (detail) => detail.sale) details: SaleDetail[];
  @OneToOne(() => InternalVoucher, (voucher) => voucher.sale) voucher: InternalVoucher;
}
