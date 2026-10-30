import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../seguridad/usuarios/entidades/user.entity';
import { ChannelSetting } from './channel-setting.entity';

@Entity({ name: 'registros_prueba_canal' })
export class ChannelTestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'canal_id', type: 'uuid', nullable: true })
  channelId: string | null;

  @ManyToOne(() => ChannelSetting, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'canal_id' })
  channel: ChannelSetting | null;

  @Column({ name: 'probado_por', type: 'uuid' })
  testedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'probado_por' })
  testedBy: User;

  @Column({ name: 'destinatario_enmascarado', type: 'varchar', length: 30 })
  maskedRecipient: string;

  @Column({ name: 'resultado', type: 'varchar', length: 10 })
  result: 'EXITOSO' | 'ERROR';

  @Column({ name: 'codigo_http', type: 'integer', nullable: true })
  httpStatus: number | null;

  @Column({ name: 'duracion_ms', type: 'integer' })
  durationMs: number;

  @Column({ name: 'proveedor_mensaje_id', type: 'varchar', length: 160, nullable: true })
  providerMessageId: string | null;

  @Column({ name: 'respuesta_sanitizada', type: 'jsonb', default: () => "'{}'::jsonb" })
  sanitizedResponse: Record<string, unknown>;

  @Column({ name: 'error', type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
