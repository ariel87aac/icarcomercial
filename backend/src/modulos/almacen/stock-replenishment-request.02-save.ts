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
import { StockReplenishmentRequestServiceParte03 } from './stock-replenishment-request.03-metrics';

export abstract class StockReplenishmentRequestServiceParte02 extends StockReplenishmentRequestServiceParte03 {
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
}
