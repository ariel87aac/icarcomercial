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
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { OrderStatus } from '../orders/entities/order.enums';
import {
  CloseProductionConsolidationDto,
  GenerateProductionConsolidationDto,
  ProductionConsolidationQueryDto,
  RegisterProductionProgressDto,
} from './dto/production.dto';
import { ProductionConsolidationDetail } from './entities/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entities/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entities/production-consolidation-source.entity';
import { ProductionConsolidation } from './entities/production-consolidation.entity';
import { ProductionProgress } from './entities/production-progress.entity';
import {
  ProductionConsolidationStatus,
  ProductionConsolidationType,
  ProductionHistoryEvent,
  ProductionProgressType,
} from './entities/production.enums';
import {
  baseContribution,
  decimalForScale,
  productionDifference,
  roundForScale,
} from './production-calculations';

interface ResolvedSource {
  orderDetail: OrderDetail;
  originalQuantity: number;
  appliedFactor: number;
  baseContribution: number;
  decimalScale: number;
}

interface ConsolidatedGroup {
  productId: string;
  productLineId: string;
  baseUnitId: string;
  decimalScale: number;
  requestedQuantity: number;
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
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.queryConsolidations(
      query,
      actor,
      this.isRequirementsOnly(actor)
        ? [
            ProductionConsolidationStatus.ISSUED,
            ProductionConsolidationStatus.IN_PROGRESS,
            ProductionConsolidationStatus.CLOSED,
          ]
        : undefined,
    );
  }

  async requirements(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
    return this.queryConsolidations(query, actor, [
      ProductionConsolidationStatus.ISSUED,
      ProductionConsolidationStatus.IN_PROGRESS,
      ProductionConsolidationStatus.CLOSED,
    ]);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
    const consolidation = await this.loadConsolidation(id);
    if (this.isRequirementsOnly(actor) && consolidation.status === ProductionConsolidationStatus.DRAFT) {
      throw new ForbiddenException('El Borrador todavía no fue emitido a Producción');
    }
    this.applyLineScope(consolidation, actor);
    return consolidation;
  }

  async generate(
    dto: GenerateProductionConsolidationDto,
    actor: AuthenticatedUser,
    complementary: boolean,
  ): Promise<ProductionConsolidation> {
    this.assertRequestedLine(dto.productLineId, actor);
    const consolidationId = await this.dataSource.transaction(async (manager) => {
      await this.lockDeliveryDate(manager, dto.deliveryDate);
      const consolidationRepository = manager.getRepository(ProductionConsolidation);
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
      } else {
        const existing = await consolidationRepository.findOne({
          where: { deliveryDate: dto.deliveryDate, type: ProductionConsolidationType.MAIN },
        });
        if (existing) throw new ConflictException('La consolidación principal ya existe; utilice recálculo o una complementaria');
      }

      const ids = await this.eligibleOrderDetailIds(manager, dto.deliveryDate, dto.productLineId, actor);
      if (!ids.length) throw new ConflictException('No existen detalles Confirmados elegibles sin asignación para esta fecha');
      const versionResult = await consolidationRepository
        .createQueryBuilder('consolidation')
        .select('COALESCE(MAX(consolidation.version), 0)', 'maximum')
        .where('consolidation.deliveryDate = :deliveryDate', { deliveryDate: dto.deliveryDate })
        .getRawOne<{ maximum: string }>();
      const consolidation = await consolidationRepository.save(consolidationRepository.create({
        deliveryDate: dto.deliveryDate,
        version: Number(versionResult?.maximum ?? 0) + 1,
        type: complementary ? ProductionConsolidationType.COMPLEMENTARY : ProductionConsolidationType.MAIN,
        status: ProductionConsolidationStatus.DRAFT,
        generatedById: actor.id,
        emittedById: null,
        emittedAt: null,
        closedById: null,
        closedAt: null,
      }));
      const orderDetails = await this.loadOrderDetails(manager, ids);
      await this.rebuildDraft(manager, consolidation, orderDetails);
      await this.saveHistory(manager, consolidation.id, null, ProductionConsolidationStatus.DRAFT, ProductionHistoryEvent.GENERATION, actor.id, complementary ? 'Consolidación complementaria generada' : 'Consolidación principal generada');
      await this.saveAudit(manager, actor.id, 'GENERAR_CONSOLIDACION', consolidation.id, {
        deliveryDate: dto.deliveryDate,
        version: consolidation.version,
        type: consolidation.type,
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
      await this.assertConsolidationScope(manager, id, actor);
      await this.lockDeliveryDate(manager, consolidation.deliveryDate);
      const currentRows = await manager.query<{ id: string }[]>(
        `SELECT source.detalle_pedido_id AS id
           FROM consolidaciones_origen source
           JOIN consolidaciones_detalle detail ON detail.id = source.detalle_consolidado_id
           JOIN pedidos_detalle order_detail ON order_detail.id = source.detalle_pedido_id
           JOIN pedidos orders ON orders.id = order_detail.pedido_id
          WHERE detail.consolidacion_id = $1
            AND orders.estado = 'CONFIRMADO'
            AND orders.fecha_solicitada = $2`,
        [id, consolidation.deliveryDate],
      );
      const newIds = await this.eligibleOrderDetailIds(manager, consolidation.deliveryDate, undefined, actor);
      const ids = [...new Set([...currentRows.map((row) => row.id), ...newIds])];
      if (!ids.length) throw new ConflictException('El Borrador no conserva fuentes Confirmadas elegibles');
      const orderDetails = await this.loadOrderDetails(manager, ids);
      await this.rebuildDraft(manager, consolidation, orderDetails);
      await this.saveHistory(manager, id, ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.DRAFT, ProductionHistoryEvent.RECALCULATION, actor.id, 'Borrador recalculado');
      await this.saveAudit(manager, actor.id, 'RECALCULAR_CONSOLIDACION', id, { sourceCount: ids.length });
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
      await this.assertConsolidationScope(manager, id, actor);
      await this.lockDeliveryDate(manager, consolidation.deliveryDate);
      await this.validateDraftIntegrity(manager, consolidation);
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
    this.applyDetailLineScope(builder, actor, 'detail');
    return builder.getMany();
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
      this.assertRequestedLine(detail.productLineId, actor);
      const scale = detail.baseUnit.decimalScale;
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
      detail.difference = decimalForScale(productionDifference(prepared, Number(detail.requestedQuantity), scale), scale);
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
      for (const detail of details) this.assertRequestedLine(detail.productLineId, actor);
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
        WHEN 'EMISION' THEN 3
        WHEN 'INICIO' THEN 4
        WHEN 'AVANCE' THEN 5
        WHEN 'CIERRE' THEN 6
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
      .select('consolidation.deliveryDate', 'deliveryDate')
      .addSelect('consolidation.version', 'version')
      .addSelect('consolidation.type', 'type')
      .addSelect('consolidation.status', 'status')
      .addSelect('productLine.id', 'productLineId')
      .addSelect('productLine.name', 'productLineName')
      .addSelect('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('baseUnit.id', 'baseUnitId')
      .addSelect('baseUnit.abbreviation', 'baseUnitAbbreviation')
      .addSelect('SUM(detail.requestedQuantity)', 'requestedQuantity')
      .addSelect('SUM(detail.preparedQuantity)', 'preparedQuantity')
      .addSelect('GREATEST(SUM(detail.requestedQuantity) - SUM(detail.preparedQuantity), 0)', 'pendingQuantity')
      .addSelect('SUM(detail.difference)', 'difference')
      .groupBy('consolidation.deliveryDate')
      .addGroupBy('consolidation.version')
      .addGroupBy('consolidation.type')
      .addGroupBy('consolidation.status')
      .addGroupBy('productLine.id')
      .addGroupBy('productLine.name')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('baseUnit.id')
      .addGroupBy('baseUnit.abbreviation')
      .orderBy('consolidation.deliveryDate', 'DESC')
      .addOrderBy('productLine.name', 'ASC')
      .addOrderBy('product.name', 'ASC');
    this.applyFilters(builder, query, actor, 'consolidation', 'detail');
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
      .loadRelationCountAndMap('consolidation.detailCount', 'consolidation.details')
      .distinct(true)
      .orderBy('consolidation.deliveryDate', 'DESC')
      .addOrderBy('consolidation.version', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (statuses) builder.andWhere('consolidation.status IN (:...allowedStatuses)', { allowedStatuses: statuses });
    this.applyFilters(builder, query, actor);
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  private applyFilters<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    query: ProductionConsolidationQueryDto,
    actor: AuthenticatedUser,
    consolidationAlias = 'consolidation',
    detailAlias?: string,
  ): void {
    if (query.deliveryDate) builder.andWhere(`${consolidationAlias}.deliveryDate = :deliveryDate`, { deliveryDate: query.deliveryDate });
    if (query.version) builder.andWhere(`${consolidationAlias}.version = :version`, { version: query.version });
    if (query.type) builder.andWhere(`${consolidationAlias}.type = :type`, { type: query.type });
    if (query.status) builder.andWhere(`${consolidationAlias}.status = :status`, { status: query.status });
    const lines = this.allowedLines(actor);
    const requestedLine = query.productLineId;
    this.assertRequestedLine(requestedLine, actor);
    const lineIds = requestedLine ? [requestedLine] : lines;
    if (detailAlias) {
      if (lineIds.length) builder.andWhere(`${detailAlias}.productLineId IN (:...lineIds)`, { lineIds });
      if (query.productId) builder.andWhere(`${detailAlias}.productId = :productId`, { productId: query.productId });
    } else if (lineIds.length || query.productId) {
      const clauses = [`scope_detail.consolidacion_id = ${consolidationAlias}.id`];
      if (lineIds.length) clauses.push('scope_detail.linea_productiva_id IN (:...lineIds)');
      if (query.productId) clauses.push('scope_detail.producto_id = :productId');
      builder.andWhere(`EXISTS (SELECT 1 FROM consolidaciones_detalle scope_detail WHERE ${clauses.join(' AND ')})`, {
        ...(lineIds.length ? { lineIds } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      });
    }
  }

  private async loadConsolidation(id: string): Promise<ProductionConsolidation> {
    const consolidation = await this.consolidationRepository.findOne({
      where: { id },
      relations: {
        generatedBy: true,
        emittedBy: true,
        closedBy: true,
        details: {
          product: true,
          productLine: true,
          baseUnit: true,
          sources: { presentation: true, orderDetail: { order: { customer: true } } },
          progress: { user: true },
        },
      },
    });
    if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
    consolidation.details.sort((left, right) =>
      left.productLine.name.localeCompare(right.productLine.name) || left.product.name.localeCompare(right.product.name));
    for (const detail of consolidation.details) {
      detail.sources?.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      detail.progress?.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
    }
    return consolidation;
  }

  private applyLineScope(consolidation: ProductionConsolidation, actor: AuthenticatedUser): void {
    const lines = this.allowedLines(actor);
    if (!lines.length) return;
    consolidation.details = consolidation.details.filter((detail) => lines.includes(detail.productLineId));
    if (!consolidation.details.length) throw new ForbiddenException('La consolidación no pertenece a una línea autorizada');
  }

  private applyDetailLineScope<T extends ObjectLiteral>(builder: SelectQueryBuilder<T>, actor: AuthenticatedUser, alias: string): void {
    const lines = this.allowedLines(actor);
    if (lines.length) builder.andWhere(`${alias}.productLineId IN (:...authorizedLineIds)`, { authorizedLineIds: lines });
  }

  private allowedLines(actor: AuthenticatedUser): string[] {
    return actor.productLineIds ?? [];
  }

  private isRequirementsOnly(actor: AuthenticatedUser): boolean {
    return actor.permissions.includes('production.requirements.read')
      && !actor.permissions.includes('production.consolidations.create');
  }

  private assertRequestedLine(productLineId: string | undefined, actor: AuthenticatedUser): void {
    const lines = this.allowedLines(actor);
    if (productLineId && lines.length && !lines.includes(productLineId)) {
      throw new ForbiddenException('La línea productiva no está autorizada para el usuario');
    }
  }

  private async assertConsolidationScope(
    manager: EntityManager,
    consolidationId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const lines = this.allowedLines(actor);
    if (!lines.length) return;
    const rows = await manager.getRepository(ProductionConsolidationDetail)
      .createQueryBuilder('detail')
      .select('DISTINCT detail.productLineId', 'productLineId')
      .where('detail.consolidationId = :consolidationId', { consolidationId })
      .getRawMany<{ productLineId: string }>();
    if (rows.some((row) => !lines.includes(row.productLineId))) {
      throw new ForbiddenException('La consolidación contiene líneas productivas no autorizadas para el usuario');
    }
  }

  private async eligibleOrderDetailIds(
    manager: EntityManager,
    deliveryDate: string,
    productLineId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<string[]> {
    const values: unknown[] = [deliveryDate];
    const filters = [
      `orders.estado = 'CONFIRMADO'`,
      'orders.fecha_solicitada = $1',
      'source.id IS NULL',
    ];
    if (productLineId) {
      values.push(productLineId);
      filters.push(`product.linea_productiva_id = $${values.length}`);
    }
    const lines = this.allowedLines(actor);
    if (lines.length) {
      values.push(lines);
      filters.push(`product.linea_productiva_id = ANY($${values.length}::uuid[])`);
    }
    const rows = await manager.query<{ id: string }[]>(
      `SELECT order_detail.id
         FROM pedidos_detalle order_detail
         JOIN pedidos orders ON orders.id = order_detail.pedido_id
         JOIN presentaciones_producto presentation ON presentation.id = order_detail.presentacion_id
         JOIN productos product ON product.id = presentation.producto_id
         LEFT JOIN consolidaciones_origen source ON source.detalle_pedido_id = order_detail.id
        WHERE ${filters.join(' AND ')}
        ORDER BY order_detail.id
        FOR UPDATE OF order_detail`,
      values,
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
      .leftJoinAndSelect('product.productLine', 'productLine')
      .leftJoinAndSelect('product.baseUnit', 'baseUnit')
      .where('detail.id IN (:...ids)', { ids })
      .orderBy('detail.id', 'ASC')
      .getMany();
  }

  private async rebuildDraft(
    manager: EntityManager,
    consolidation: ProductionConsolidation,
    orderDetails: OrderDetail[],
  ): Promise<void> {
    if (!orderDetails.length) throw new UnprocessableEntityException('No existen fuentes válidas para consolidar');
    const groups = new Map<string, ConsolidatedGroup>();
    for (const orderDetail of orderDetails) {
      if (orderDetail.order.status !== OrderStatus.CONFIRMED || orderDetail.order.requestedDate !== consolidation.deliveryDate) {
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
      const scale = product.baseUnit.decimalScale;
      const original = Number(orderDetail.requestedQuantity);
      const contribution = baseContribution(original, factor, scale);
      if (!Number.isFinite(original) || original <= 0 || contribution <= 0) {
        throw new UnprocessableEntityException('La conversión produjo una cantidad no válida');
      }
      const key = `${product.productLineId}:${product.id}:${product.baseUnitId}`;
      const group = groups.get(key) ?? {
        productId: product.id,
        productLineId: product.productLineId,
        baseUnitId: product.baseUnitId,
        decimalScale: scale,
        requestedQuantity: 0,
        sources: [],
      };
      group.requestedQuantity = roundForScale(group.requestedQuantity + contribution, scale);
      group.sources.push({
        orderDetail,
        originalQuantity: original,
        appliedFactor: factor,
        baseContribution: contribution,
        decimalScale: scale,
      });
      groups.set(key, group);
    }
    const detailRepository = manager.getRepository(ProductionConsolidationDetail);
    const existing = await detailRepository.find({ where: { consolidationId: consolidation.id } });
    if (existing.length) await detailRepository.remove(existing);
    for (const group of groups.values()) {
      const detail = await detailRepository.save(detailRepository.create({
        consolidationId: consolidation.id,
        productId: group.productId,
        productLineId: group.productLineId,
        baseUnitId: group.baseUnitId,
        requestedQuantity: decimalForScale(group.requestedQuantity, group.decimalScale),
        preparedQuantity: decimalForScale(0, group.decimalScale),
        difference: decimalForScale(-group.requestedQuantity, group.decimalScale),
      }));
      await manager.getRepository(ProductionConsolidationSource).save(group.sources.map((source) =>
        manager.getRepository(ProductionConsolidationSource).create({
          consolidatedDetailId: detail.id,
          orderDetailId: source.orderDetail.id,
          presentationId: source.orderDetail.presentationId,
          originalQuantity: decimalForScale(source.originalQuantity, source.decimalScale),
          appliedFactor: source.appliedFactor.toFixed(6),
          baseContribution: decimalForScale(source.baseContribution, source.decimalScale),
        })));
    }
  }

  private async validateDraftIntegrity(manager: EntityManager, consolidation: ProductionConsolidation): Promise<void> {
    const details = await manager.getRepository(ProductionConsolidationDetail).find({
      where: { consolidationId: consolidation.id },
      relations: { baseUnit: true, sources: { orderDetail: { order: true }, presentation: true } },
    });
    if (!details.length) throw new UnprocessableEntityException('El Borrador no contiene detalles consolidados');
    for (const detail of details) {
      if (!detail.sources.length) throw new UnprocessableEntityException('Existe un detalle consolidado sin pedidos de origen');
      let total = 0;
      for (const source of detail.sources) {
        if (source.orderDetail.order.status !== OrderStatus.CONFIRMED || source.orderDetail.order.requestedDate !== consolidation.deliveryDate) {
          throw new UnprocessableEntityException('Una fuente dejó de ser un pedido Confirmado elegible');
        }
        const factor = Number(source.appliedFactor);
        if (!Number.isFinite(factor) || factor <= 0) throw new UnprocessableEntityException('Existe una fuente sin factor válido');
        const expected = baseContribution(Number(source.originalQuantity), factor, detail.baseUnit.decimalScale);
        if (decimalForScale(expected, detail.baseUnit.decimalScale) !== decimalForScale(Number(source.baseContribution), detail.baseUnit.decimalScale)) {
          throw new UnprocessableEntityException('El aporte en unidad base no coincide con su cantidad y factor');
        }
        total = roundForScale(total + expected, detail.baseUnit.decimalScale);
      }
      if (decimalForScale(total, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.requestedQuantity), detail.baseUnit.decimalScale)) {
        throw new UnprocessableEntityException('La suma de los pedidos de origen no coincide con el total consolidado');
      }
    }
  }

  private lockDeliveryDate(manager: EntityManager, deliveryDate: string): Promise<unknown> {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${deliveryDate}`]);
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
