import { workflowTransaction } from '../pedidos/order-workflow';
import { attachOrderWorkflow, coverageForOrders } from '../pedidos/order-workflow';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { CancelPreparationDto, ConfirmPreparationDto, CreatePreparationDto, PreparationQueryDto, RegisterPreparationProgressDto } from './dto/preparation.dto';
import { OrderPreparationDetail } from './entidades/order-preparation-detail.entity';
import { OrderPreparation } from './entidades/order-preparation.entity';
import { PreparationHistory } from './entidades/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from './entidades/preparation.enums';
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
