import { ProductionPlanWritePort } from './puertos/production-plan-write.port';
import type { ProductionActor } from './production-actor';
import { AdjustProductionPlanCommand, ScheduleProductionDetailCommand } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import { ProductionQueriesService } from './production-queries.service';

export class ProductionPlanService {
  constructor(
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: ProductionPlanWritePort,
  ) {}

  async adjustPlan(
    id: string,
    detailId: string,
    dto: AdjustProductionPlanCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    await this.writer.adjustPlan(id, detailId, dto, actor);
    return this.productionQueriesService.findOne(id, actor);
  }

  async scheduleDetail(
    id: string,
    detailId: string,
    dto: ScheduleProductionDetailCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    await this.writer.scheduleDetail(id, detailId, dto, actor);
    return this.productionQueriesService.findOne(id, actor);
  }
}
