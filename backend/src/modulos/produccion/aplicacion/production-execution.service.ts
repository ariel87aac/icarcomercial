import { ProductionExecutionWritePort } from './puertos/production-execution-write.port';
import type { ProductionActor } from './production-actor';
import { RegisterProductionProgressCommand } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import { ProductionQueriesService } from './production-queries.service';

export class ProductionExecutionService {
  constructor(
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: ProductionExecutionWritePort,
  ) {}

  async startDetail(id: string, detailId: string, actor: ProductionActor): Promise<ProductionConsolidationView> {
    await this.writer.startDetail(id, detailId, actor);
    return this.productionQueriesService.findOne(id, actor);
  }

  async registerProgress(
    id: string,
    dto: RegisterProductionProgressCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    await this.writer.registerProgress(id, dto, actor);
    return this.productionQueriesService.findOne(id, actor);
  }
}
