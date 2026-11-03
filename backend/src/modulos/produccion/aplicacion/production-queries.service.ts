import { ProductionQueriesPort } from './puertos/production-queries-read.port';
import type { ProductionActor } from './production-actor';
import { ProductionConsolidationQuery } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import type { ProductionConsolidationSourceView } from './modelos/production-consolidation-source.view';
import type { ProductionConsolidationHistoryView } from './modelos/production-consolidation-history.view';

export class ProductionQueriesService {
  constructor(private readonly reader: ProductionQueriesPort) {}

  async findAll(query: ProductionConsolidationQuery, actor: ProductionActor) {
    return this.reader.findAll(query, actor);
  }

  async requirements(query: ProductionConsolidationQuery, actor: ProductionActor) {
    return this.reader.requirements(query, actor);
  }

  async tracking(query: ProductionConsolidationQuery, actor: ProductionActor) {
    return this.reader.tracking(query, actor);
  }

  async findOne(id: string, actor: ProductionActor): Promise<ProductionConsolidationView> {
    return this.reader.findOne(id, actor);
  }

  async plantBoard(
    productionAreaId: string | undefined,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView[]> {
    return this.reader.plantBoard(productionAreaId, actor);
  }

  async sources(id: string, actor: ProductionActor): Promise<ProductionConsolidationSourceView[]> {
    return this.reader.sources(id, actor);
  }

  async history(id: string, actor: ProductionActor): Promise<ProductionConsolidationHistoryView[]> {
    return this.reader.history(id, actor);
  }
}
