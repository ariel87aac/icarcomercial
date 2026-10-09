import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationEvent } from './tracking.enums';

@Entity({ name: 'plantillas_notificacion' })
export class NotificationTemplate extends AuditableEntity {
  @Column({ name: 'evento', type: 'enum', enum: NotificationEvent, enumName: 'evento_notificacion_enum' }) event: NotificationEvent;
  @Column({ name: 'referencia', type: 'varchar', length: 80 }) reference: string;
  @Column({ name: 'version', type: 'integer' }) version: number;
  @Column({ name: 'cuerpo', type: 'text' }) body: string;
  @Column({ name: 'variables_autorizadas', type: 'jsonb', default: () => "'[]'::jsonb" }) allowedVariables: string[];
  @Column({ name: 'activa', type: 'boolean', default: true }) active: boolean;
  @Column({ name: 'creado_por', type: 'uuid' }) createdById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'creado_por' }) createdBy: User;
}

