import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Zone } from '../../zones/entities/zone.entity';

@Entity({ name: 'configuraciones_estimacion' })
export class EstimationSetting {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'zona_id', type: 'uuid', nullable: true }) zoneId: string | null;
  @ManyToOne(() => Zone, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'zona_id' }) zone: Zone | null;
  @Column({ name: 'minutos_promedio_parada', type: 'integer' }) averageStopMinutes: number;
  @Column({ name: 'tolerancia_minutos', type: 'integer' }) toleranceMinutes: number;
  @Column({ name: 'umbral_proxima_entrega', type: 'integer' }) nextDeliveryThreshold: number;
  @Column({ name: 'vigente_desde', type: 'timestamptz' }) validFrom: Date;
  @Column({ name: 'vigente_hasta', type: 'timestamptz', nullable: true }) validUntil: Date | null;
  @Column({ name: 'creado_por', type: 'uuid' }) createdById: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'creado_por' }) createdBy: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

