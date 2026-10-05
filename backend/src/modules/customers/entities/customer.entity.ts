import { BeforeInsert, BeforeUpdate, Column, Entity, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { CustomerAddress } from './customer-address.entity';
import { CustomerUser } from './customer-user.entity';
import { CustomerType, PaymentCondition } from './customer.enums';

@Entity({ name: 'clientes' })
export class Customer extends AuditableEntity {
  @Column({ name: 'tipo_cliente', type: 'enum', enum: CustomerType })
  type: CustomerType;

  @Column({ name: 'nombre_razon_social', type: 'varchar', length: 160 })
  businessName: string;

  @Column({ name: 'nit_ci', type: 'varchar', length: 30, nullable: true })
  taxId: string | null;

  @Column({ name: 'nombre_contacto', type: 'varchar', length: 120, nullable: true })
  contactName: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 30 })
  phone: string;

  @Column({ name: 'whatsapp', type: 'varchar', length: 30, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'condicion_pago', type: 'enum', enum: PaymentCondition })
  paymentCondition: PaymentCondition;

  @Column({ name: 'lista_comercial', type: 'varchar', length: 80, nullable: true })
  commercialList: string | null;

  @Column({
    name: 'limite_credito',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  creditLimit: string;

  @Column({ name: 'dias_credito', type: 'smallint', default: 0 })
  creditDays: number;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany(() => CustomerAddress, (address) => address.customer, { eager: true })
  addresses: CustomerAddress[];

  @OneToMany(() => CustomerUser, (link) => link.customer, { eager: true })
  userLinks: CustomerUser[];

  @BeforeInsert()
  @BeforeUpdate()
  normalize(): void {
    this.businessName = this.businessName.trim();
    this.taxId = this.taxId?.trim() || null;
    this.email = this.email?.trim().toLowerCase() || null;
    this.phone = this.phone.trim();
    this.whatsapp = this.whatsapp?.trim() || null;
    this.contactName = this.contactName?.trim() || null;
    this.commercialList = this.commercialList?.trim().toUpperCase() || null;
  }
}
