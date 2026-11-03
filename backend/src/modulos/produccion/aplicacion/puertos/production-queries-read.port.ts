import { productionTrackingSummary } from '../../dominio/production-tracking';
import type { ProductionActor } from '../production-actor';
import { ProductionConsolidationQuery } from '../production-inputs';
import type { ProductionConsolidationView } from '../modelos/production-consolidation.view';
import type { ProductionConsolidationSourceView } from '../modelos/production-consolidation-source.view';
import type { ProductionConsolidationHistoryView } from '../modelos/production-consolidation-history.view';
import type { ProductionPage } from '../modelos/production-page';

export abstract class ProductionQueriesPort {
  abstract findAll(
    query: ProductionConsolidationQuery,
    actor: ProductionActor,
  ): Promise<ProductionPage<ProductionConsolidationView>>;
  abstract requirements(
    query: ProductionConsolidationQuery,
    actor: ProductionActor,
  ): Promise<ProductionPage<ProductionConsolidationView>>;
  abstract tracking(
    query: ProductionConsolidationQuery,
    actor: ProductionActor,
  ): Promise<ProductionPage<ProductionConsolidationView & { tracking?: ReturnType<typeof productionTrackingSummary> }>>;
  abstract findOne(id: string, actor: ProductionActor): Promise<ProductionConsolidationView>;
  abstract plantBoard(
    productionAreaId: string | undefined,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView[]>;
  abstract sources(id: string, actor: ProductionActor): Promise<ProductionConsolidationSourceView[]>;
  abstract history(id: string, actor: ProductionActor): Promise<ProductionConsolidationHistoryView[]>;
}
