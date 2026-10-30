import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { AuditableEntity } from '../../../compartido/entidades/auditable.entity';
import { CustomerAddress } from '../../clientes/entidades/customer-address.entity';
import { Order } from '../../pedidos/entidades/order.entity';
import { OrderPreparation } from '../../preparacion/entidades/order-preparation.entity';
import { DistributionRoute } from './distribution-route.entity';
import { DistributionDeliveryType, RouteDeliveryStatus } from './distribution.enums';
import { VisitResult } from './visit-result.entity';

@Entity({ name: 'rutas_entregas' })
export class RouteDelivery extends AuditableEntity {
  @Column({ name: 'ruta_id', type: 'uuid', nullable: true })
  routeId: string | null;

  @ManyToOne(() => DistributionRoute, (route) => route.deliveries, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ruta_id' })
  route: DistributionRoute | null;

  @Column({ name: 'tipo_entrega', type: 'enum', enum: DistributionDeliveryType, enumName: 'tipo_entrega_distribucion_enum', default: DistributionDeliveryType.ROUTE })
  deliveryType: DistributionDeliveryType;

  @Column({ name: 'preparacion_id', type: 'uuid', unique: true })
  preparationId: string;

  @ManyToOne(() => OrderPreparation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'preparacion_id' })
  preparation: OrderPreparation;

  @Column({ name: 'pedido_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  order: Order;

  @Column({ name: 'domicilio_id', type: 'uuid' })
  addressId: string;

  @ManyToOne(() => CustomerAddress, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'domicilio_id' })
  address: CustomerAddress;

  @Column({ name: 'posicion', type: 'integer', nullable: true })
  position: number | null;

  @Column({ name: 'estado', type: 'enum', enum: RouteDeliveryStatus, enumName: 'estado_entrega_ruta_enum', default: RouteDeliveryStatus.PENDING })
  status: RouteDeliveryStatus;

  @OneToOne(() => VisitResult, (result) => result.delivery)
  result: VisitResult | null;
}
