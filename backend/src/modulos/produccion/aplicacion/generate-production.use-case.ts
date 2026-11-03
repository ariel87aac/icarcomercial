import { GenerateProductionWritePort } from './puertos/generate-production-write.port';
import type { ProductionActor } from './production-actor';
import { GenerateProductionConsolidationCommand } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import { ProductionQueriesService } from './production-queries.service';

export class GenerateProductionUseCase {
  constructor(
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: GenerateProductionWritePort,
  ) {}

  async generate(
    dto: GenerateProductionConsolidationCommand,
    actor: ProductionActor,
    complementary: boolean,
  ): Promise<ProductionConsolidationView> {
    const consolidationId = await this.writer.generate(dto, actor, complementary);
    return this.productionQueriesService.findOne(consolidationId, actor);
  }

  async recalculate(id: string, actor: ProductionActor): Promise<ProductionConsolidationView> {
    await this.writer.recalculate(id, actor);
    return this.productionQueriesService.findOne(id, actor);
  }
}
