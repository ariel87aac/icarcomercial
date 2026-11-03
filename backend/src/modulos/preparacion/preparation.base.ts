import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { OrderPreparation } from './entidades/order-preparation.entity';
import { PreparationHistory } from './entidades/preparation-history.entity';
export abstract class PreparationServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(OrderPreparation) protected readonly preparationRepository: Repository<OrderPreparation>,
        @InjectRepository(PreparationHistory) protected readonly historyRepository: Repository<PreparationHistory>,
        @InjectRepository(Order) protected readonly orderRepository: Repository<Order>,
        @InjectRepository(Stock) protected readonly stockRepository: Repository<Stock>,
        @InjectRepository(InventoryReservation) protected readonly reservationRepository: Repository<InventoryReservation>,
        protected readonly dataSource: DataSource,
        protected readonly trackingService: TrackingService,
      ) {}
}
