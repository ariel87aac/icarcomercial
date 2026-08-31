import { Column, Entity, ManyToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { Role } from './role.entity';

@Entity({ name: 'permisos' })
export class Permission extends AuditableEntity {
  @Column({ type: 'varchar', length: 120, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 80 })
  module: string;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}

