import type { ProductionActor } from '../production-actor';
export abstract class CancelProductionWritePort {
  abstract cancelDetail(id: string, detailId: string, actor: ProductionActor, reason: string): Promise<void>;
  abstract cancel(id: string, actor: ProductionActor, reason: string): Promise<void>;
}
