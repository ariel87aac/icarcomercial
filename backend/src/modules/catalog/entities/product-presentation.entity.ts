import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { ProductPrice } from '../../pricing/entities/product-price.entity';
import { Product } from './product.entity';
import { UnitMeasure } from './unit-measure.entity';

@Entity({ name: 'presentaciones_producto' })
export class ProductPresentation extends AuditableEntity {
  @Column({ name: 'producto_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.presentations, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  product: Product;

  @Column({ name: 'unidad_id', type: 'uuid' })
  unitId: string;

  @ManyToOne(() => UnitMeasure, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_id' })
  unit: UnitMeasure;

  @Column({ name: 'descripcion', type: 'varchar', length: 160 })
  description: string;

  @Column({ name: 'factor_conversion', type: 'numeric', precision: 12, scale: 4 })
  conversionFactor: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany(() => ProductPrice, (price) => price.presentation)
  prices: ProductPrice[];

  @BeforeInsert()
  @BeforeUpdate()
  normalize(): void {
    if (this.description !== undefined) this.description = this.description.trim();
  }
}
