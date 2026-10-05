import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProductionConsolidationDetail } from './production-consolidation-detail.entity';
import { ProductionProgressType } from './production.enums';

@Entity({ name: 'registros_avance_produccion' })
export class ProductionProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'detalle_consolidado_id', type: 'uuid' })
  consolidatedDetailId: string;

  @ManyToOne(() => ProductionConsolidationDetail, (detail) => detail.progress, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'detalle_consolidado_id' })
  consolidatedDetail: ProductionConsolidationDetail;

  @Column({ name: 'cantidad', type: 'numeric', precision: 18, scale: 6 })
  quantity: string;

  @Column({ name: 'tipo', type: 'enum', enum: ProductionProgressType, enumName: 'tipo_avance_produccion_enum', default: ProductionProgressType.PROGRESS })
  type: ProductionProgressType;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true })
  observation: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
