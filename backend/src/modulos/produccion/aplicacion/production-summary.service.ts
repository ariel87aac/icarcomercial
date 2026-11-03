import { ProductionSummaryPort } from './puertos/production-summary-read.port';
import type { ProductionActor } from './production-actor';
import { ProductionConsolidationQuery } from './production-inputs';

export class ProductionSummaryService {
  constructor(private readonly reader: ProductionSummaryPort) {}

  async summary(query: ProductionConsolidationQuery, actor: ProductionActor) {
    return this.reader.summary(query, actor);
  }
}
