import { assertRecalculationAllowed } from '../dominio/production-lifecycle.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { In, DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { GenerateProductionConsolidationCommand } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import {
  ProductionConsolidationStatus,
  ProductionConsolidationType,
  ProductionHistoryEvent,
} from '../dominio/production.enums';
import { StockReplenishmentRequest } from '../../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../../almacen/entidades/inventory.enums';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionSourcesReader } from './production-sources-reader';
import { ProductionDraftBuilder } from './production-draft-builder';
import { ProductionDraftValidator } from './production-draft-validator';
import { ProductionTransactionSupport } from './production-transaction-support';
import { GenerateProductionWritePort } from '../aplicacion/puertos/generate-production-write.port';
@Injectable()
export class TypeOrmGenerateProductionWriter extends GenerateProductionWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
    private readonly productionSourcesReader: ProductionSourcesReader,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionDraftBuilder: ProductionDraftBuilder,
    private readonly productionDraftValidator: ProductionDraftValidator,
  ) {
    super();
  }
  async generate(
    dto: GenerateProductionConsolidationCommand,
    actor: ProductionActor,
    complementary: boolean,
  ): Promise<string> {
    return workflowTransaction(this.dataSource, async (manager) => {
      await this.productionTransactionSupport.lockDeliveryDate(manager, dto.deliveryDate);
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
        if (!requestedSource) throw new ProductionError('missing', 'Solicitud de abastecimiento no encontrada');
        if (requestedSource.status !== StockReplenishmentRequestStatus.SENT) {
          throw new ProductionError(
            'conflict',
            'La solicitud de abastecimiento ya no se encuentra pendiente de programación',
          );
        }
        sourceDate = requestedSource.requiredDate;
        if (sourceDate !== dto.deliveryDate)
          await this.productionTransactionSupport.lockDeliveryDate(manager, sourceDate);
      } else {
        const pendingRequests = await stockRequestRepository.find({
          where: { requiredDate: dto.deliveryDate, status: StockReplenishmentRequestStatus.SENT },
          order: { code: 'ASC' },
        });
        if (pendingRequests.length > 1) {
          throw new ProductionError(
            'inconsistent',
            'Existen varias solicitudes de abastecimiento para esta fecha; genere cada orden desde Solicitudes pendientes',
          );
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
          throw new ProductionError(
            'conflict',
            'Debe existir una versión emitida antes de generar una consolidación complementaria',
          );
        }
        const draft = await consolidationRepository.findOne({
          where: {
            deliveryDate: dto.deliveryDate,
            type: ProductionConsolidationType.COMPLEMENTARY,
            status: ProductionConsolidationStatus.DRAFT,
          },
        });
        if (draft)
          throw new ProductionError(
            'conflict',
            'Ya existe una consolidación complementaria en Borrador para esta fecha',
          );
      } else if (stockRequestId && mainConsolidation) {
        generateComplementary = true;
      } else {
        if (mainConsolidation)
          throw new ProductionError(
            'conflict',
            'La consolidación principal ya existe; utilice recálculo o una complementaria',
          );
      }

      const ids = await this.productionSourcesReader.eligibleOrderDetailIds(manager, sourceDate);
      const preparationDeadlineAt = ids.length
        ? await this.productionSourcesReader.preparationDeadline(manager, ids)
        : null;
      const versionResult = await consolidationRepository
        .createQueryBuilder('consolidation')
        .select('COALESCE(MAX(consolidation.version), 0)', 'maximum')
        .where('consolidation.deliveryDate = :deliveryDate', { deliveryDate: dto.deliveryDate })
        .getRawOne<{ maximum: string }>();
      const consolidation = await consolidationRepository.save(
        consolidationRepository.create({
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
        }),
      );
      const orderDetails = ids.length ? await this.productionSourcesReader.loadOrderDetails(manager, ids) : [];
      consolidation.preparationDeadlineAt = orderDetails.length
        ? this.productionAccessPolicy.earliestPreparation(orderDetails)
        : null;
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.productionDraftBuilder.rebuildDraft(manager, consolidation, orderDetails, stockRequestId);
      const plannedDetailCount = await manager.getRepository(ProductionConsolidationDetail).count({
        where: { consolidationId: consolidation.id },
      });
      if (!plannedDetailCount) {
        throw new ProductionError(
          'inconsistent',
          'No existen pedidos confirmados ni una solicitud de abastecimiento enviada para esta fecha',
        );
      }
      await this.productionTransactionSupport.saveHistory(
        manager,
        consolidation.id,
        null,
        ProductionConsolidationStatus.DRAFT,
        ProductionHistoryEvent.GENERATION,
        actor.id,
        orderDetails.length
          ? generateComplementary
            ? 'Orden complementaria generada desde pedidos confirmados'
            : 'Orden de Producción generada desde pedidos confirmados'
          : 'Orden de Producción generada desde una solicitud de abastecimiento para stock',
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'GENERAR_CONSOLIDACION', consolidation.id, {
        deliveryDate: dto.deliveryDate,
        sourceDate,
        version: consolidation.version,
        type: consolidation.type,
        stockRequestId: stockRequestId ?? null,
        sourceCount: ids.length,
      });
      return consolidation.id;
    });
  }
  async recalculate(id: string, actor: ProductionActor): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Consolidación no encontrada');
      assertRecalculationAllowed(consolidation.status);
      await this.productionTransactionSupport.lockDeliveryDate(manager, consolidation.deliveryDate);
      const sourceDate = await this.productionDraftValidator.sourceDateFor(manager, consolidation);
      if (sourceDate !== consolidation.deliveryDate)
        await this.productionTransactionSupport.lockDeliveryDate(manager, sourceDate);
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
      const newIds = await this.productionSourcesReader.eligibleOrderDetailIds(manager, sourceDate);
      const ids = [...new Set([...currentRows.map((row) => row.id), ...newIds])];
      const orderDetails = ids.length ? await this.productionSourcesReader.loadOrderDetails(manager, ids) : [];
      await this.productionDraftBuilder.rebuildDraft(manager, consolidation, orderDetails);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        ProductionConsolidationStatus.DRAFT,
        ProductionConsolidationStatus.DRAFT,
        ProductionHistoryEvent.RECALCULATION,
        actor.id,
        'Borrador recalculado',
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'RECALCULAR_CONSOLIDACION', id, {
        sourceCount: ids.length,
      });
    });
  }
}
