import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { ProductCategory } from '../../productos/catalogo/entidades/product-category.entity';
import { User } from '../../seguridad/usuarios/entidades/user.entity';

@Entity({ name: 'areas_produccion' })
export class ProductionArea extends AuditableEntity {
  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @ManyToMany(() => ProductCategory, { eager: true })
  @JoinTable({
    name: 'areas_produccion_categorias',
    joinColumn: { name: 'area_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoria_id', referencedColumnName: 'id' },
  })
  categories: ProductCategory[];

  @ManyToMany(() => User, (user) => user.productionAreas)
  users: User[];
}
