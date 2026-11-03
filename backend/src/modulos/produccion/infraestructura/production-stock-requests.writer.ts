import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { StockReplenishmentRequest } from '../../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../../almacen/entidades/inventory.enums';
import { AuditEvent } from '../../seguridad/auditoria/entidades/audit-event.entity';
import { ProductionStockRequestsWritePort } from '../aplicacion/puertos/production-stock-requests-write.port';
@Injectable()
export class TypeOrmProductionStockRequestsWriter extends ProductionStockRequestsWritePort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }
  async returnStockRequest(id: string, actor: ProductionActor, reason: string): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const repository = manager.getRepository(StockReplenishmentRequest);
      const request = await repository
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id })
        .getOne();
      if (!request) throw new ProductionError('missing', 'Solicitud de abastecimiento no encontrada');
      if (request.status !== StockReplenishmentRequestStatus.SENT) {
        throw new ProductionError(
          'conflict',
          'Solo una solicitud Enviada y aún no programada puede devolverse a Almacén',
        );
      }
      request.status = StockReplenishmentRequestStatus.DRAFT;
      request.sentById = null;
      request.sentAt = null;
      request.returnedById = actor.id;
      request.returnedAt = new Date();
      request.returnReason = reason;
      request.productionConsolidationId = null;
      request.scheduledAt = null;
      request.closedAt = null;
      request.closeObservation = null;
      request.closedById = null;
      await repository.save(request);
      const auditRepository = manager.getRepository(AuditEvent);
      await auditRepository.save(
        auditRepository.create({
          userId: actor.id,
          module: 'production',
          action: 'DEVOLVER_SOLICITUD_ABASTECIMIENTO',
          entity: 'solicitudes_abastecimiento',
          entityId: request.id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { requestCode: request.code, reason },
        }),
      );
    });
  }
}
