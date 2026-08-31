import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'sesiones_usuario' })
export class UserSession extends AuditableEntity {
  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64, unique: true })
  refreshTokenHash: string;

  @Column({ name: 'expira_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revocada_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'ip_origen', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;
}

