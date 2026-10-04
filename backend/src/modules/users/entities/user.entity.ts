import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { Role } from '../../access-control/entities/role.entity';
import { CustomerUser } from '../../customers/entities/customer-user.entity';
import { UserType } from './user-type.enum';

@Entity({ name: 'usuarios' })
export class User extends AuditableEntity {
  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'nombre_usuario', type: 'varchar', length: 80, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ name: 'telefono', type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({
    name: 'tipo_usuario',
    type: 'enum',
    enum: UserType,
    default: UserType.INTERNAL,
  })
  type: UserType;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @Column({ name: 'ultimo_acceso_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'usuarios_roles',
    joinColumn: { name: 'usuario_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'rol_id', referencedColumnName: 'id' },
  })
  roles: Role[];

  @OneToMany(() => CustomerUser, (link) => link.user)
  customerLinks: CustomerUser[];

  @BeforeInsert()
  @BeforeUpdate()
  normalizeIdentity(): void {
    this.email = this.email.trim().toLowerCase();
    this.username = this.username.trim().toLowerCase();
    this.name = this.name.trim();
  }
}
