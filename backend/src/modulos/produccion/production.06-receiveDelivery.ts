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
import { ProductionServiceParte07 } from './production.07-cancelDetail';

export abstract class ProductionServiceParte06 extends ProductionServiceParte07 {
  async receiveDelivery(id: string, dto: ReceiveProductionDeliveryDto, actor: AuthenticatedUser): Promise<ProductionDelivery> {
      await workflowTransaction(this.dataSource, async (manager) => {
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
      await this.trackingService.refreshStock(`stock.production:${id}`);
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
      await workflowTransaction(this.dataSource, async (manager) => {
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
}
