import type { ProductionActor } from '../production-actor';
export abstract class ProductionStockRequestsWritePort {
  abstract returnStockRequest(id: string, actor: ProductionActor, reason: string): Promise<void>;
}
