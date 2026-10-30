import { workflowTransaction } from '../pedidos/order-workflow';
import { attachOrderWorkflow, coverageForOrders } from '../pedidos/order-workflow';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { CancelPreparationDto, ConfirmPreparationDto, CreatePreparationDto, PreparationQueryDto, RegisterPreparationProgressDto } from './dto/preparation.dto';
import { OrderPreparationDetail } from './entidades/order-preparation-detail.entity';
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
