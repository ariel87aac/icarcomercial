import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'configuraciones_canal' })
export class ChannelSetting extends AuditableEntity {
  @Column({ name: 'proveedor', type: 'varchar', length: 40, default: 'LIMITEAPI' }) provider: string;
  @Column({ name: 'url_api', type: 'varchar', length: 500 }) apiUrl: string;
  @Column({ name: 'token_cifrado', type: 'text', nullable: true, select: false }) encryptedToken: string | null;
  @Column({ name: 'token_ultimos_3', type: 'varchar', length: 3, nullable: true }) tokenLast3: string | null;
  @Column({ name: 'numero_habilitado', type: 'varchar', length: 30 }) enabledNumber: string;
  @Column({ name: 'referencia_licencia', type: 'varchar', length: 120, nullable: true }) licenseReference: string | null;
  @Column({ name: 'timeout_ms', type: 'integer', default: 10000 }) timeoutMs: number;
  @Column({ name: 'max_reintentos', type: 'integer', default: 3 }) maxRetries: number;
  @Column({ name: 'demora_reintento_segundos', type: 'integer', default: 60 }) retryDelaySeconds: number;
  @Column({ name: 'activa', type: 'boolean', default: true }) active: boolean;
  @Column({ name: 'actualizado_por', type: 'uuid' }) updatedById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actualizado_por' }) updatedBy: User;
}
