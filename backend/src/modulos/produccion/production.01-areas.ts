import { workflowTransaction } from '../pedidos/order-workflow';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { productionTrackingSummary } from './production-tracking';
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
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductCategory } from '../productos/catalogo/entidades/product-category.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryMovementType } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { StockReplenishmentRequestDetail } from '../almacen/entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from '../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../almacen/entidades/inventory.enums';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
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
import { ProductionArea } from './entidades/production-area.entity';
import { ProductionConsolidationDetail } from './entidades/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entidades/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entidades/production-consolidation-source.entity';
import { ProductionConsolidation } from './entidades/production-consolidation.entity';
import { ProductionProgress } from './entidades/production-progress.entity';
import { ProductionDelivery } from './entidades/production-delivery.entity';
import {
  ProductionConsolidationStatus,
  ProductionConsolidationType,
  ProductionDeliveryStatus,
  ProductionDetailStage,
  ProductionHistoryEvent,
  ProductionProgressType,
} from './entidades/production.enums';
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
import { ProductionServiceParte02 } from './production.02-generate';

export abstract class ProductionServiceParte01 extends ProductionServiceParte02 {
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
      return workflowTransaction(this.dataSource, async (manager) => {
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
      return workflowTransaction(this.dataSource, async (manager) => {
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

  async tracking(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
      const page = await this.findAll(query, actor);
      if (!page.data.length) return page;
      const areaIds = this.productionAreaScope(actor);
      const details = await this.detailRepository.find({
        loadEagerRelations: false,
        where: {
          consolidationId: In(page.data.map((order) => order.id)),
          ...(areaIds !== null ? { productionAreaId: In(areaIds) } : {}),
        },
        relations: { deliveries: true },
      });
      const grouped = new Map<string, ProductionConsolidationDetail[]>();
      for (const detail of details) {
        const group = grouped.get(detail.consolidationId) ?? [];
        group.push(detail);
        grouped.set(detail.consolidationId, group);
      }
      return {
        ...page,
        data: page.data.map((order) => ({
          ...order,
          tracking: productionTrackingSummary(grouped.get(order.id) ?? []),
        })),
      };
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
}
