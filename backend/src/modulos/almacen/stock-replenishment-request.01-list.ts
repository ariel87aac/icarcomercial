import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { ProductionArea } from '../produccion/entidades/production-area.entity';
import {
  CreateStockReplenishmentRequestDto,
  SaveStockReplenishmentRequestDto,
  StockReplenishmentPlanQueryDto,
  StockReplenishmentRequestQueryDto,
} from './dto/inventory.dto';
import { StockReplenishmentRequestDetail } from './entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from './entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from './entidades/inventory.enums';
import { projectedAvailableQuantity } from './inventory-calculations';

interface StockRequestMetrics {
  presentationId: string;
  physicalQuantity: string;
  reservedQuantity: string;
  demandQuantity: string;
  shortageQuantity: string;
}
import { StockReplenishmentRequestServiceParte02 } from './stock-replenishment-request.02-save';

export abstract class StockReplenishmentRequestServiceParte01 extends StockReplenishmentRequestServiceParte02 {
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
}
