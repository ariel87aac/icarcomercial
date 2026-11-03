import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { OrderPreparation } from './entidades/order-preparation.entity';
import { PreparationHistory } from './entidades/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from './entidades/preparation.enums';
import { PreparationServiceBase } from './preparation.base';

export abstract class PreparationServiceParte04 extends PreparationServiceBase {
  protected async lockPreparation(manager: EntityManager, id: string): Promise<OrderPreparation> {
      const preparation = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
        .setLock('pessimistic_write')
        .where('preparation.id = :id', { id })
        .getOne();
      if (!preparation) throw new NotFoundException('Preparación no encontrada');
      return preparation;
    }

  protected async saveHistory(
      manager: EntityManager,
      preparationId: string,
      previousStatus: PreparationStatus | null,
      newStatus: PreparationStatus,
      event: PreparationEvent,
      userId: string,
      observation: string,
      metadata: Record<string, unknown> = {},
    ): Promise<void> {
      const repository = manager.getRepository(PreparationHistory);
      await repository.save(repository.create({ preparationId, previousStatus, newStatus, event, userId, observation, metadata }));
    }

  protected async saveAudit(manager: EntityManager, userId: string, action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
      const repository = manager.getRepository(AuditEvent);
      await repository.save(repository.create({ userId, module: 'preparations', action, entity: 'preparaciones_pedido', entityId, result: 'EXITOSO', ipAddress: null, metadata }));
    }
}
