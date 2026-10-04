import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { User } from '../../users/entities/user.entity';
import { Customer } from './customer.entity';

@Entity({ name: 'clientes_usuarios' })
export class CustomerUser {
  @PrimaryColumn({ name: 'cliente_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, (customer) => customer.userLinks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cliente_id' })
  customer: Customer;

  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.customerLinks, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'usuario_id' })
  user: User;

  @Column({ name: 'es_principal', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
