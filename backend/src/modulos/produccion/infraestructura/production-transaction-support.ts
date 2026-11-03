import { isProductionReceived } from '../dominio/production-close.rules';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { ProductionConsolidationStatus, ProductionHistoryEvent } from '../dominio/production.enums';
import { StockReplenishmentRequest } from '../../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../../almacen/entidades/inventory.enums';
import { AuditEvent } from '../../seguridad/auditoria/entidades/audit-event.entity';
import { ProductionConsolidationHistory } from '../entidades/production-consolidation-history.entity';

@Injectable()
export class ProductionTransactionSupport {
  constructor() {}

  lockDeliveryDate(manager: EntityManager, deliveryDate: string): Promise<unknown> {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${deliveryDate}`]);
  }

  async closeIfCompleted(manager: EntityManager, consolidationId: string, userId: string): Promise<void> {
    const details = await manager.getRepository(ProductionConsolidationDetail).find({ where: { consolidationId } });
    if (!isProductionReceived(details)) return;
    const consolidation = await manager
      .getRepository(ProductionConsolidation)
      .findOne({ where: { id: consolidationId } });
    if (
      !consolidation ||
      ![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)
    )
      return;
    const previousStatus = consolidation.status;
    consolidation.status = ProductionConsolidationStatus.CLOSED;
    consolidation.closedById = userId;
    consolidation.closedAt = new Date();
    await manager.getRepository(ProductionConsolidation).save(consolidation);
    await this.closeStockRequest(manager, consolidationId, userId);
    await this.saveHistory(
      manager,
      consolidationId,
      previousStatus,
      ProductionConsolidationStatus.CLOSED,
      ProductionHistoryEvent.CLOSE,
      userId,
      'Orden cerrada automáticamente al completar la recepción de todos los productos',
    );
  }

  async closeStockRequest(manager: EntityManager, consolidationId: string, userId: string): Promise<void> {
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

  async closeStockRequestIncomplete(
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

  saveHistory(
    manager: EntityManager,
    consolidationId: string,
    previousStatus: ProductionConsolidationStatus | null,
    newStatus: ProductionConsolidationStatus,
    event: ProductionHistoryEvent,
    userId: string,
    observation: string | null,
  ): Promise<ProductionConsolidationHistory> {
    const repository = manager.getRepository(ProductionConsolidationHistory);
    return repository.save(
      repository.create({ consolidationId, previousStatus, newStatus, event, userId, observation }),
    );
  }

  saveAudit(
    manager: EntityManager,
    userId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<AuditEvent> {
    const repository = manager.getRepository(AuditEvent);
    return repository.save(
      repository.create({
        userId,
        module: 'production',
        action,
        entity: 'consolidaciones_produccion',
        entityId,
        result: 'EXITOSO',
        ipAddress: null,
        metadata,
      }),
    );
  }
}
