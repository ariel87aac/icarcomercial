import { EmitProductionWritePort } from './puertos/emit-production-write.port';
import type { ProductionActor } from './production-actor';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import { ProductionQueriesService } from './production-queries.service';

export class EmitProductionUseCase {
  constructor(
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: EmitProductionWritePort,
  ) {}

  async emit(id: string, actor: ProductionActor): Promise<ProductionConsolidationView> {
    await this.writer.emit(id, actor);
    return this.productionQueriesService.findOne(id, actor);
  }
}
