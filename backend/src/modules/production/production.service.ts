import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { ProductCategory } from '../catalog/entities/product-category.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { InventoryMovementType } from '../inventory/entities/inventory.enums';
import { Stock } from '../inventory/entities/stock.entity';
import { StockReplenishmentRequestDetail } from '../inventory/entities/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from '../inventory/entities/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../inventory/entities/inventory.enums';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { OrderStatus } from '../orders/entities/order.enums';
import {
  AdjustProductionPlanDto,
  CloseProductionConsolidationDto,
  CreateProductionAreaDto,
  GenerateProductionConsolidationDto,
  ProductionConsolidationQueryDto,
  RegisterProductionProgressDto,
  RegisterProductionDeliveryDto,
  ReceiveProductionDeliveryDto,
  ScheduleProductionDetailDto,
  ProductionReasonDto,
  UpdateProductionAreaDto,
} from './dto/production.dto';
import { ProductionArea } from './entities/production-area.entity';
import { ProductionConsolidationDetail } from './entities/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entities/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entities/production-consolidation-source.entity';
import { ProductionConsolidation } from './entities/production-consolidation.entity';
import { ProductionProgress } from './entities/production-progress.entity';
import { ProductionDelivery } from './entities/production-delivery.entity';
import {
  ProductionConsolidationStatus,
  ProductionConsolidationType,
  ProductionDeliveryStatus,
  ProductionDetailStage,
  ProductionHistoryEvent,
  ProductionProgressType,
} from './entities/production.enums';
import {
  baseContribution,
  batchAdjustment,
  decimalForScale,
  productionDifference,
  roundForScale,
} from './production-calculations';

interface ResolvedSource {
  orderDetail: OrderDetail;
  originalQuantity: number;
  reservedQuantity: number;
  pendingQuantity: number;
  appliedFactor: number;
  baseContribution: number;
  warehouseContribution: number;
  productionContribution: number;
  decimalScale: number;
}

interface ConsolidatedGroup {
  productId: string;
  categoryId: string;
  productLineId: string;
  presentationId: string;
  baseUnitId: string;
  productionAreaId: string | null;
  decimalScale: number;
  requestedQuantity: number;
  warehouseCoveredQuantity: number;
  productionRequiredQuantity: number;
  stockRequestedQuantity: number;
  stockRequestDetailId: string | null;
  sources: ResolvedSource[];
}

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductionConsolidation)
    private readonly consolidationRepository: Repository<ProductionConsolidation>,
    @InjectRepository(ProductionConsolidationDetail)
    private readonly detailRepository: Repository<ProductionConsolidationDetail>,
    @InjectRepository(ProductionConsolidationSource)
    private readonly sourceRepository: Repository<ProductionConsolidationSource>,
    @InjectRepository(ProductionProgress)
    private readonly progressRepository: Repository<ProductionProgress>,
    @InjectRepository(ProductionConsolidationHistory)
    private readonly historyRepository: Repository<ProductionConsolidationHistory>,
    @InjectRepository(ProductionArea)
    private readonly areaRepository: Repository<ProductionArea>,
    @InjectRepository(ProductionDelivery)
    private readonly deliveryRepository: Repository<ProductionDelivery>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    private readonly dataSource: DataSource,
  ) {}

  areas(actor: AuthenticatedUser): Promise<ProductionArea[]> {
    const areaIds = this.productionAreaScope(actor);
    if (areaIds?.length === 0) return Promise.resolve([]);
    return this.areaRepository.find({
      ...(areaIds ? { where: { id: In(areaIds) } } : {}),
      order: { name: 'ASC', categories: { name: 'ASC' } },
    });
  }

  productionCategories(): Promise<ProductCategory[]> {
    return this.categoryRepository.find({
      where: { status: RecordStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  async createArea(dto: CreateProductionAreaDto, actor: AuthenticatedUser): Promise<ProductionArea> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductionArea);
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('El nombre del área es obligatorio');
      if (await repository.createQueryBuilder('area').where('lower(area.name) = lower(:name)', { name }).getOne()) {
        throw new ConflictException('Ya existe un área de Producción con ese nombre');
      }
      const categories = await this.resolveAreaCategories(manager, dto.categoryIds);
      const area = await repository.save(repository.create({ name, status: RecordStatus.ACTIVE, categories }));
      await this.saveAudit(manager, actor.id, 'CREAR_AREA_PRODUCCION', area.id, { name, categoryIds: dto.categoryIds });
      return repository.findOneOrFail({ where: { id: area.id }, relations: { categories: true } });
    });
  }

  async updateArea(id: string, dto: UpdateProductionAreaDto, actor: AuthenticatedUser): Promise<ProductionArea> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductionArea);
      const area = await repository.findOne({ where: { id }, relations: { categories: true } });
      if (!area) throw new NotFoundException('Área de Producción no encontrada');
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name) throw new BadRequestException('El nombre del área es obligatorio');
        const duplicate = await repository.createQueryBuilder('candidate')
          .where('lower(candidate.name) = lower(:name)', { name })
          .andWhere('candidate.id <> :id', { id })
          .getOne();
        if (duplicate) throw new ConflictException('Ya existe un área de Producción con ese nombre');
        area.name = name;
      }
      if (dto.status === RecordStatus.INACTIVE) {
        const assignedUsers = await manager.query<Array<{ total: string }>>(
          `SELECT COUNT(*)::text AS total FROM usuarios_areas_produccion WHERE area_id = $1`,
          [id],
        );
        if (Number(assignedUsers[0]?.total ?? 0) > 0) {
          throw new ConflictException('No se puede inactivar el área mientras tenga usuarios de Producción asignados');
        }
      }
      if (dto.status !== undefined) area.status = dto.status;
      if (dto.categoryIds !== undefined) area.categories = await this.resolveAreaCategories(manager, dto.categoryIds, id);
      await repository.save(area);
      await this.saveAudit(manager, actor.id, 'ACTUALIZAR_AREA_PRODUCCION', id, { fields: Object.keys(dto), categoryIds: dto.categoryIds });
      return repository.findOneOrFail({ where: { id }, relations: { categories: true } });
    });
  }

  async findAll(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.queryConsolidations(
      query,
      actor,
      this.isRequirementsOnly(actor)
        ? [
            ProductionConsolidationStatus.ISSUED,
            ProductionConsolidationStatus.IN_PROGRESS,
            ProductionConsolidationStatus.CLOSED,
            ProductionConsolidationStatus.CANCELLED,
            ProductionConsolidationStatus.CLOSED_INCOMPLETE,
          ]
        : undefined,
    );
  }

  async requirements(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.queryConsolidations(query, actor, [
      ProductionConsolidationStatus.ISSUED,
      ProductionConsolidationStatus.IN_PROGRESS,
      ProductionConsolidationStatus.CLOSED,
      ProductionConsolidationStatus.CANCELLED,
      ProductionConsolidationStatus.CLOSED_INCOMPLETE,
    ]);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
    const consolidation = await this.loadConsolidation(id, actor);
    if (this.isRequirementsOnly(actor) && consolidation.status === ProductionConsolidationStatus.DRAFT) {
      throw new ForbiddenException('El Borrador todavía no fue emitido a Producción');
    }
    return consolidation;
  }

  async plantBoard(productionAreaId: string | undefined, actor: AuthenticatedUser): Promise<ProductionConsolidation[]> {
    const areaIds = this.productionAreaScope(actor);
    if (productionAreaId && areaIds !== null && !areaIds.includes(productionAreaId)) {
      throw new ForbiddenException('El área de Producción no está asignada al usuario');
    }
    const builder = this.consolidationRepository.createQueryBuilder('consolidation')
      .where('consolidation.status IN (:...plantStatuses)', {
        plantStatuses: [ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS],
      })
      .orderBy('consolidation.code', 'DESC');
    if (productionAreaId) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM consolidaciones_detalle plant_detail WHERE plant_detail.consolidacion_id = consolidation.id AND plant_detail.area_produccion_id = :productionAreaId)',
        { productionAreaId },
      );
    }
    this.applyProductionAreaScope(builder, actor);
    const rows = await builder.getMany();
    const orders = await Promise.all(rows.map((row) => this.loadConsolidation(row.id, actor)));
    if (!productionAreaId) return orders;
    for (const order of orders) {
      order.details = order.details.filter((detail) => detail.productionAreaId === productionAreaId);
    }
    return orders.filter((order) => order.details.length > 0);
  }

  async generate(
    dto: GenerateProductionConsolidationDto,
    actor: AuthenticatedUser,
    complementary: boolean,
  ): Promise<ProductionConsolidation> {
    const consolidationId = await this.dataSource.transaction(async (manager) => {
      await this.lockDeliveryDate(manager, dto.deliveryDate);
      const consolidationRepository = manager.getRepository(ProductionConsolidation);
      const stockRequestRepository = manager.getRepository(StockReplenishmentRequest);
      let stockRequestId = dto.stockRequestId;
      let sourceDate = dto.deliveryDate;
      if (stockRequestId) {
        const requestedSource = await stockRequestRepository
          .createQueryBuilder('request')
          .setLock('pessimistic_write')
          .where('request.id = :id', { id: stockRequestId })
          .getOne();
        if (!requestedSource) throw new NotFoundException('Solicitud de abastecimiento no encontrada');
        if (requestedSource.status !== StockReplenishmentRequestStatus.SENT) {
          throw new ConflictException('La solicitud de abastecimiento ya no se encuentra pendiente de programación');
        }
        sourceDate = requestedSource.requiredDate;
        if (sourceDate !== dto.deliveryDate) await this.lockDeliveryDate(manager, sourceDate);
      } else {
        const pendingRequests = await stockRequestRepository.find({
          where: { requiredDate: dto.deliveryDate, status: StockReplenishmentRequestStatus.SENT },
          order: { code: 'ASC' },
        });
        if (pendingRequests.length > 1) {
          throw new UnprocessableEntityException('Existen varias solicitudes de abastecimiento para esta fecha; genere cada orden desde Solicitudes pendientes');
        }
        stockRequestId = pendingRequests[0]?.id;
      }
      let generateComplementary = complementary;
      const mainConsolidation = await consolidationRepository.findOne({
        where: { deliveryDate: dto.deliveryDate, type: ProductionConsolidationType.MAIN },
      });
      if (complementary) {
        const prior = await consolidationRepository.findOne({
          where: {
            deliveryDate: dto.deliveryDate,
            status: In([
              ProductionConsolidationStatus.ISSUED,
              ProductionConsolidationStatus.IN_PROGRESS,
              ProductionConsolidationStatus.CLOSED,
            ]),
          },
        });
        if (!prior) {
          throw new ConflictException('Debe existir una versión emitida antes de generar una consolidación complementaria');
        }
        const draft = await consolidationRepository.findOne({
          where: {
            deliveryDate: dto.deliveryDate,
            type: ProductionConsolidationType.COMPLEMENTARY,
            status: ProductionConsolidationStatus.DRAFT,
          },
        });
        if (draft) throw new ConflictException('Ya existe una consolidación complementaria en Borrador para esta fecha');
      } else if (stockRequestId && mainConsolidation) {
        generateComplementary = true;
      } else {
        if (mainConsolidation) throw new ConflictException('La consolidación principal ya existe; utilice recálculo o una complementaria');
      }

      const ids = await this.eligibleOrderDetailIds(manager, sourceDate);
      const preparationDeadlineAt = ids.length ? await this.preparationDeadline(manager, ids) : null;
      const versionResult = await consolidationRepository
        .createQueryBuilder('consolidation')
        .select('COALESCE(MAX(consolidation.version), 0)', 'maximum')
        .where('consolidation.deliveryDate = :deliveryDate', { deliveryDate: dto.deliveryDate })
        .getRawOne<{ maximum: string }>();
      const consolidation = await consolidationRepository.save(consolidationRepository.create({
        deliveryDate: dto.deliveryDate,
        preparationDeadlineAt,
        version: Number(versionResult?.maximum ?? 0) + 1,
        type: generateComplementary ? ProductionConsolidationType.COMPLEMENTARY : ProductionConsolidationType.MAIN,
        status: ProductionConsolidationStatus.DRAFT,
        generatedById: actor.id,
        emittedById: null,
        emittedAt: null,
        closedById: null,
        closedAt: null,
      }));
      const orderDetails = ids.length ? await this.loadOrderDetails(manager, ids) : [];
      consolidation.preparationDeadlineAt = orderDetails.length ? this.earliestPreparation(orderDetails) : null;
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.rebuildDraft(manager, consolidation, orderDetails, stockRequestId);
      const plannedDetailCount = await manager.getRepository(ProductionConsolidationDetail).count({
        where: { consolidationId: consolidation.id },
      });
      if (!plannedDetailCount) {
        throw new UnprocessableEntityException('No existen pedidos confirmados ni una solicitud de abastecimiento enviada para esta fecha');
      }
      await this.saveHistory(manager, consolidation.id, null, ProductionConsolidationStatus.DRAFT, ProductionHistoryEvent.GENERATION, actor.id, orderDetails.length
        ? (generateComplementary ? 'Orden complementaria generada desde pedidos confirmados' : 'Orden de Producción generada desde pedidos confirmados')
        : 'Orden de Producción generada desde una solicitud de abastecimiento para stock');
      await this.saveAudit(manager, actor.id, 'GENERAR_CONSOLIDACION', consolidation.id, {
        deliveryDate: dto.deliveryDate,
        sourceDate,
        version: consolidation.version,
        type: consolidation.type,
        stockRequestId: stockRequestId ?? null,
        sourceCount: ids.length,
      });
      return consolidation.id;
    });
    return this.findOne(consolidationId, actor);
  }

  async recalculate(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
      if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
        throw new ConflictException('Solo una consolidación en Borrador puede recalcularse');
      }
      await this.lockDeliveryDate(manager, consolidation.deliveryDate);
      const sourceDate = await this.sourceDateFor(manager, consolidation);
      if (sourceDate !== consolidation.deliveryDate) await this.lockDeliveryDate(manager, sourceDate);
      const currentRows = await manager.query<{ id: string }[]>(
        `SELECT source.detalle_pedido_id AS id
           FROM consolidaciones_origen source
           JOIN consolidaciones_detalle detail ON detail.id = source.detalle_consolidado_id
           JOIN pedidos_detalle order_detail ON order_detail.id = source.detalle_pedido_id
           JOIN pedidos orders ON orders.id = order_detail.pedido_id
          WHERE detail.consolidacion_id = $1
            AND orders.estado = 'CONFIRMADO'
            AND orders.fecha_solicitada = $2`,
        [id, sourceDate],
      );
      const newIds = await this.eligibleOrderDetailIds(manager, sourceDate);
      const ids = [...new Set([...currentRows.map((row) => row.id), ...newIds])];
      const orderDetails = ids.length ? await this.loadOrderDetails(manager, ids) : [];
      await this.rebuildDraft(manager, consolidation, orderDetails);
      await this.saveHistory(manager, id, ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.DRAFT, ProductionHistoryEvent.RECALCULATION, actor.id, 'Borrador recalculado');
      await this.saveAudit(manager, actor.id, 'RECALCULAR_CONSOLIDACION', id, { sourceCount: ids.length });
    });
    return this.findOne(id, actor);
  }

  async adjustPlan(
    id: string,
    detailId: string,
    dto: AdjustProductionPlanDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
      if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
        throw new ConflictException('El ajuste por batch o capacidad solo puede modificarse mientras la orden está en Borrador');
      }
      const detail = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new NotFoundException('Detalle consolidado no encontrado');
      this.assertProductionAreaAccess(actor, detail.productionAreaId);
      const scale = detail.baseUnit.decimalScale;
      const required = roundForScale(
        Number(detail.productionRequiredQuantity) + Number(detail.stockRequestedQuantity),
        scale,
      );
      if (dto.additionalQuantity === undefined && dto.plannedQuantity === undefined) {
        throw new BadRequestException('Debe indicar la cantidad del ajuste por batch o capacidad');
      }
      const planned = roundForScale(
        dto.additionalQuantity !== undefined ? required + dto.additionalQuantity : Number(dto.plannedQuantity),
        scale,
      );
      if (planned < required) {
        throw new UnprocessableEntityException('La cantidad planificada no puede ser menor al faltante de pedidos más la solicitud para stock');
      }
      const adjustment = batchAdjustment(planned, required, scale);
      const previousPlanned = detail.plannedQuantity;
      detail.plannedQuantity = decimalForScale(planned, scale);
      detail.additionalProductionQuantity = decimalForScale(adjustment, scale);
      detail.additionalProductionReason = adjustment > 0 ? dto.reason?.trim() || null : null;
      detail.difference = decimalForScale(
        productionDifference(Number(detail.preparedQuantity), planned, scale),
        scale,
      );
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      const observation = adjustment > 0
        ? `${detail.product.name}: plan actualizado de ${previousPlanned} a ${detail.plannedQuantity}; ajuste por batch/capacidad ${detail.additionalProductionQuantity}${detail.additionalProductionReason ? ` (${detail.additionalProductionReason})` : ''}`
        : `${detail.product.name}: ajuste por batch/capacidad retirado; plan ${detail.plannedQuantity}`;
      await this.saveHistory(
        manager,
        id,
        ProductionConsolidationStatus.DRAFT,
        ProductionConsolidationStatus.DRAFT,
        ProductionHistoryEvent.ADDITIONAL_PRODUCTION,
        actor.id,
        observation,
      );
      await this.saveAudit(manager, actor.id, 'AJUSTAR_PLAN_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        productId: detail.productId,
        productionRequiredQuantity: detail.productionRequiredQuantity,
        stockRequestedQuantity: detail.stockRequestedQuantity,
        previousPlannedQuantity: previousPlanned,
        plannedQuantity: detail.plannedQuantity,
        additionalProductionQuantity: detail.additionalProductionQuantity,
        reason: detail.additionalProductionReason,
      });
    });
    return this.findOne(id, actor);
  }

  async scheduleDetail(
    id: string,
    detailId: string,
    dto: ScheduleProductionDetailDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Orden de Producción no encontrada');
      if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
        throw new ConflictException('La programación solo puede modificarse mientras la orden está en Borrador');
      }
      const detail = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
      this.assertProductionAreaAccess(actor, detail.productionAreaId);
      const reason = dto.reason?.trim() || null;
      if (dto.additionalQuantity > 0 && (!reason || reason.length < 5)) {
        throw new UnprocessableEntityException('Debe explicar el ajuste por batch o capacidad con al menos 5 caracteres');
      }
      const scale = detail.baseUnit.decimalScale;
      const required = roundForScale(
        Number(detail.productionRequiredQuantity) + Number(detail.stockRequestedQuantity),
        scale,
      );
      const additional = roundForScale(dto.additionalQuantity, scale);
      const planned = roundForScale(required + additional, scale);
      const previous = {
        scheduledDate: detail.scheduledDate,
        sequence: detail.sequence,
        additionalQuantity: detail.additionalProductionQuantity,
        plannedQuantity: detail.plannedQuantity,
      };
      detail.scheduledDate = dto.scheduledDate;
      detail.sequence = dto.sequence;
      detail.additionalProductionQuantity = decimalForScale(additional, scale);
      detail.additionalProductionReason = additional > 0 ? reason : null;
      detail.plannedQuantity = decimalForScale(planned, scale);
      detail.difference = decimalForScale(
        productionDifference(Number(detail.preparedQuantity), planned, scale),
        scale,
      );
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.saveHistory(
        manager,
        id,
        ProductionConsolidationStatus.DRAFT,
        ProductionConsolidationStatus.DRAFT,
        ProductionHistoryEvent.SCHEDULING,
        actor.id,
        `${detail.product.name}: programado para ${dto.scheduledDate}, secuencia ${dto.sequence}, plan ${detail.plannedQuantity}`,
      );
      await this.saveAudit(manager, actor.id, 'PROGRAMAR_PRODUCTO_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        previous,
        scheduledDate: detail.scheduledDate,
        sequence: detail.sequence,
        additionalProductionQuantity: detail.additionalProductionQuantity,
        plannedQuantity: detail.plannedQuantity,
        reason: detail.additionalProductionReason,
      });
    });
    return this.findOne(id, actor);
  }

  async emit(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
      if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
        throw new ConflictException('Solo un Borrador puede emitirse');
      }
      await this.lockDeliveryDate(manager, consolidation.deliveryDate);
      await this.validateDraftIntegrity(manager, consolidation);
      await manager.getRepository(ProductionConsolidationDetail).createQueryBuilder()
        .update()
        .set({ stage: ProductionDetailStage.COMPLETED })
        .where('consolidacion_id = :id', { id })
        .andWhere('cantidad_planificada = 0')
        .execute();
      consolidation.status = ProductionConsolidationStatus.ISSUED;
      consolidation.emittedById = actor.id;
      consolidation.emittedAt = new Date();
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.saveHistory(manager, id, ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionHistoryEvent.ISSUE, actor.id, 'Requerimiento emitido a Producción');
      await this.saveAudit(manager, actor.id, 'EMITIR_CONSOLIDACION', id, {
        deliveryDate: consolidation.deliveryDate,
        version: consolidation.version,
        type: consolidation.type,
      });
    });
    return this.findOne(id, actor);
  }

  async sources(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationSource[]> {
    await this.findOne(id, actor);
    const builder = this.sourceRepository.createQueryBuilder('source')
      .leftJoinAndSelect('source.consolidatedDetail', 'detail')
      .leftJoinAndSelect('detail.product', 'product')
      .leftJoinAndSelect('detail.productLine', 'productLine')
      .leftJoinAndSelect('detail.baseUnit', 'baseUnit')
      .leftJoinAndSelect('source.presentation', 'presentation')
      .leftJoinAndSelect('source.orderDetail', 'orderDetail')
      .leftJoinAndSelect('orderDetail.order', 'order')
      .leftJoinAndSelect('order.customer', 'customer')
      .where('detail.consolidationId = :id', { id })
      .orderBy('productLine.name', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('order.code', 'ASC');
    const areaIds = this.productionAreaScope(actor);
    if (areaIds) {
      if (areaIds.length) builder.andWhere('detail.productionAreaId IN (:...actorAreaIds)', { actorAreaIds: areaIds });
      else builder.andWhere('1 = 0');
    }
    return builder.getMany();
  }

  async startDetail(id: string, detailId: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const detail = await manager.getRepository(ProductionConsolidationDetail).createQueryBuilder('detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
      this.assertProductionAreaAccess(actor, detail.productionAreaId);
      if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(detail.consolidation.status)) {
        throw new ConflictException('El producto solo puede iniciarse en una orden Emitida o En proceso');
      }
      if (![ProductionDetailStage.PENDING, ProductionDetailStage.PARTIALLY_RECEIVED].includes(detail.stage)) {
        throw new ConflictException('El producto no se encuentra disponible para iniciar producción');
      }
      const previousStatus = detail.consolidation.status;
      detail.stage = ProductionDetailStage.IN_PROGRESS;
      detail.startedAt ??= new Date();
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      if (detail.consolidation.status === ProductionConsolidationStatus.ISSUED) {
        detail.consolidation.status = ProductionConsolidationStatus.IN_PROGRESS;
        await manager.getRepository(ProductionConsolidation).save(detail.consolidation);
        await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.IN_PROGRESS, ProductionHistoryEvent.START, actor.id, `Producción iniciada: ${detail.product.name}`);
      } else {
        await this.saveHistory(manager, id, previousStatus, previousStatus, ProductionHistoryEvent.START, actor.id, `Producción iniciada: ${detail.product.name}`);
      }
      await this.saveAudit(manager, actor.id, 'INICIAR_PRODUCTO_PRODUCCION', id, { consolidatedDetailId: detail.id });
    });
    return this.findOne(id, actor);
  }

  async registerDelivery(
    id: string,
    detailId: string,
    dto: RegisterProductionDeliveryDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const detail = await manager.getRepository(ProductionConsolidationDetail).createQueryBuilder('detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.presentation', 'presentation')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
      this.assertProductionAreaAccess(actor, detail.productionAreaId);
      if (detail.consolidation.status !== ProductionConsolidationStatus.IN_PROGRESS) {
        throw new ConflictException('La orden debe estar En proceso para registrar una entrega');
      }
      if (![ProductionDetailStage.IN_PROGRESS, ProductionDetailStage.PARTIALLY_RECEIVED].includes(detail.stage)) {
        throw new ConflictException('Debe iniciar este producto antes de registrar su entrega');
      }
      if (!detail.presentationId || !detail.presentation) {
        throw new UnprocessableEntityException('El producto no tiene una presentación definida para su ingreso a Almacén');
      }
      const pendingDelivery = await manager.getRepository(ProductionDelivery).findOne({
        where: { consolidatedDetailId: detail.id, status: ProductionDeliveryStatus.PENDING },
      });
      if (pendingDelivery) throw new ConflictException('Este producto ya tiene una entrega pendiente de recepción en Almacén');
      const scale = detail.baseUnit.decimalScale;
      const quantity = roundForScale(dto.quantity, scale);
      if (quantity <= 0) throw new BadRequestException('La cantidad entregada no es válida para la presentación');
      const produced = roundForScale(Number(detail.preparedQuantity) + quantity, scale);
      const difference = productionDifference(produced, Number(detail.plannedQuantity), scale);
      if (!dto.finalDelivery && produced >= Number(detail.plannedQuantity)) {
        throw new UnprocessableEntityException('Al completar o superar el plan, la entrega debe marcarse como final');
      }
      const incident = dto.incident?.trim() || null;
      if (dto.finalDelivery && difference !== 0 && !incident) {
        throw new UnprocessableEntityException('Debe documentar el motivo cuando la cantidad real sea distinta al plan');
      }
      const productionFinishedAt = new Date();
      const delivery = await manager.getRepository(ProductionDelivery).save(manager.getRepository(ProductionDelivery).create({
        consolidatedDetailId: detail.id,
        deliveredQuantity: decimalForScale(quantity, scale),
        finalDelivery: dto.finalDelivery,
        productionIncident: incident,
        status: ProductionDeliveryStatus.PENDING,
        deliveredById: actor.id,
        receivedQuantity: null,
        receivedById: null,
        receivedAt: null,
        warehouseObservation: null,
        deliveredAt: productionFinishedAt,
      }));
      await manager.getRepository(ProductionProgress).save(manager.getRepository(ProductionProgress).create({
        consolidatedDetailId: detail.id,
        quantity: decimalForScale(quantity, scale),
        type: ProductionProgressType.PROGRESS,
        userId: actor.id,
        observation: incident || (dto.finalDelivery ? 'Entrega final enviada a Almacén' : 'Entrega parcial enviada a Almacén'),
      }));
      detail.preparedQuantity = decimalForScale(produced, scale);
      detail.difference = decimalForScale(difference, scale);
      detail.stage = ProductionDetailStage.PENDING_RECEIPT;
      if (dto.finalDelivery) detail.completedAt = productionFinishedAt;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.saveHistory(manager, id, detail.consolidation.status, detail.consolidation.status, ProductionHistoryEvent.DELIVERY, actor.id, `${detail.product.name}: ${decimalForScale(quantity, scale)} ${detail.presentation.description} entregados${dto.finalDelivery ? ' (entrega final)' : ' (entrega parcial)'}. Fin de producción: ${productionFinishedAt.toISOString()}${incident ? `. Incidencia: ${incident}` : ''}`);
      await this.saveAudit(manager, actor.id, 'ENTREGAR_PRODUCTO_A_ALMACEN', id, { deliveryId: delivery.id, consolidatedDetailId: detail.id, quantity, finalDelivery: dto.finalDelivery, difference, productionFinishedAt: productionFinishedAt.toISOString() });
    });
    return this.findOne(id, actor);
  }

  pendingDeliveries(): Promise<ProductionDelivery[]> {
    return this.deliveryRepository.find({
      where: { status: ProductionDeliveryStatus.PENDING },
      relations: {
        consolidatedDetail: {
          product: true,
          category: true,
          productLine: true,
          presentation: { unit: true },
          productionArea: true,
          consolidation: true,
        },
      },
      order: { deliveredAt: 'ASC' },
    });
  }

  async pendingStockRequests(actor: AuthenticatedUser): Promise<StockReplenishmentRequest[]> {
    const requests = await this.dataSource.getRepository(StockReplenishmentRequest).find({
      where: { status: StockReplenishmentRequestStatus.SENT },
      relations: {
        requestedBy: true,
        sentBy: true,
        details: {
          category: true,
          productionArea: true,
          presentation: { unit: true, product: { category: true, productLine: true } },
        },
      },
      order: { requiredDate: 'ASC', code: 'ASC' },
    });
    const areaIds = this.productionAreaScope(actor);
    for (const request of requests) {
      if (areaIds) {
        request.details = request.details.filter((detail) =>
          detail.productionAreaId !== null && areaIds.includes(detail.productionAreaId));
      }
      request.details.sort((left, right) =>
        (left.productionArea?.name ?? '').localeCompare(right.productionArea?.name ?? '')
        || left.category.name.localeCompare(right.category.name)
        || left.presentation.product.name.localeCompare(right.presentation.product.name));
      Object.assign(request, { detailCount: request.details.length });
    }
    return requests.filter((request) => request.details.length > 0);
  }

  async receiveDelivery(id: string, dto: ReceiveProductionDeliveryDto, actor: AuthenticatedUser): Promise<ProductionDelivery> {
    await this.dataSource.transaction(async (manager) => {
      const delivery = await manager.getRepository(ProductionDelivery).createQueryBuilder('delivery')
        .innerJoinAndSelect('delivery.consolidatedDetail', 'detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.presentation', 'presentation')
        .setLock('pessimistic_write')
        .where('delivery.id = :id', { id })
        .getOne();
      if (!delivery) throw new NotFoundException('Entrega de Producción no encontrada');
      if (delivery.status !== ProductionDeliveryStatus.PENDING) {
        throw new ConflictException('La entrega ya fue recibida en Almacén');
      }
      const detail = delivery.consolidatedDetail;
      const scale = detail.baseUnit.decimalScale;
      const received = roundForScale(dto.receivedQuantity, scale);
      if (received <= 0) throw new BadRequestException('La cantidad recibida no es válida para la presentación');
      const observation = dto.observation?.trim() || null;
      if (received !== roundForScale(Number(delivery.deliveredQuantity), scale) && !observation) {
        throw new UnprocessableEntityException('Debe documentar la diferencia entre lo entregado y lo recibido');
      }
      const stockRepository = manager.getRepository(Stock);
      let stock = await stockRepository.createQueryBuilder('stock').setLock('pessimistic_write')
        .where('stock.presentationId = :presentationId', { presentationId: detail.presentationId }).getOne();
      if (!stock) {
        stock = await stockRepository.save(stockRepository.create({
          presentationId: detail.presentationId!,
          physicalQuantity: '0.000000',
          reservedQuantity: '0.000000',
        }));
      }
      const previousBalance = Number(stock.physicalQuantity);
      const newBalance = roundForScale(previousBalance + received, 6);
      stock.physicalQuantity = decimalForScale(newBalance, 6);
      await stockRepository.save(stock);
      await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
        stockId: stock.id,
        type: InventoryMovementType.PRODUCTION_IN,
        quantity: decimalForScale(received, 6),
        previousBalance: decimalForScale(previousBalance, 6),
        newBalance: decimalForScale(newBalance, 6),
        reason: `Recepción de Producción: ${detail.product.name} · ${detail.presentation!.description}`,
        userId: actor.id,
        orderId: null,
        orderDetailId: null,
        routeDeliveryId: null,
        productionDeliveryId: delivery.id,
      }));
      delivery.status = ProductionDeliveryStatus.ACCEPTED;
      delivery.receivedQuantity = decimalForScale(received, scale);
      delivery.receivedById = actor.id;
      delivery.receivedAt = new Date();
      delivery.warehouseObservation = observation;
      await manager.getRepository(ProductionDelivery).save(delivery);
      detail.receivedQuantity = decimalForScale(Number(detail.receivedQuantity) + received, scale);
      detail.stage = delivery.finalDelivery
        ? (Number(detail.difference) === 0 ? ProductionDetailStage.COMPLETED : ProductionDetailStage.CLOSED_WITH_INCIDENT)
        : ProductionDetailStage.PARTIALLY_RECEIVED;
      if (delivery.finalDelivery) detail.completedAt ??= delivery.deliveredAt;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.saveHistory(manager, detail.consolidationId, detail.consolidation.status, detail.consolidation.status, ProductionHistoryEvent.WAREHOUSE_RECEIPT, actor.id, `${detail.product.name}: Almacén recibió ${decimalForScale(received, scale)} ${detail.presentation!.description}${observation ? `. ${observation}` : ''}`);
      await this.closeIfCompleted(manager, detail.consolidationId, actor.id);
      await this.saveAudit(manager, actor.id, 'RECIBIR_PRODUCCION_EN_ALMACEN', delivery.id, { consolidatedDetailId: detail.id, receivedQuantity: received, stockId: stock.id });
    });
    return this.deliveryRepository.findOneOrFail({
      where: { id },
      relations: { receivedBy: true, deliveredBy: true, consolidatedDetail: { product: true, presentation: { unit: true }, productionArea: true, category: true, consolidation: true } },
    });
  }

  async registerProgress(
    id: string,
    dto: RegisterProductionProgressDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
      if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
        throw new ConflictException('Los avances solo pueden registrarse en requerimientos Emitidos o En proceso');
      }
      const detail = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId: dto.consolidatedDetailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new NotFoundException('Detalle consolidado no encontrado');
      this.assertProductionAreaAccess(actor, detail.productionAreaId);
      const scale = detail.baseUnit.decimalScale;
      if (Number(detail.plannedQuantity) <= 0) {
        throw new ConflictException('Este producto no tiene cantidad planificada para Producción');
      }
      const quantity = roundForScale(dto.quantity, scale);
      if (quantity <= 0) throw new BadRequestException('La cantidad no es válida para la precisión de la unidad base');
      const previousStatus = consolidation.status;
      await manager.getRepository(ProductionProgress).save(manager.getRepository(ProductionProgress).create({
        consolidatedDetailId: detail.id,
        quantity: decimalForScale(quantity, scale),
        type: ProductionProgressType.PROGRESS,
        userId: actor.id,
        observation: dto.observation?.trim() || null,
      }));
      const prepared = roundForScale(Number(detail.preparedQuantity) + quantity, scale);
      detail.preparedQuantity = decimalForScale(prepared, scale);
      detail.difference = decimalForScale(productionDifference(prepared, Number(detail.plannedQuantity), scale), scale);
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      if (consolidation.status === ProductionConsolidationStatus.ISSUED) {
        consolidation.status = ProductionConsolidationStatus.IN_PROGRESS;
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.saveHistory(manager, id, ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS, ProductionHistoryEvent.START, actor.id, 'Primer avance válido');
      }
      await this.saveHistory(manager, id, consolidation.status, consolidation.status, ProductionHistoryEvent.PROGRESS, actor.id, dto.observation?.trim() || `Avance de ${decimalForScale(quantity, scale)}`);
      await this.saveAudit(manager, actor.id, 'REGISTRAR_AVANCE_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        quantity: decimalForScale(quantity, scale),
        previousStatus,
        status: consolidation.status,
      });
    });
    return this.findOne(id, actor);
  }

  async cancelDetail(
    id: string,
    detailId: string,
    dto: ProductionReasonDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    const reason = this.requiredReason(dto.reason);
    await this.dataSource.transaction(async (manager) => {
      const detail = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
      this.assertProductionAreaAccess(actor, detail.productionAreaId);
      if (![ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(detail.consolidation.status)) {
        throw new ConflictException('El producto ya no puede cancelarse en el estado actual de la orden');
      }
      if ([ProductionDetailStage.COMPLETED, ProductionDetailStage.CANCELLED].includes(detail.stage)) {
        throw new ConflictException('El producto ya se encuentra completado o cancelado');
      }
      const pendingDeliveries = await manager.getRepository(ProductionDelivery).count({
        where: { consolidatedDetailId: detail.id, status: ProductionDeliveryStatus.PENDING },
      });
      if (pendingDeliveries) {
        throw new ConflictException('Almacén debe recibir la entrega pendiente antes de cancelar este producto');
      }
      detail.stage = ProductionDetailStage.CANCELLED;
      detail.canceledById = actor.id;
      detail.canceledAt = new Date();
      detail.completedAt = detail.canceledAt;
      detail.cancellationReason = reason;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.saveHistory(manager, id, detail.consolidation.status, detail.consolidation.status, ProductionHistoryEvent.PRODUCT_CANCELLATION, actor.id, `${detail.product.name}: ${reason}`);
      await this.saveAudit(manager, actor.id, 'CANCELAR_PRODUCTO_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        reason,
        preparedQuantity: detail.preparedQuantity,
        receivedQuantity: detail.receivedQuantity,
      });
    });
    return this.findOne(id, actor);
  }

  async cancel(
    id: string,
    dto: ProductionReasonDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    const reason = this.requiredReason(dto.reason);
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Orden de Producción no encontrada');
      if (![ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
        throw new ConflictException('La orden ya no puede cancelarse en su estado actual');
      }
      const details = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.consolidationId = :id', { id })
        .getMany();
      this.assertWholeOrderAccess(actor, details);
      if (details.some((detail) => Number(detail.receivedQuantity) > 0)) {
        throw new ConflictException('La orden ya tiene productos recibidos en Almacén; utilice cierre incompleto');
      }
      const pendingDeliveries = await manager.getRepository(ProductionDelivery).createQueryBuilder('delivery')
        .innerJoin('delivery.consolidatedDetail', 'detail')
        .where('detail.consolidationId = :id', { id })
        .andWhere('delivery.status = :status', { status: ProductionDeliveryStatus.PENDING })
        .getCount();
      if (pendingDeliveries) {
        throw new ConflictException('Almacén debe resolver las entregas pendientes antes de cancelar la orden');
      }
      const now = new Date();
      for (const detail of details) {
        detail.stage = ProductionDetailStage.CANCELLED;
        detail.canceledById = actor.id;
        detail.canceledAt = now;
        detail.completedAt = now;
        detail.cancellationReason = reason;
      }
      await manager.getRepository(ProductionConsolidationDetail).save(details);
      const previousStatus = consolidation.status;
      consolidation.status = ProductionConsolidationStatus.CANCELLED;
      consolidation.cancellationReason = reason;
      consolidation.canceledById = actor.id;
      consolidation.canceledAt = now;
      consolidation.closedById = actor.id;
      consolidation.closedAt = now;
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.closeStockRequestIncomplete(manager, id, actor.id, `Producción cancelada: ${reason}`);
      await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.CANCELLED, ProductionHistoryEvent.ORDER_CANCELLATION, actor.id, reason);
      await this.saveAudit(manager, actor.id, 'CANCELAR_ORDEN_PRODUCCION', id, { reason });
    });
    return this.findOne(id, actor);
  }

  async closeIncomplete(
    id: string,
    dto: ProductionReasonDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    const reason = this.requiredReason(dto.reason);
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Orden de Producción no encontrada');
      if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
        throw new ConflictException('Solo una orden Emitida o En proceso puede cerrarse de manera incompleta');
      }
      const details = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.consolidationId = :id', { id })
        .getMany();
      if (!details.length) throw new UnprocessableEntityException('La orden no tiene productos');
      this.assertWholeOrderAccess(actor, details);
      const pendingDeliveries = await manager.getRepository(ProductionDelivery).createQueryBuilder('delivery')
        .innerJoin('delivery.consolidatedDetail', 'detail')
        .where('detail.consolidationId = :id', { id })
        .andWhere('delivery.status = :status', { status: ProductionDeliveryStatus.PENDING })
        .getCount();
      if (pendingDeliveries) {
        throw new ConflictException('Almacén debe resolver todas las entregas pendientes antes del cierre incompleto');
      }
      const isComplete = details.every((detail) =>
        Number(detail.receivedQuantity) >= Number(detail.plannedQuantity)
        && detail.stage !== ProductionDetailStage.CANCELLED);
      if (isComplete) {
        throw new ConflictException('La orden está completa; utilice el cierre normal');
      }
      const now = new Date();
      for (const detail of details) {
        if (![ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT, ProductionDetailStage.CANCELLED].includes(detail.stage)) {
          detail.stage = ProductionDetailStage.CANCELLED;
          detail.canceledById = actor.id;
          detail.canceledAt = now;
          detail.completedAt = now;
          detail.cancellationReason = reason;
        }
      }
      await manager.getRepository(ProductionConsolidationDetail).save(details);
      const previousStatus = consolidation.status;
      consolidation.status = ProductionConsolidationStatus.CLOSED_INCOMPLETE;
      consolidation.incompleteCloseObservation = reason;
      consolidation.closedById = actor.id;
      consolidation.closedAt = now;
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.closeStockRequestIncomplete(manager, id, actor.id, reason);
      await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.CLOSED_INCOMPLETE, ProductionHistoryEvent.INCOMPLETE_CLOSE, actor.id, reason);
      await this.saveAudit(manager, actor.id, 'CERRAR_PRODUCCION_INCOMPLETA', id, {
        reason,
        plannedQuantity: details.reduce((sum, detail) => sum + Number(detail.plannedQuantity), 0),
        receivedQuantity: details.reduce((sum, detail) => sum + Number(detail.receivedQuantity), 0),
      });
    });
    return this.findOne(id, actor);
  }

  async close(
    id: string,
    dto: CloseProductionConsolidationDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionConsolidation> {
    await this.dataSource.transaction(async (manager) => {
      const consolidation = await manager.getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
      if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
        throw new ConflictException('Solo un requerimiento Emitido o En proceso puede cerrarse');
      }
      const details = await manager.getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.consolidationId = :id', { id })
        .orderBy('detail.id', 'ASC')
        .getMany();
      if (!details.length) throw new UnprocessableEntityException('La consolidación no tiene detalles');
      const areaIds = this.productionAreaScope(actor);
      if (areaIds && !details.some((detail) => detail.productionAreaId && areaIds.includes(detail.productionAreaId))) {
        throw new ForbiddenException('La orden no contiene productos de las áreas de Producción asignadas al usuario');
      }
      const terminalStages = [ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT];
      if (details.some((detail) => !terminalStages.includes(detail.stage))) {
        throw new UnprocessableEntityException('No se puede cerrar la orden hasta que Almacén reciba la entrega final de cada producto');
      }
      if (details.some((detail) => Number(detail.receivedQuantity) < Number(detail.plannedQuantity))) {
        throw new UnprocessableEntityException('Existen cantidades pendientes; utilice el cierre incompleto e indique el motivo');
      }
      const hasDifference = details.some((detail) => Number(detail.difference) !== 0);
      const observation = dto.observation?.trim() || null;
      if (hasDifference && !observation) {
        throw new UnprocessableEntityException('Debe registrar una observación para cerrar con faltante o excedente');
      }
      const previousStatus = consolidation.status;
      consolidation.status = ProductionConsolidationStatus.CLOSED;
      consolidation.closedById = actor.id;
      consolidation.closedAt = new Date();
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.closeStockRequest(manager, consolidation.id, actor.id);
      await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.CLOSED, ProductionHistoryEvent.CLOSE, actor.id, observation || 'Requerimiento cerrado sin diferencias');
      await this.saveAudit(manager, actor.id, 'CERRAR_CONSOLIDACION', id, { hasDifference, observation });
    });
    return this.findOne(id, actor);
  }

  async history(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationHistory[]> {
    await this.findOne(id, actor);
    return this.historyRepository.createQueryBuilder('history')
      .leftJoinAndSelect('history.user', 'user')
      .where('history.consolidationId = :id', { id })
      .orderBy('history.occurredAt', 'ASC')
      .addOrderBy(`CASE "history"."evento"
        WHEN 'GENERACION' THEN 1
        WHEN 'RECALCULO' THEN 2
        WHEN 'AJUSTE_LOTE' THEN 3
        WHEN 'PRODUCCION_ADICIONAL' THEN 3
        WHEN 'PRODUCTO_AGREGADO' THEN 3
        WHEN 'PRODUCTO_RETIRADO' THEN 3
        WHEN 'PROGRAMACION' THEN 3
        WHEN 'EMISION' THEN 4
        WHEN 'INICIO' THEN 5
        WHEN 'AVANCE' THEN 6
        WHEN 'ENTREGA_PRODUCCION' THEN 7
        WHEN 'RECEPCION_ALMACEN' THEN 8
        WHEN 'CANCELACION_PRODUCTO' THEN 8
        WHEN 'CANCELACION_ORDEN' THEN 9
        WHEN 'CIERRE_INCOMPLETO' THEN 9
        WHEN 'CIERRE' THEN 9
        ELSE 99 END`, 'ASC')
      .addOrderBy('history.id', 'ASC')
      .getMany();
  }

  async summary(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    const builder = this.detailRepository.createQueryBuilder('detail')
      .innerJoin('detail.consolidation', 'consolidation')
      .innerJoin('detail.productLine', 'productLine')
      .innerJoin('detail.product', 'product')
      .innerJoin('detail.baseUnit', 'baseUnit')
      .leftJoin('detail.presentation', 'presentation')
      .leftJoin('detail.category', 'category')
      .leftJoin('detail.productionArea', 'productionArea')
      .select('consolidation.deliveryDate', 'deliveryDate')
      .addSelect('consolidation.version', 'version')
      .addSelect('consolidation.type', 'type')
      .addSelect('consolidation.status', 'status')
      .addSelect('productLine.id', 'productLineId')
      .addSelect('productLine.name', 'productLineName')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('category.name', 'categoryName')
      .addSelect('productionArea.name', 'productionAreaName')
      .addSelect('presentation.id', 'presentationId')
      .addSelect('presentation.description', 'presentationDescription')
      .addSelect('baseUnit.id', 'baseUnitId')
      .addSelect('baseUnit.abbreviation', 'baseUnitAbbreviation')
      .addSelect('SUM(detail.requestedQuantity)', 'requestedQuantity')
      .addSelect('SUM(detail.warehouseCoveredQuantity)', 'warehouseCoveredQuantity')
      .addSelect('SUM(detail.productionRequiredQuantity)', 'productionRequiredQuantity')
      .addSelect('SUM(detail.stockRequestedQuantity)', 'stockRequestedQuantity')
      .addSelect('SUM(detail.additionalProductionQuantity)', 'additionalProductionQuantity')
      .addSelect('SUM(detail.plannedQuantity)', 'plannedQuantity')
      .addSelect('SUM(detail.preparedQuantity)', 'preparedQuantity')
      .addSelect('SUM(detail.receivedQuantity)', 'receivedQuantity')
      .addSelect('GREATEST(SUM(detail.plannedQuantity) - SUM(detail.preparedQuantity), 0)', 'pendingQuantity')
      .addSelect('SUM(detail.difference)', 'difference')
      .groupBy('consolidation.deliveryDate')
      .addGroupBy('consolidation.version')
      .addGroupBy('consolidation.type')
      .addGroupBy('consolidation.status')
      .addGroupBy('productLine.id')
      .addGroupBy('productLine.name')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('category.name')
      .addGroupBy('productionArea.name')
      .addGroupBy('presentation.id')
      .addGroupBy('presentation.description')
      .addGroupBy('baseUnit.id')
      .addGroupBy('baseUnit.abbreviation')
      .orderBy('consolidation.deliveryDate', 'DESC')
      .addOrderBy('productLine.name', 'ASC')
      .addOrderBy('product.name', 'ASC');
    this.applyFilters(builder, query, 'consolidation', 'detail');
    this.applyProductionAreaScope(builder, actor, 'consolidation', 'detail');
    if (this.isRequirementsOnly(actor)) {
      builder.andWhere('consolidation.status <> :draftStatus', { draftStatus: ProductionConsolidationStatus.DRAFT });
    }
    const countBuilder = builder.clone();
    countBuilder.expressionMap.orderBys = {};
    const [countSql, countParameters] = countBuilder.getQueryAndParameters();
    const countRows = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total FROM (${countSql}) summary_rows`,
      countParameters,
    );
    const rows = await builder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany();
    return paginate(rows, Number(countRows[0]?.total ?? 0), query.page, query.limit);
  }

  private async queryConsolidations(
    query: ProductionConsolidationQueryDto,
    actor: AuthenticatedUser,
    statuses?: ProductionConsolidationStatus[],
  ) {
    const builder = this.consolidationRepository.createQueryBuilder('consolidation')
      .leftJoinAndSelect('consolidation.generatedBy', 'generatedBy')
      .leftJoinAndSelect('consolidation.emittedBy', 'emittedBy')
      .leftJoinAndSelect('consolidation.closedBy', 'closedBy')
      .leftJoinAndSelect('consolidation.canceledBy', 'canceledBy')
      .distinct(true)
      .orderBy('consolidation.code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const areaIds = this.productionAreaScope(actor);
    if (areaIds) {
      builder.loadRelationCountAndMap(
        'consolidation.detailCount',
        'consolidation.details',
        'visibleDetail',
        (count) => areaIds.length
          ? count.andWhere('visibleDetail.productionAreaId IN (:...visibleAreaIds)', { visibleAreaIds: areaIds })
          : count.andWhere('1 = 0'),
      );
    } else {
      builder.loadRelationCountAndMap('consolidation.detailCount', 'consolidation.details');
    }
    if (statuses) builder.andWhere('consolidation.status IN (:...allowedStatuses)', { allowedStatuses: statuses });
    this.applyFilters(builder, query);
    this.applyProductionAreaScope(builder, actor);
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  private applyFilters<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    query: ProductionConsolidationQueryDto,
    consolidationAlias = 'consolidation',
    detailAlias?: string,
  ): void {
    if (query.deliveryDate) builder.andWhere(`${consolidationAlias}.deliveryDate = :deliveryDate`, { deliveryDate: query.deliveryDate });
    if (query.version) builder.andWhere(`${consolidationAlias}.version = :version`, { version: query.version });
    if (query.type) builder.andWhere(`${consolidationAlias}.type = :type`, { type: query.type });
    if (query.status) builder.andWhere(`${consolidationAlias}.status = :status`, { status: query.status });
    else if (query.statuses?.length) builder.andWhere(`${consolidationAlias}.status IN (:...filterStatuses)`, { filterStatuses: query.statuses });
    if (detailAlias) {
      if (query.productionAreaId) builder.andWhere(`${detailAlias}.productionAreaId = :productionAreaId`, { productionAreaId: query.productionAreaId });
      if (query.categoryId) builder.andWhere(`${detailAlias}.categoryId = :categoryId`, { categoryId: query.categoryId });
      if (query.productId) builder.andWhere(`${detailAlias}.productId = :productId`, { productId: query.productId });
    } else if (query.productionAreaId || query.categoryId || query.productId) {
      const clauses = [`scope_detail.consolidacion_id = ${consolidationAlias}.id`];
      if (query.productionAreaId) clauses.push('scope_detail.area_produccion_id = :productionAreaId');
      if (query.categoryId) clauses.push('scope_detail.categoria_id = :categoryId');
      if (query.productId) clauses.push('scope_detail.producto_id = :productId');
      builder.andWhere(`EXISTS (SELECT 1 FROM consolidaciones_detalle scope_detail WHERE ${clauses.join(' AND ')})`, {
        ...(query.productionAreaId ? { productionAreaId: query.productionAreaId } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      });
    }
  }

  private async loadConsolidation(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
    const consolidation = await this.consolidationRepository.findOne({
      where: { id },
      relations: {
        generatedBy: true,
        emittedBy: true,
        closedBy: true,
        canceledBy: true,
        details: {
          product: true,
          category: true,
          productLine: true,
          baseUnit: true,
          presentation: { unit: true },
          productionArea: true,
          canceledBy: true,
          stockRequestDetail: { request: true },
          sources: { presentation: true, orderDetail: { order: { customer: true } } },
          progress: { user: true },
          deliveries: { deliveredBy: true, receivedBy: true },
        },
      },
    });
    if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
    const areaIds = this.productionAreaScope(actor);
    if (areaIds) {
      consolidation.details = consolidation.details.filter(
        (detail) => detail.productionAreaId !== null && areaIds.includes(detail.productionAreaId),
      );
      if (!consolidation.details.length) {
        throw new ForbiddenException('La orden no contiene productos de las áreas de Producción asignadas al usuario');
      }
    }
    consolidation.details.sort((left, right) =>
      left.scheduledDate.localeCompare(right.scheduledDate)
      || (left.productionArea?.name ?? '').localeCompare(right.productionArea?.name ?? '')
      || left.sequence - right.sequence
      || (left.category?.name ?? '').localeCompare(right.category?.name ?? '')
      || left.productLine.name.localeCompare(right.productLine.name)
      || left.product.name.localeCompare(right.product.name)
      || (left.presentation?.description ?? '').localeCompare(right.presentation?.description ?? ''));
    for (const detail of consolidation.details) {
      detail.sources?.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      detail.progress?.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
      detail.deliveries?.sort((left, right) => left.deliveredAt.getTime() - right.deliveredAt.getTime());
    }
    return consolidation;
  }

  private isRequirementsOnly(actor: AuthenticatedUser): boolean {
    return actor.permissions.includes('production.requirements.read')
      && !actor.permissions.includes('production.consolidations.create')
      && !actor.permissions.includes('production.plan.adjust');
  }

  private productionAreaScope(actor: AuthenticatedUser): string[] | null {
    if (!actor.roles.includes('PRODUCCION') || actor.roles.includes('ADMINISTRADOR')) return null;
    return actor.productionAreaIds ?? [];
  }

  private applyProductionAreaScope<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    actor: AuthenticatedUser,
    consolidationAlias = 'consolidation',
    detailAlias?: string,
  ): void {
    const areaIds = this.productionAreaScope(actor);
    if (areaIds === null) return;
    if (!areaIds.length) {
      builder.andWhere('1 = 0');
      return;
    }
    if (detailAlias) {
      builder.andWhere(`${detailAlias}.productionAreaId IN (:...actorAreaIds)`, { actorAreaIds: areaIds });
      return;
    }
    builder.andWhere(
      `EXISTS (SELECT 1 FROM consolidaciones_detalle actor_detail WHERE actor_detail.consolidacion_id = ${consolidationAlias}.id AND actor_detail.area_produccion_id IN (:...actorAreaIds))`,
      { actorAreaIds: areaIds },
    );
  }

  private assertProductionAreaAccess(actor: AuthenticatedUser, productionAreaId: string | null): void {
    const areaIds = this.productionAreaScope(actor);
    if (areaIds === null) return;
    if (!productionAreaId || !areaIds.includes(productionAreaId)) {
      throw new ForbiddenException('El producto no pertenece a un área de Producción asignada al usuario');
    }
  }

  private assertWholeOrderAccess(actor: AuthenticatedUser, details: ProductionConsolidationDetail[]): void {
    const areaIds = this.productionAreaScope(actor);
    if (areaIds === null) return;
    if (details.some((detail) => !detail.productionAreaId || !areaIds.includes(detail.productionAreaId))) {
      throw new ForbiddenException('Para cancelar o cerrar toda la orden debe tener asignadas todas sus áreas de Producción');
    }
  }

  private requiredReason(value: string): string {
    const reason = value?.trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestException('Debe registrar una observación de al menos 5 caracteres');
    }
    return reason;
  }

  private async eligibleOrderDetailIds(
    manager: EntityManager,
    deliveryDate: string,
  ): Promise<string[]> {
    const filters = [
      `orders.estado = 'CONFIRMADO'`,
      'orders.fecha_solicitada = $1',
      'source.id IS NULL',
    ];
    const rows = await manager.query<{ id: string }[]>(
      `SELECT order_detail.id
         FROM pedidos_detalle order_detail
         JOIN pedidos orders ON orders.id = order_detail.pedido_id
         LEFT JOIN consolidaciones_origen source ON source.detalle_pedido_id = order_detail.id
        WHERE ${filters.join(' AND ')}
        ORDER BY order_detail.id
        FOR UPDATE OF order_detail`,
      [deliveryDate],
    );
    return rows.map((row) => row.id);
  }

  private loadOrderDetails(manager: EntityManager, ids: string[]): Promise<OrderDetail[]> {
    return manager.getRepository(OrderDetail).createQueryBuilder('detail')
      .leftJoinAndSelect('detail.order', 'order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('detail.presentation', 'presentation')
      .leftJoinAndSelect('presentation.unit', 'presentationUnit')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.productLine', 'productLine')
      .leftJoinAndSelect('product.baseUnit', 'baseUnit')
      .where('detail.id IN (:...ids)', { ids })
      .orderBy('detail.id', 'ASC')
      .getMany();
  }

  private async preparationDeadline(manager: EntityManager, detailIds: string[]): Promise<Date> {
    const rows = await manager.query<Array<{ deadline: Date }>>(
      `SELECT MIN(orders.fecha_preparacion) AS deadline
         FROM pedidos_detalle detail
         JOIN pedidos orders ON orders.id = detail.pedido_id
        WHERE detail.id = ANY($1::uuid[])`,
      [detailIds],
    );
    if (!rows[0]?.deadline) throw new UnprocessableEntityException('Los pedidos no tienen una fecha límite de preparación válida');
    return new Date(rows[0].deadline);
  }

  private earliestPreparation(details: OrderDetail[]): Date {
    const timestamps = details.map((detail) => new Date(detail.order.preparationAt).getTime()).filter(Number.isFinite);
    if (!timestamps.length) throw new UnprocessableEntityException('Los pedidos no tienen una fecha límite de preparación válida');
    return new Date(Math.min(...timestamps));
  }

  private async rebuildDraft(
    manager: EntityManager,
    consolidation: ProductionConsolidation,
    orderDetails: OrderDetail[],
    stockRequestId?: string,
  ): Promise<void> {
    const groups = new Map<string, ConsolidatedGroup>();
    const areas = await manager.getRepository(ProductionArea).find({
      where: { status: RecordStatus.ACTIVE },
      relations: { categories: true },
    });
    const areaByCategory = new Map(areas.flatMap((area) => area.categories.map((category) => [category.id, area.id] as const)));
    const stockRequestBuilder = manager.getRepository(StockReplenishmentRequest).createQueryBuilder('request')
      .leftJoinAndSelect('request.details', 'requestDetail')
      .leftJoinAndSelect('requestDetail.presentation', 'requestPresentation')
      .leftJoinAndSelect('requestPresentation.unit', 'requestUnit')
      .leftJoinAndSelect('requestPresentation.product', 'requestProduct')
      .leftJoinAndSelect('requestProduct.category', 'requestCategory')
      .leftJoinAndSelect('requestProduct.productLine', 'requestProductLine');
    if (stockRequestId) {
      stockRequestBuilder
        .where('request.id = :stockRequestId', { stockRequestId })
        .andWhere('request.status = :sent', { sent: StockReplenishmentRequestStatus.SENT });
    } else {
      stockRequestBuilder
        .where('request.productionConsolidationId = :consolidationId', { consolidationId: consolidation.id })
        .andWhere('request.status = :scheduled', { scheduled: StockReplenishmentRequestStatus.SCHEDULED });
    }
    const stockRequest = await stockRequestBuilder.getOne();
    const sourceDate = stockRequest?.requiredDate ?? consolidation.deliveryDate;
    for (const orderDetail of orderDetails) {
      if (orderDetail.order.status !== OrderStatus.CONFIRMED || orderDetail.order.requestedDate !== sourceDate) {
        throw new UnprocessableEntityException('Solo se pueden consolidar detalles de pedidos Confirmados para la fecha seleccionada');
      }
      const presentation = orderDetail.presentation;
      const product = presentation?.product;
      const factor = Number(presentation?.conversionFactor);
      if (!product?.productLineId) throw new UnprocessableEntityException('Existe un producto sin línea productiva válida');
      if (!product.baseUnitId || !product.baseUnit) throw new UnprocessableEntityException('Existe un producto sin unidad base válida');
      if (!presentation?.id || !Number.isFinite(factor) || factor <= 0) {
        throw new UnprocessableEntityException(`La presentación ${orderDetail.presentationDescriptionSnapshot} no tiene un factor de conversión válido`);
      }
      const scale = presentation.unit.decimalScale;
      const baseScale = product.baseUnit.decimalScale;
      const original = Number(orderDetail.requestedQuantity);
      const reserved = Number(orderDetail.reservedQuantity);
      const pending = Number(orderDetail.pendingQuantity);
      const contribution = baseContribution(original, factor, baseScale);
      const warehouseContribution = baseContribution(reserved, factor, baseScale);
      const productionContribution = roundForScale(contribution - warehouseContribution, baseScale);
      if (
        !Number.isFinite(original) || !Number.isFinite(reserved) || !Number.isFinite(pending)
        || original <= 0 || reserved < 0 || pending < 0 || contribution <= 0
        || Math.abs(original - reserved - pending) > 0.000001
        || productionContribution < 0
      ) {
        throw new UnprocessableEntityException('La conversión produjo una cantidad no válida');
      }
      const key = presentation.id;
      const group = groups.get(key) ?? {
        productId: product.id,
        categoryId: product.categoryId,
        productLineId: product.productLineId,
        presentationId: presentation.id,
        baseUnitId: presentation.unitId,
        productionAreaId: areaByCategory.get(product.categoryId) ?? null,
        decimalScale: scale,
        requestedQuantity: 0,
        warehouseCoveredQuantity: 0,
        productionRequiredQuantity: 0,
        stockRequestedQuantity: 0,
        stockRequestDetailId: null,
        sources: [],
      };
      group.requestedQuantity = roundForScale(group.requestedQuantity + original, scale);
      group.warehouseCoveredQuantity = roundForScale(group.warehouseCoveredQuantity + reserved, scale);
      group.productionRequiredQuantity = roundForScale(group.productionRequiredQuantity + pending, scale);
      group.sources.push({
        orderDetail,
        originalQuantity: original,
        reservedQuantity: reserved,
        pendingQuantity: pending,
        appliedFactor: factor,
        baseContribution: contribution,
        warehouseContribution,
        productionContribution,
        decimalScale: 6,
      });
      groups.set(key, group);
    }
    for (const requestDetail of stockRequest?.details ?? []) {
      const presentation = requestDetail.presentation;
      const product = presentation.product;
      if (presentation.status !== RecordStatus.ACTIVE || product.status !== RecordStatus.ACTIVE) {
        throw new UnprocessableEntityException('La solicitud de abastecimiento contiene una presentación o producto inactivo');
      }
      const productionAreaId = areaByCategory.get(product.categoryId) ?? null;
      if (!productionAreaId) {
        throw new UnprocessableEntityException(`La categoría ${product.category.name} no tiene un área de Producción activa asignada`);
      }
      const scale = presentation.unit.decimalScale;
      const requestedStock = roundForScale(Number(requestDetail.additionalStockQuantity), scale);
      const existingGroup = groups.get(presentation.id);
      if (!Number.isFinite(requestedStock) || requestedStock < 0) {
        throw new UnprocessableEntityException('La solicitud de abastecimiento contiene una cantidad adicional inválida');
      }
      if (requestedStock === 0 && (!existingGroup || existingGroup.productionRequiredQuantity <= 0)) {
        throw new UnprocessableEntityException('La solicitud contiene un producto sin faltante ni cantidad adicional para stock');
      }
      const group = existingGroup ?? {
        productId: product.id,
        categoryId: product.categoryId,
        productLineId: product.productLineId,
        presentationId: presentation.id,
        baseUnitId: presentation.unitId,
        productionAreaId,
        decimalScale: scale,
        requestedQuantity: 0,
        warehouseCoveredQuantity: 0,
        productionRequiredQuantity: 0,
        stockRequestedQuantity: 0,
        stockRequestDetailId: null,
        sources: [],
      };
      group.categoryId = product.categoryId;
      group.productionAreaId = productionAreaId;
      group.stockRequestedQuantity = requestedStock;
      group.stockRequestDetailId = requestDetail.id;
      requestDetail.categoryId = product.categoryId;
      requestDetail.productionAreaId = productionAreaId;
      await manager.getRepository(StockReplenishmentRequestDetail).save(requestDetail);
      groups.set(presentation.id, group);
    }
    const detailRepository = manager.getRepository(ProductionConsolidationDetail);
    const existing = await detailRepository.find({ where: { consolidationId: consolidation.id } });
    const existingPlans = new Map(existing.filter((detail) => detail.presentationId).map((detail) => [
      detail.presentationId!,
      {
        additionalQuantity: Number(detail.additionalProductionQuantity),
        reason: detail.additionalProductionReason,
        scheduledDate: detail.scheduledDate,
        sequence: detail.sequence,
      },
    ]));
    if (existing.length) await detailRepository.remove(existing);
    const sequenceByArea = new Map<string, number>();
    for (const group of groups.values()) {
      const existingPlan = existingPlans.get(group.presentationId);
      const productionAreaId = areaByCategory.get(group.categoryId) ?? group.productionAreaId;
      const areaSequence = (sequenceByArea.get(productionAreaId ?? 'none') ?? 0) + 1;
      sequenceByArea.set(productionAreaId ?? 'none', areaSequence);
      const additional = roundForScale(existingPlan?.additionalQuantity ?? 0, group.decimalScale);
      const plannedQuantity = roundForScale(
        group.productionRequiredQuantity + group.stockRequestedQuantity + additional,
        group.decimalScale,
      );
      const detail = await detailRepository.save(detailRepository.create({
        consolidationId: consolidation.id,
        productId: group.productId,
        categoryId: group.categoryId,
        presentationId: group.presentationId,
        productionAreaId,
        productLineId: group.productLineId,
        baseUnitId: group.baseUnitId,
        requestedQuantity: decimalForScale(group.requestedQuantity, group.decimalScale),
        warehouseCoveredQuantity: decimalForScale(group.warehouseCoveredQuantity, group.decimalScale),
        productionRequiredQuantity: decimalForScale(group.productionRequiredQuantity, group.decimalScale),
        stockRequestedQuantity: decimalForScale(group.stockRequestedQuantity, group.decimalScale),
        stockRequestDetailId: group.stockRequestDetailId,
        additionalProductionQuantity: decimalForScale(additional, group.decimalScale),
        plannedQuantity: decimalForScale(plannedQuantity, group.decimalScale),
        additionalProductionReason: additional > 0 ? existingPlan?.reason ?? null : null,
        preparedQuantity: decimalForScale(0, group.decimalScale),
        receivedQuantity: decimalForScale(0, group.decimalScale),
        stage: ProductionDetailStage.PENDING,
        scheduledDate: existingPlan?.scheduledDate ?? consolidation.deliveryDate,
        sequence: existingPlan?.sequence ?? areaSequence,
        startedAt: null,
        completedAt: null,
        canceledById: null,
        canceledAt: null,
        cancellationReason: null,
        difference: decimalForScale(-plannedQuantity, group.decimalScale),
      }));
      await manager.getRepository(ProductionConsolidationSource).save(group.sources.map((source) =>
        manager.getRepository(ProductionConsolidationSource).create({
          consolidatedDetailId: detail.id,
          orderDetailId: source.orderDetail.id,
          presentationId: source.orderDetail.presentationId,
          originalQuantity: decimalForScale(source.originalQuantity, source.decimalScale),
          reservedQuantity: decimalForScale(source.reservedQuantity, source.decimalScale),
          pendingQuantity: decimalForScale(source.pendingQuantity, source.decimalScale),
          appliedFactor: source.appliedFactor.toFixed(6),
          baseContribution: decimalForScale(source.baseContribution, source.decimalScale),
          warehouseContribution: decimalForScale(source.warehouseContribution, source.decimalScale),
          productionContribution: decimalForScale(source.productionContribution, source.decimalScale),
        })));
    }
    if (stockRequest?.status === StockReplenishmentRequestStatus.SENT) {
      stockRequest.status = StockReplenishmentRequestStatus.SCHEDULED;
      stockRequest.productionConsolidationId = consolidation.id;
      stockRequest.scheduledAt = new Date();
      await manager.getRepository(StockReplenishmentRequest).save(stockRequest);
    }
  }

  private async validateDraftIntegrity(manager: EntityManager, consolidation: ProductionConsolidation): Promise<void> {
    const sourceDate = await this.sourceDateFor(manager, consolidation);
    const details = await manager.getRepository(ProductionConsolidationDetail).find({
      where: { consolidationId: consolidation.id },
      relations: {
        baseUnit: true,
        presentation: true,
        category: true,
        productionArea: true,
        stockRequestDetail: { request: true },
        sources: { orderDetail: { order: true }, presentation: { product: { baseUnit: true } } },
      },
    });
    if (!details.length) throw new UnprocessableEntityException('El Borrador no contiene detalles consolidados');
    for (const detail of details) {
      if (!detail.presentationId || !detail.presentation) {
        throw new UnprocessableEntityException('Existe un producto sin presentación definida; recalcule la orden antes de emitir');
      }
      if (!detail.scheduledDate || !Number.isInteger(detail.sequence) || detail.sequence <= 0) {
        throw new UnprocessableEntityException('Cada producto debe tener fecha programada y secuencia válidas');
      }
      const area = await this.areaForCategory(manager, detail.categoryId!);
      if (!area) throw new UnprocessableEntityException(`La categoría ${detail.category?.name ?? ''} no tiene un área de Producción activa asignada`);
      detail.productionAreaId = area.id;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      let demandTotal = 0;
      let warehouseTotal = 0;
      let productionTotal = 0;
      for (const source of detail.sources) {
        if (source.orderDetail.order.status !== OrderStatus.CONFIRMED || source.orderDetail.order.requestedDate !== sourceDate) {
          throw new UnprocessableEntityException('Una fuente dejó de ser un pedido Confirmado elegible');
        }
        const factor = Number(source.appliedFactor);
        if (!Number.isFinite(factor) || factor <= 0) throw new UnprocessableEntityException('Existe una fuente sin factor válido');
        const original = Number(source.originalQuantity);
        const reserved = Number(source.reservedQuantity);
        const pending = Number(source.pendingQuantity);
        if (Math.abs(original - reserved - pending) > 0.000001) {
          throw new UnprocessableEntityException('La cantidad solicitada no coincide con las cantidades cubierta y pendiente');
        }
        if (
          decimalForScale(Number(source.orderDetail.requestedQuantity), 6) !== decimalForScale(original, 6)
          || decimalForScale(Number(source.orderDetail.reservedQuantity), 6) !== decimalForScale(reserved, 6)
          || decimalForScale(Number(source.orderDetail.pendingQuantity), 6) !== decimalForScale(pending, 6)
        ) {
          throw new UnprocessableEntityException('Las cantidades reservadas o pendientes del pedido cambiaron después del cálculo');
        }
        const sourceScale = source.presentation.product.baseUnit.decimalScale;
        const expectedDemand = baseContribution(original, factor, sourceScale);
        const expectedWarehouse = baseContribution(reserved, factor, sourceScale);
        const expectedProduction = roundForScale(expectedDemand - expectedWarehouse, sourceScale);
        if (decimalForScale(expectedDemand, sourceScale) !== decimalForScale(Number(source.baseContribution), sourceScale)) {
          throw new UnprocessableEntityException('El aporte en unidad base no coincide con su cantidad y factor');
        }
        if (
          decimalForScale(expectedWarehouse, sourceScale) !== decimalForScale(Number(source.warehouseContribution), sourceScale)
          || decimalForScale(expectedProduction, sourceScale) !== decimalForScale(Number(source.productionContribution), sourceScale)
        ) {
          throw new UnprocessableEntityException('Los aportes de Almacén y Producción no coinciden con la reserva del pedido');
        }
        demandTotal = roundForScale(demandTotal + original, detail.baseUnit.decimalScale);
        warehouseTotal = roundForScale(warehouseTotal + reserved, detail.baseUnit.decimalScale);
        productionTotal = roundForScale(productionTotal + pending, detail.baseUnit.decimalScale);
      }
      if (decimalForScale(demandTotal, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.requestedQuantity), detail.baseUnit.decimalScale)) {
        throw new UnprocessableEntityException('La suma de los pedidos de origen no coincide con el total consolidado');
      }
      if (
        decimalForScale(warehouseTotal, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.warehouseCoveredQuantity), detail.baseUnit.decimalScale)
        || decimalForScale(productionTotal, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.productionRequiredQuantity), detail.baseUnit.decimalScale)
      ) {
        throw new UnprocessableEntityException('El saldo cubierto por Almacén o el faltante de Producción no coincide con sus fuentes');
      }
      const stockRequested = Number(detail.stockRequestedQuantity);
      if (detail.stockRequestDetail) {
        if (
          detail.stockRequestDetail.request.productionConsolidationId !== consolidation.id
          || detail.stockRequestDetail.request.status !== StockReplenishmentRequestStatus.SCHEDULED
          || decimalForScale(Number(detail.stockRequestDetail.additionalStockQuantity), detail.baseUnit.decimalScale)
            !== decimalForScale(stockRequested, detail.baseUnit.decimalScale)
        ) {
          throw new UnprocessableEntityException('La cantidad solicitada para stock no coincide con su solicitud de abastecimiento');
        }
      } else if (stockRequested !== 0) {
        throw new UnprocessableEntityException('Existe una cantidad para stock sin solicitud de abastecimiento asociada');
      }
      const required = Number(detail.productionRequiredQuantity) + stockRequested;
      const planned = Number(detail.plannedQuantity);
      const adjustment = Number(detail.additionalProductionQuantity);
      if (planned < required || decimalForScale(planned - required, detail.baseUnit.decimalScale) !== decimalForScale(adjustment, detail.baseUnit.decimalScale)) {
        throw new UnprocessableEntityException('El plan no coincide con el faltante, la solicitud para stock y el ajuste técnico');
      }
      if (planned <= 0 && !detail.sources.length) {
        throw new UnprocessableEntityException('Una fila sin pedidos debe conservar una solicitud para stock mayor a cero');
      }
    }
  }

  private async sourceDateFor(manager: EntityManager, consolidation: ProductionConsolidation): Promise<string> {
    const stockRequest = await manager.getRepository(StockReplenishmentRequest).findOne({
      where: { productionConsolidationId: consolidation.id },
      select: { id: true, requiredDate: true },
    });
    return stockRequest?.requiredDate ?? consolidation.deliveryDate;
  }

  private lockDeliveryDate(manager: EntityManager, deliveryDate: string): Promise<unknown> {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${deliveryDate}`]);
  }

  private async resolveAreaCategories(
    manager: EntityManager,
    categoryIds: string[],
    currentAreaId?: string,
  ): Promise<ProductCategory[]> {
    if (!categoryIds.length) return [];
    const categories = await manager.getRepository(ProductCategory).find({ where: { id: In(categoryIds) } });
    if (categories.length !== categoryIds.length) throw new UnprocessableEntityException('Una o más categorías no existen');
    if (categories.some((category) => category.status !== RecordStatus.ACTIVE)) {
      throw new ConflictException('No se puede asignar una categoría inactiva a un área de Producción');
    }
    const assigned = await manager.query<Array<{ categoryId: string; areaName: string }>>(
      `SELECT assignment.categoria_id AS "categoryId", area.nombre AS "areaName"
         FROM areas_produccion_categorias assignment
         JOIN areas_produccion area ON area.id = assignment.area_id
        WHERE assignment.categoria_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR assignment.area_id <> $2::uuid)`,
      [categoryIds, currentAreaId ?? null],
    );
    if (assigned.length) throw new ConflictException(`Una categoría ya está asignada al área ${assigned[0].areaName}`);
    return categories;
  }

  private async areaForCategory(manager: EntityManager, categoryId: string): Promise<ProductionArea | null> {
    return manager.getRepository(ProductionArea).createQueryBuilder('area')
      .innerJoinAndSelect('area.categories', 'category', 'category.id = :categoryId', { categoryId })
      .where('area.status = :status', { status: RecordStatus.ACTIVE })
      .getOne();
  }

  private async closeIfCompleted(manager: EntityManager, consolidationId: string, userId: string): Promise<void> {
    const details = await manager.getRepository(ProductionConsolidationDetail).find({ where: { consolidationId } });
    const terminal = [ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT];
    if (
      !details.length
      || details.some((detail) => !terminal.includes(detail.stage))
      || details.some((detail) => Number(detail.receivedQuantity) < Number(detail.plannedQuantity))
    ) return;
    const consolidation = await manager.getRepository(ProductionConsolidation).findOne({ where: { id: consolidationId } });
    if (!consolidation || ![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) return;
    const previousStatus = consolidation.status;
    consolidation.status = ProductionConsolidationStatus.CLOSED;
    consolidation.closedById = userId;
    consolidation.closedAt = new Date();
    await manager.getRepository(ProductionConsolidation).save(consolidation);
    await this.closeStockRequest(manager, consolidationId, userId);
    await this.saveHistory(manager, consolidationId, previousStatus, ProductionConsolidationStatus.CLOSED, ProductionHistoryEvent.CLOSE, userId, 'Orden cerrada automáticamente al completar la recepción de todos los productos');
  }

  private async closeStockRequest(manager: EntityManager, consolidationId: string, userId: string): Promise<void> {
    const request = await manager.getRepository(StockReplenishmentRequest).findOne({
      where: {
        productionConsolidationId: consolidationId,
        status: StockReplenishmentRequestStatus.SCHEDULED,
      },
    });
    if (!request) return;
    request.status = StockReplenishmentRequestStatus.CLOSED;
    request.closedAt = new Date();
    request.closedById = userId;
    request.closeObservation = null;
    await manager.getRepository(StockReplenishmentRequest).save(request);
  }

  private async closeStockRequestIncomplete(
    manager: EntityManager,
    consolidationId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    const request = await manager.getRepository(StockReplenishmentRequest).findOne({
      where: {
        productionConsolidationId: consolidationId,
        status: StockReplenishmentRequestStatus.SCHEDULED,
      },
    });
    if (!request) return;
    request.status = StockReplenishmentRequestStatus.CLOSED_INCOMPLETE;
    request.closedAt = new Date();
    request.closedById = userId;
    request.closeObservation = reason;
    await manager.getRepository(StockReplenishmentRequest).save(request);
  }

  private saveHistory(
    manager: EntityManager,
    consolidationId: string,
    previousStatus: ProductionConsolidationStatus | null,
    newStatus: ProductionConsolidationStatus,
    event: ProductionHistoryEvent,
    userId: string,
    observation: string | null,
  ): Promise<ProductionConsolidationHistory> {
    const repository = manager.getRepository(ProductionConsolidationHistory);
    return repository.save(repository.create({ consolidationId, previousStatus, newStatus, event, userId, observation }));
  }

  private saveAudit(
    manager: EntityManager,
    userId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<AuditEvent> {
    const repository = manager.getRepository(AuditEvent);
    return repository.save(repository.create({
      userId,
      module: 'production',
      action,
      entity: 'consolidaciones_produccion',
      entityId,
      result: 'EXITOSO',
      ipAddress: null,
      metadata,
    }));
  }

}
