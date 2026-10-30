import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../../compartido/entidades/auditable.entity';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';
import { ProductPresentation } from '../../catalogo/entidades/product-presentation.entity';
import { CustomerType } from '../../../clientes/entidades/customer.enums';

@Entity({ name: 'precios_producto' })
export class ProductPrice extends AuditableEntity {
  @Column({ name: 'presentacion_id', type: 'uuid' })
  presentationId: string;

  @ManyToOne(() => ProductPresentation, (presentation) => presentation.prices, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation;

  @Column({ name: 'tipo_cliente', type: 'enum', enum: CustomerType })
  customerType: CustomerType;

  @Column({ name: 'importe', type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  validFrom: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;
}
