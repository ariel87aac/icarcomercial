import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import {
  CreateInventoryMovementDto,
  InventoryMovementQueryDto,
  InventoryReservationQueryDto,
  StockQueryDto,
} from './dto/inventory.dto';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryReservation } from './entities/inventory-reservation.entity';
import { InventoryMovementType } from './entities/inventory.enums';
import { Stock } from './entities/stock.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Stock) private readonly stockRepository: Repository<Stock>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
    @InjectRepository(InventoryReservation)
    private readonly reservationRepository: Repository<InventoryReservation>,
    @InjectRepository(ProductPresentation)
    private readonly presentationRepository: Repository<ProductPresentation>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async stocks(query: StockQueryDto) {
    const builder = this.stockRepository.createQueryBuilder('stock')
      .leftJoinAndSelect('stock.presentation', 'presentation')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('presentation.unit', 'unit')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.productLine', 'productLine')
      .orderBy('product.name', 'ASC')
      .addOrderBy('presentation.description', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.q) {
      builder.andWhere(new Brackets((where) => where
        .where('product.code ILIKE :q', { q: `%${query.q}%` })
        .orWhere('unaccent(product.name) ILIKE unaccent(:q)', { q: `%${query.q}%` })
        .orWhere('unaccent(presentation.description) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
    }
    if (query.productId) builder.andWhere('presentation.productId = :productId', { productId: query.productId });
    if (query.categoryId) builder.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.status) builder.andWhere('presentation.status = :status', { status: query.status });
    const [stocks, total] = await builder.getManyAndCount();
    return paginate(stocks.map((stock) => this.toView(stock)), total, query.page, query.limit);
  }

  async movements(query: InventoryMovementQueryDto) {
    const builder = this.movementRepository.createQueryBuilder('movement')
      .leftJoinAndSelect('movement.stock', 'stock')
      .leftJoinAndSelect('stock.presentation', 'presentation')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('presentation.unit', 'unit')
      .leftJoinAndSelect('movement.user', 'user')
      .orderBy('movement.occurredAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.stockId) builder.andWhere('movement.stockId = :stockId', { stockId: query.stockId });
    if (query.presentationId) builder.andWhere('stock.presentationId = :presentationId', { presentationId: query.presentationId });
    if (query.type) builder.andWhere('movement.type = :type', { type: query.type });
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async reservations(query: InventoryReservationQueryDto) {
    const builder = this.reservationRepository.createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.stock', 'stock')
      .leftJoinAndSelect('stock.presentation', 'presentation')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('reservation.orderDetail', 'detail')
      .leftJoinAndSelect('detail.order', 'order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('reservation.user', 'user')
      .orderBy('reservation.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.orderId) builder.andWhere('detail.orderId = :orderId', { orderId: query.orderId });
    if (query.presentationId) builder.andWhere('stock.presentationId = :presentationId', { presentationId: query.presentationId });
    if (query.status) builder.andWhere('reservation.status = :status', { status: query.status });
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async createMovement(dto: CreateInventoryMovementDto, actor: AuthenticatedUser) {
    const presentation = await this.presentationRepository.findOne({
      where: { id: dto.presentationId },
      relations: { product: true, unit: true },
    });
    if (!presentation) throw new NotFoundException('Presentación no encontrada');
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO existencias (presentacion_id, cantidad_fisica, cantidad_reservada)
         VALUES ($1, 0, 0) ON CONFLICT (presentacion_id) DO NOTHING`,
        [dto.presentationId],
      );
      const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
        .setLock('pessimistic_write')
        .where('stock.presentationId = :presentationId', { presentationId: dto.presentationId })
        .getOneOrFail();
      const previous = Number(stock.physicalQuantity);
      const delta = dto.type === InventoryMovementType.NEGATIVE_ADJUSTMENT ? -dto.quantity : dto.quantity;
      const next = previous + delta;
      if (next < 0) throw new UnprocessableEntityException('El movimiento dejaría una existencia física negativa');
      if (next < Number(stock.reservedQuantity)) {
        throw new UnprocessableEntityException('El ajuste no puede dejar la existencia física por debajo de la cantidad reservada');
      }
      stock.physicalQuantity = next.toFixed(3);
      await manager.getRepository(Stock).save(stock);
      const movement = await manager.getRepository(InventoryMovement).save(
        manager.getRepository(InventoryMovement).create({
          stockId: stock.id,
          type: dto.type,
          quantity: dto.quantity.toFixed(3),
          previousBalance: previous.toFixed(3),
          newBalance: next.toFixed(3),
          reason: dto.reason.trim(),
          userId: actor.id,
        }),
      );
      return { stockId: stock.id, movementId: movement.id };
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'inventory',
      action: 'REGISTRAR_MOVIMIENTO',
      entity: 'movimientos_inventario',
      entityId: result.movementId,
      result: 'EXITOSO',
      metadata: { stockId: result.stockId, presentationId: dto.presentationId, type: dto.type, quantity: dto.quantity },
    });
    return this.movementRepository.findOneOrFail({
      where: { id: result.movementId },
      relations: { stock: { presentation: { product: true, unit: true } }, user: true },
    });
  }

  private toView(stock: Stock) {
    return {
      ...stock,
      availableQuantity: (Number(stock.physicalQuantity) - Number(stock.reservedQuantity)).toFixed(3),
    };
  }
}
