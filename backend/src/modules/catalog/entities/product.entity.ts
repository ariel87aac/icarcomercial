import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { ProductCategory } from './product-category.entity';
import { ProductLine } from './product-line.entity';
import { ProductPresentation } from './product-presentation.entity';
import { UnitMeasure } from './unit-measure.entity';

@Entity({ name: 'productos' })
export class Product extends AuditableEntity {
  @Column({ name: 'codigo', type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ name: 'nombre', type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'categoria_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => ProductCategory, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  category: ProductCategory;

  @Column({ name: 'linea_productiva_id', type: 'uuid' })
  productLineId: string;

  @ManyToOne(() => ProductLine, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'linea_productiva_id' })
  productLine: ProductLine;

  @Column({ name: 'unidad_base_id', type: 'uuid' })
  baseUnitId: string;

  @ManyToOne(() => UnitMeasure, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_base_id' })
  baseUnit: UnitMeasure;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany(() => ProductPresentation, (presentation) => presentation.product)
  presentations: ProductPresentation[];

  @BeforeInsert()
  @BeforeUpdate()
  normalize(): void {
    if (this.code !== undefined) this.code = this.code.trim().toUpperCase();
    if (this.name !== undefined) this.name = this.name.trim();
  }
}
