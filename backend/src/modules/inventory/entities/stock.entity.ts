import { Column, Entity, JoinColumn, OneToMany, OneToOne, VersionColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/entities/auditable.entity';
import { ProductPresentation } from '../../catalog/entities/product-presentation.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { InventoryReservation } from './inventory-reservation.entity';

@Entity({ name: 'existencias' })
export class Stock extends AuditableEntity {
  @Column({ name: 'presentacion_id', type: 'uuid', unique: true })
  presentationId: string;

  @OneToOne(() => ProductPresentation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'presentacion_id' })
  presentation: ProductPresentation;

  @Column({ name: 'cantidad_fisica', type: 'numeric', precision: 14, scale: 3, default: 0 })
  physicalQuantity: string;

  @Column({ name: 'cantidad_reservada', type: 'numeric', precision: 14, scale: 3, default: 0 })
  reservedQuantity: string;

  @VersionColumn({ name: 'version' })
  version: number;

  @OneToMany(() => InventoryMovement, (movement) => movement.stock)
  movements: InventoryMovement[];

  @OneToMany(() => InventoryReservation, (reservation) => reservation.stock)
  reservations: InventoryReservation[];
}
