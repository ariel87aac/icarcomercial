import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { InventoryMovementType } from './inventory.enums';
import { Stock } from './stock.entity';

@Entity({ name: 'movimientos_inventario' })
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'existencia_id', type: 'uuid' })
  stockId: string;

  @ManyToOne(() => Stock, (stock) => stock.movements, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'existencia_id' })
  stock: Stock;

  @Column({ name: 'tipo', type: 'enum', enum: InventoryMovementType })
  type: InventoryMovementType;

  @Column({ name: 'cantidad', type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'saldo_anterior', type: 'numeric', precision: 14, scale: 3 })
  previousBalance: string;

  @Column({ name: 'saldo_nuevo', type: 'numeric', precision: 14, scale: 3 })
  newBalance: string;

  @Column({ name: 'motivo', type: 'varchar', length: 255 })
  reason: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  occurredAt: Date;
}
