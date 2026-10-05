import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RouteDelivery } from './route-delivery.entity';
import { VisitResultType } from './distribution.enums';
import { VisitResultDetail } from './visit-result-detail.entity';

@Entity({ name: 'resultados_visita' })
export class VisitResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ruta_entrega_id', type: 'uuid', unique: true })
  routeDeliveryId: string;

  @OneToOne(() => RouteDelivery, (delivery) => delivery.result, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ruta_entrega_id' })
  delivery: RouteDelivery;

  @Column({ name: 'resultado', type: 'enum', enum: VisitResultType, enumName: 'resultado_visita_enum' })
  result: VisitResultType;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'observacion', type: 'varchar', length: 500, nullable: true })
  observation: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;

  @OneToMany(() => VisitResultDetail, (detail) => detail.visitResult)
  details: VisitResultDetail[];
}
