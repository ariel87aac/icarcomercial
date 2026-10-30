import { workflowTransaction } from '../orders/order-workflow';
import { TrackingService } from '../tracking/tracking.service';
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
    private readonly trackingService: TrackingService,
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
      .orderBy('product.code', 'ASC')
      .addOrderBy('presentation.description', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.q) {
      builder.andWhere(new Brackets((where) => where
        .where('CAST(product.code AS text) ILIKE :q', { q: `%${query.q}%` })
        .orWhere('unaccent(product.name) ILIKE unaccent(:q)', { q: `%${query.q}%` })
        .orWhere('unaccent(presentation.description) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
    }
    if (query.productId) builder.andWhere('presentation.productId = :productId', { productId: query.productId });
    if (query.categoryId) builder.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.productLineId) builder.andWhere('product.productLineId = :productLineId', { productLineId: query.productLineId });
    if (query.status) builder.andWhere('presentation.status = :status', { status: query.status });
    if (query.onlyWithStock) builder.andWhere('(stock.physicalQuantity > 0 OR stock.reservedQuantity > 0)');
    const [stocks, total] = await builder.getManyAndCount();
    return paginate(stocks.map((stock) => this.toView(stock)), total, query.page, query.limit);
  }

  async stockFilters() {
    const [categories, productLines, negativeRows] = await Promise.all([
      this.dataSource.query<Array<{ id: string; code: number; name: string; status: string }>>(
        `SELECT DISTINCT category.id, category.codigo AS code, category.nombre AS name, category.status
           FROM existencias stock
           JOIN presentaciones_producto presentation ON presentation.id = stock.presentacion_id
           JOIN productos product ON product.id = presentation.producto_id
           JOIN categorias_producto category ON category.id = product.categoria_id
          WHERE stock.cantidad_fisica > 0 OR stock.cantidad_reservada > 0
          ORDER BY category.nombre ASC`,
      ),
      this.dataSource.query<Array<{ id: string; code: number; name: string; status: string }>>(
        `SELECT DISTINCT product_line.id, product_line.codigo AS code, product_line.nombre AS name, product_line.status
           FROM existencias stock
           JOIN presentaciones_producto presentation ON presentation.id = stock.presentacion_id
           JOIN productos product ON product.id = presentation.producto_id
           JOIN lineas_productivas product_line ON product_line.id = product.linea_productiva_id
          WHERE stock.cantidad_fisica > 0 OR stock.cantidad_reservada > 0
          ORDER BY product_line.nombre ASC`,
      ),
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM existencias
          WHERE cantidad_fisica - cantidad_reservada < 0`,
      ),
    ]);
    return { categories, productLines, negativeCount: Number(negativeRows[0]?.count ?? 0) };
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
    const result = await workflowTransaction(this.dataSource, async (manager) => {
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
      if (delta < 0 && next < Number(stock.reservedQuantity)) {
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
    await this.trackingService.refreshStock(`stock.movement:${result.movementId}`);
    return this.movementRepository.findOneOrFail({
      where: { id: result.movementId },
      relations: { stock: { presentation: { product: true, unit: true } }, user: true },
    });
  }

  private toView(stock: Stock) {
    const product = stock.presentation.product;
    const physicalQuantity = Number(stock.physicalQuantity);
    const reservedQuantity = Number(stock.reservedQuantity);
    const availableQuantity = physicalQuantity - reservedQuantity;
    product.imageUrl = product.imageMime
      ? `/api/catalogo/productos/${product.id}/imagen?v=${product.updatedAt.getTime()}`
      : null;
    return {
      ...stock,
      availableQuantity: availableQuantity.toFixed(3),
      shortageQuantity: Math.max(0, -availableQuantity).toFixed(3),
    };
  }
}
