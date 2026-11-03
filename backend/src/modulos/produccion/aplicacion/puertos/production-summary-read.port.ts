import type { ProductionSummaryView } from '../modelos/production-summary.view';
import type { ProductionActor } from '../production-actor';
import { ProductionConsolidationQuery } from '../production-inputs';
import type { ProductionPage } from '../modelos/production-page';

export abstract class ProductionSummaryPort {
  abstract summary(
    query: ProductionConsolidationQuery,
    actor: ProductionActor,
  ): Promise<ProductionPage<ProductionSummaryView>>;
}
