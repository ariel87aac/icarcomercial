import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { ProductPresentation } from '../../catalog/entities/product-presentation.entity';
import { CustomerType } from '../../customers/entities/customer.enums';

@Entity({ name: 'precios_producto' })
export class ProductPrice extends AuditableEntity {
  @Column({ name: 'presentacion_id', type: 'uuid' })
  presentationId: string;

  @ManyToOne(() => ProductPresentation, (presentation) => presentation.prices, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation;

  @Column({ name: 'tipo_cliente', type: 'enum', enum: CustomerType, nullable: true })
  customerType: CustomerType | null;

  @Column({ name: 'lista_comercial', type: 'varchar', length: 80, nullable: true })
  commercialList: string | null;

  @Column({ name: 'importe', type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  validFrom: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;
}
