import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { ProductionArea } from '../production/entities/production-area.entity';
import {
  CreateStockReplenishmentRequestDto,
  SaveStockReplenishmentRequestDto,
  StockReplenishmentPlanQueryDto,
  StockReplenishmentRequestQueryDto,
} from './dto/inventory.dto';
import { StockReplenishmentRequestDetail } from './entities/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from './entities/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from './entities/inventory.enums';
import { projectedAvailableQuantity } from './inventory-calculations';

interface StockRequestMetrics {
  presentationId: string;
  physicalQuantity: string;
  reservedQuantity: string;
  demandQuantity: string;
  shortageQuantity: string;
}

@Injectable()
export class StockReplenishmentRequestService {
  constructor(
    @InjectRepository(StockReplenishmentRequest)
    private readonly requestRepository: Repository<StockReplenishmentRequest>,
    @InjectRepository(StockReplenishmentRequestDetail)
    private readonly detailRepository: Repository<StockReplenishmentRequestDetail>,
    @InjectRepository(ProductPresentation)
    private readonly presentationRepository: Repository<ProductPresentation>,
    @InjectRepository(ProductionArea)
    private readonly areaRepository: Repository<ProductionArea>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async list(query: StockReplenishmentRequestQueryDto) {
    const builder = this.requestRepository.createQueryBuilder('request')
      .leftJoinAndSelect('request.requestedBy', 'requestedBy')
      .leftJoinAndSelect('request.sentBy', 'sentBy')
      .leftJoinAndSelect('request.closedBy', 'closedBy')
      .leftJoinAndSelect('request.productionConsolidation', 'productionConsolidation')
      .loadRelationCountAndMap('request.detailCount', 'request.details')
      .orderBy('request.requiredDate', 'DESC')
      .addOrderBy('request.code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.requiredDate) builder.andWhere('request.requiredDate = :requiredDate', { requiredDate: query.requiredDate });
    if (query.status) builder.andWhere('request.status = :status', { status: query.status });
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<StockReplenishmentRequest> {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: {
        requestedBy: true,
        sentBy: true,
        closedBy: true,
        productionConsolidation: true,
        details: {
          category: true,
          productionArea: true,
          presentation: { unit: true, product: { category: true, productLine: true } },
        },
      },
    });
    if (!request) throw new NotFoundException('Solicitud de abastecimiento no encontrada');
    request.details.sort((left, right) =>
      left.category.name.localeCompare(right.category.name)
      || left.presentation.product.productLine.name.localeCompare(right.presentation.product.productLine.name)
      || left.presentation.product.name.localeCompare(right.presentation.product.name)
      || left.presentation.description.localeCompare(right.presentation.description));
    this.addProductImages(request.details.map((detail) => detail.presentation));
    return request;
  }

  async create(dto: CreateStockReplenishmentRequestDto, actor: AuthenticatedUser): Promise<StockReplenishmentRequest> {
    const id = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['stock-replenishment-request-code']);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${dto.requiredDate}`]);
      const repository = manager.getRepository(StockReplenishmentRequest);
      const [sequence] = await manager.query<Array<{ nextCode: string }>>(
        `SELECT (COALESCE(MAX(codigo), 0) + 1)::text AS "nextCode" FROM solicitudes_abastecimiento`,
      );
      const nextCode = Number(sequence.nextCode);
      const request = await repository.save(repository.create({
        code: nextCode,
        requiredDate: dto.requiredDate,
        status: StockReplenishmentRequestStatus.DRAFT,
        requestedById: actor.id,
        sentById: null,
        sentAt: null,
        productionConsolidationId: null,
        scheduledAt: null,
        closedAt: null,
      }));
      await manager.query(
        `SELECT setval(pg_get_serial_sequence('solicitudes_abastecimiento', 'codigo'), $1, true)`,
        [nextCode],
      );
      return request.id;
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'inventory',
      action: 'CREAR_SOLICITUD_ABASTECIMIENTO',
      entity: 'solicitudes_abastecimiento',
      entityId: id,
      result: 'EXITOSO',
      metadata: { requiredDate: dto.requiredDate },
    });
    return this.findOne(id);
  }

  async plan(id: string, query: StockReplenishmentPlanQueryDto) {
    const request = await this.findOne(id);
    if (request.status !== StockReplenishmentRequestStatus.DRAFT) {
      return {
        request,
        items: request.details.map((detail) => this.snapshotItem(detail)),
      };
    }
    const builder = this.presentationRepository.createQueryBuilder('presentation')
      .innerJoinAndSelect('presentation.unit', 'unit')
      .innerJoinAndSelect('presentation.product', 'product')
      .innerJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('product.productLine', 'productLine')
      .where('presentation.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('product.status = :active', { active: RecordStatus.ACTIVE })
      .orderBy('category.name', 'ASC')
      .addOrderBy('productLine.name', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('presentation.description', 'ASC');
    if (query.categoryId) builder.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.q?.trim()) {
      builder.andWhere(new Brackets((where) => where
        .where('CAST(product.code AS text) ILIKE :q', { q: `%${query.q!.trim()}%` })
        .orWhere('unaccent(product.name) ILIKE unaccent(:q)', { q: `%${query.q!.trim()}%` })
        .orWhere('unaccent(presentation.description) ILIKE unaccent(:q)', { q: `%${query.q!.trim()}%` })));
    }
    const presentations = await builder.getMany();
    const metrics = await this.metrics(this.dataSource.manager, request.requiredDate, presentations.map((item) => item.id));
    const metricByPresentation = new Map(metrics.map((item) => [item.presentationId, item]));
    const savedByPresentation = new Map(request.details.map((detail) => [detail.presentationId, detail]));
    const areaByCategory = await this.areaByCategory(this.dataSource.manager);
    this.addProductImages(presentations);
    return {
      request,
      items: presentations.map((presentation) => {
        const metric = metricByPresentation.get(presentation.id) ?? this.emptyMetrics(presentation.id);
        const saved = savedByPresentation.get(presentation.id);
        const physical = Number(metric.physicalQuantity);
        const reserved = Number(metric.reservedQuantity);
        const shortage = Number(metric.shortageQuantity);
        const available = projectedAvailableQuantity(physical, reserved, presentation.unit.decimalScale);
        const additional = Number(saved?.additionalStockQuantity ?? 0);
        return {
          presentation,
          category: presentation.product.category,
          productionArea: areaByCategory.get(presentation.product.categoryId) ?? null,
          physicalQuantity: metric.physicalQuantity,
          reservedQuantity: metric.reservedQuantity,
          availableQuantity: this.decimal(available, presentation.unit.decimalScale),
          demandQuantity: metric.demandQuantity,
          shortageQuantity: metric.shortageQuantity,
          additionalStockQuantity: this.decimal(additional, presentation.unit.decimalScale),
          totalProductionQuantity: this.decimal(shortage + additional, presentation.unit.decimalScale),
          observation: saved?.observation ?? null,
        };
      }),
    };
  }

  async save(
    id: string,
    dto: SaveStockReplenishmentRequestDto,
    actor: AuthenticatedUser,
  ): Promise<StockReplenishmentRequest> {
    const presentationIds = dto.items.map((item) => item.presentationId);
    if (new Set(presentationIds).size !== presentationIds.length) {
      throw new BadRequestException('Una presentación no puede repetirse dentro de la solicitud');
    }
    await this.dataSource.transaction(async (manager) => {
      const request = await manager.getRepository(StockReplenishmentRequest).createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id })
        .getOne();
      if (!request) throw new NotFoundException('Solicitud de abastecimiento no encontrada');
      if (request.status !== StockReplenishmentRequestStatus.DRAFT) {
        throw new ConflictException('Solo una solicitud en Borrador puede modificarse');
      }
      const presentations = presentationIds.length
        ? await manager.getRepository(ProductPresentation).find({
            where: { id: In(presentationIds), status: RecordStatus.ACTIVE },
            relations: { unit: true, product: { category: true, productLine: true } },
          })
        : [];
      if (presentations.length !== presentationIds.length || presentations.some((item) => item.product.status !== RecordStatus.ACTIVE)) {
        throw new UnprocessableEntityException('Una o más presentaciones no existen o están inactivas');
      }
      const presentationById = new Map(presentations.map((item) => [item.id, item]));
      const metricByPresentation = new Map((await this.metrics(manager, request.requiredDate, presentationIds)).map((item) => [item.presentationId, item]));
      const areaByCategory = await this.areaByCategory(manager);
      const repository = manager.getRepository(StockReplenishmentRequestDetail);
      const existing = await repository.find({ where: { requestId: id } });
      const existingByPresentation = new Map(existing.map((item) => [item.presentationId, item]));
      const submittedPresentationIds = new Set(presentationIds);
      const removed = existing.filter((item) => !submittedPresentationIds.has(item.presentationId));
      if (removed.length) await repository.remove(removed);
      for (const item of dto.items) {
        const presentation = presentationById.get(item.presentationId)!;
        const scale = presentation.unit.decimalScale;
        const additional = Number(item.additionalStockQuantity.toFixed(scale));
        const current = existingByPresentation.get(item.presentationId);
        const metric = metricByPresentation.get(item.presentationId) ?? this.emptyMetrics(item.presentationId);
        const available = projectedAvailableQuantity(
          Number(metric.physicalQuantity),
          Number(metric.reservedQuantity),
          scale,
        );
        if (additional <= 0 && available >= 0) {
          if (current) await repository.remove(current);
          continue;
        }
        const detail = current ?? repository.create({ requestId: id, presentationId: item.presentationId });
        detail.categoryId = presentation.product.categoryId;
        detail.productionAreaId = areaByCategory.get(presentation.product.categoryId)?.id ?? null;
        detail.physicalQuantitySnapshot = this.decimal(Number(metric.physicalQuantity), scale);
        detail.reservedQuantitySnapshot = this.decimal(Number(metric.reservedQuantity), scale);
        detail.demandQuantitySnapshot = this.decimal(Number(metric.demandQuantity), scale);
        detail.shortageQuantitySnapshot = this.decimal(Number(metric.shortageQuantity), scale);
        detail.additionalStockQuantity = this.decimal(additional, scale);
        detail.observation = item.observation?.trim() || null;
        await repository.save(detail);
      }
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'inventory',
      action: 'GUARDAR_SOLICITUD_ABASTECIMIENTO',
      entity: 'solicitudes_abastecimiento',
      entityId: id,
      result: 'EXITOSO',
      metadata: { changedPresentations: dto.items.length },
    });
    return this.findOne(id);
  }

  async send(id: string, actor: AuthenticatedUser): Promise<StockReplenishmentRequest> {
    await this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(StockReplenishmentRequest).findOne({ where: { id } });
      if (!current) throw new NotFoundException('Solicitud de abastecimiento no encontrada');
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${current.requiredDate}`]);
      const request = await manager.getRepository(StockReplenishmentRequest).createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id })
        .getOne();
      if (!request) throw new NotFoundException('Solicitud de abastecimiento no encontrada');
      if (request.status !== StockReplenishmentRequestStatus.DRAFT) {
        throw new ConflictException('Solo una solicitud en Borrador puede enviarse');
      }
      const details = await manager.getRepository(StockReplenishmentRequestDetail).find({
        where: { requestId: id },
        relations: { presentation: { unit: true, product: { category: true } } },
      });
      if (!details.length) throw new UnprocessableEntityException('La solicitud no contiene faltantes ni cantidades adicionales para stock');
      const areaByCategory = await this.areaByCategory(manager);
      const metricByPresentation = new Map((await this.metrics(manager, request.requiredDate, details.map((item) => item.presentationId))).map((item) => [item.presentationId, item]));
      for (const detail of details) {
        if (detail.presentation.status !== RecordStatus.ACTIVE || detail.presentation.product.status !== RecordStatus.ACTIVE) {
          throw new UnprocessableEntityException('La solicitud contiene una presentación o producto inactivo');
        }
        const area = areaByCategory.get(detail.presentation.product.categoryId);
        if (!area) {
          throw new UnprocessableEntityException(`La categoría ${detail.presentation.product.category.name} no tiene un área de Producción activa asignada`);
        }
        const scale = detail.presentation.unit.decimalScale;
        const metric = metricByPresentation.get(detail.presentationId) ?? this.emptyMetrics(detail.presentationId);
        detail.categoryId = detail.presentation.product.categoryId;
        detail.productionAreaId = area.id;
        detail.physicalQuantitySnapshot = this.decimal(Number(metric.physicalQuantity), scale);
        detail.reservedQuantitySnapshot = this.decimal(Number(metric.reservedQuantity), scale);
        detail.demandQuantitySnapshot = this.decimal(Number(metric.demandQuantity), scale);
        detail.shortageQuantitySnapshot = this.decimal(Number(metric.shortageQuantity), scale);
        if (Number(detail.additionalStockQuantity) <= 0 && Number(metric.shortageQuantity) <= 0) {
          throw new UnprocessableEntityException(
            `Ingrese una cantidad en Para stock para ${detail.presentation.product.name}; el producto no tiene faltante de pedidos en la fecha seleccionada`,
          );
        }
        await manager.getRepository(StockReplenishmentRequestDetail).save(detail);
      }
      request.status = StockReplenishmentRequestStatus.SENT;
      request.sentById = actor.id;
      request.sentAt = new Date();
      await manager.getRepository(StockReplenishmentRequest).save(request);
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'inventory',
      action: 'ENVIAR_SOLICITUD_ABASTECIMIENTO',
      entity: 'solicitudes_abastecimiento',
      entityId: id,
      result: 'EXITOSO',
    });
    return this.findOne(id);
  }

  private async metrics(manager: EntityManager, requiredDate: string, presentationIds: string[]): Promise<StockRequestMetrics[]> {
    if (!presentationIds.length) return [];
    return manager.query<StockRequestMetrics[]>(
      `SELECT presentation.id AS "presentationId",
              COALESCE(stock.cantidad_fisica, 0)::text AS "physicalQuantity",
              COALESCE(stock.cantidad_reservada, 0)::text AS "reservedQuantity",
              COALESCE(demand.requested, 0)::text AS "demandQuantity",
              COALESCE(demand.pending, 0)::text AS "shortageQuantity"
         FROM presentaciones_producto presentation
         LEFT JOIN existencias stock ON stock.presentacion_id = presentation.id
         LEFT JOIN (
           SELECT detail.presentacion_id,
                  SUM(detail.cantidad_solicitada) AS requested,
                  SUM(detail.cantidad_pendiente) AS pending
             FROM pedidos_detalle detail
             JOIN pedidos orders ON orders.id = detail.pedido_id
            WHERE orders.estado = 'CONFIRMADO'
              AND orders.fecha_solicitada = $1
              AND orders.eliminado_at IS NULL
            GROUP BY detail.presentacion_id
         ) demand ON demand.presentacion_id = presentation.id
        WHERE presentation.id = ANY($2::uuid[])`,
      [requiredDate, presentationIds],
    );
  }

  private async areaByCategory(manager: EntityManager): Promise<Map<string, ProductionArea>> {
    const areas = await manager.getRepository(ProductionArea).find({
      where: { status: RecordStatus.ACTIVE },
      relations: { categories: true },
    });
    return new Map(areas.flatMap((area) => area.categories.map((category) => [category.id, area] as const)));
  }

  private snapshotItem(detail: StockReplenishmentRequestDetail) {
    const physical = Number(detail.physicalQuantitySnapshot);
    const reserved = Number(detail.reservedQuantitySnapshot);
    const shortage = Number(detail.shortageQuantitySnapshot);
    const additional = Number(detail.additionalStockQuantity);
    return {
      presentation: detail.presentation,
      category: detail.category,
      productionArea: detail.productionArea,
      physicalQuantity: detail.physicalQuantitySnapshot,
      reservedQuantity: detail.reservedQuantitySnapshot,
      availableQuantity: this.decimal(
        projectedAvailableQuantity(physical, reserved, detail.presentation.unit.decimalScale),
        detail.presentation.unit.decimalScale,
      ),
      demandQuantity: detail.demandQuantitySnapshot,
      shortageQuantity: detail.shortageQuantitySnapshot,
      additionalStockQuantity: detail.additionalStockQuantity,
      totalProductionQuantity: this.decimal(shortage + additional, detail.presentation.unit.decimalScale),
      observation: detail.observation,
    };
  }

  private emptyMetrics(presentationId: string): StockRequestMetrics {
    return { presentationId, physicalQuantity: '0', reservedQuantity: '0', demandQuantity: '0', shortageQuantity: '0' };
  }

  private decimal(value: number, scale: number): string {
    return value.toFixed(scale);
  }

  private addProductImages(presentations: ProductPresentation[]): void {
    for (const presentation of presentations) {
      const product = presentation.product;
      product.imageUrl = product.imageMime ? `/api/catalogo/productos/${product.id}/imagen?v=${product.updatedAt.getTime()}` : null;
    }
  }
}
