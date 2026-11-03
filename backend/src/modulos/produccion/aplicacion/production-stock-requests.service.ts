import { ProductionStockRequestReadPort } from './puertos/production-stock-request-read.port';
import { ProductionStockRequestsWritePort } from './puertos/production-stock-requests-write.port';
import type { ProductionActor } from './production-actor';
import { ProductionReasonCommand } from './production-inputs';
import type { StockReplenishmentRequestView } from './modelos/stock-replenishment-request.view';
import { ProductionAccessPolicy } from './production-access.policy';

export class ProductionStockRequestsService {
  constructor(
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly writer: ProductionStockRequestsWritePort,
    private readonly reader: ProductionStockRequestReadPort,
  ) {}

  async pendingStockRequests(actor: ProductionActor): Promise<StockReplenishmentRequestView[]> {
    return this.reader.pendingStockRequests(actor);
  }

  async returnStockRequest(
    id: string,
    dto: ProductionReasonCommand,
    actor: ProductionActor,
  ): Promise<StockReplenishmentRequestView> {
    const reason = this.productionAccessPolicy.requiredReason(dto.reason);
    await this.writer.returnStockRequest(id, actor, reason);
    return this.reader.findReturned(id);
  }
}
