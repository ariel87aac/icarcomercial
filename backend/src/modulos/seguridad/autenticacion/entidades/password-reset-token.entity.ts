import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../../compartido/entidades/auditable.entity';
import { User } from '../../usuarios/entidades/user.entity';

@Entity({ name: 'tokens_recuperacion' })
export class PasswordResetToken extends AuditableEntity {
  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'expira_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'usado_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}

