import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { User } from '../../users/entities/user.entity';
import { Permission } from './permission.entity';

@Entity({ name: 'roles' })
export class Role extends AuditableEntity {
  @Column({ type: 'varchar', length: 80, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @Column({ name: 'es_sistema', type: 'boolean', default: false })
  isSystem: boolean;

  @ManyToMany(() => Permission, (permission) => permission.roles, { eager: true })
  @JoinTable({
    name: 'roles_permisos',
    joinColumn: { name: 'rol_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permiso_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}

