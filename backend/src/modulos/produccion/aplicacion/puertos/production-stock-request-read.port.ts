import type { ProductionActor } from '../production-actor';
import type { StockReplenishmentRequestView } from '../modelos/stock-replenishment-request.view';

export abstract class ProductionStockRequestReadPort {
  abstract pendingStockRequests(actor: ProductionActor): Promise<StockReplenishmentRequestView[]>;
  abstract findReturned(id: string): Promise<StockReplenishmentRequestView>;
}
