import { CancelProductionWritePort } from './puertos/cancel-production-write.port';
import type { ProductionActor } from './production-actor';
import { ProductionReasonCommand } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import { ProductionAccessPolicy } from './production-access.policy';
import { ProductionQueriesService } from './production-queries.service';

export class CancelProductionUseCase {
  constructor(
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: CancelProductionWritePort,
  ) {}

  async cancelDetail(
    id: string,
    detailId: string,
    dto: ProductionReasonCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    const reason = this.productionAccessPolicy.requiredReason(dto.reason);
    await this.writer.cancelDetail(id, detailId, actor, reason);
    return this.productionQueriesService.findOne(id, actor);
  }

  async cancel(id: string, dto: ProductionReasonCommand, actor: ProductionActor): Promise<ProductionConsolidationView> {
    const reason = this.productionAccessPolicy.requiredReason(dto.reason);
    await this.writer.cancel(id, actor, reason);
    return this.productionQueriesService.findOne(id, actor);
  }
}
