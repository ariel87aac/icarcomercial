import { CloseProductionWritePort } from './puertos/close-production-write.port';
import type { ProductionActor } from './production-actor';
import { ProductionReasonCommand, CloseProductionConsolidationCommand } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import { ProductionAccessPolicy } from './production-access.policy';
import { ProductionQueriesService } from './production-queries.service';

export class CloseProductionUseCase {
  constructor(
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: CloseProductionWritePort,
  ) {}

  async closeIncomplete(
    id: string,
    dto: ProductionReasonCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    const reason = this.productionAccessPolicy.requiredReason(dto.reason);
    await this.writer.closeIncomplete(id, actor, reason);
    return this.productionQueriesService.findOne(id, actor);
  }

  async close(
    id: string,
    dto: CloseProductionConsolidationCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    await this.writer.close(id, dto, actor);
    return this.productionQueriesService.findOne(id, actor);
  }
}
