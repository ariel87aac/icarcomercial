import type { ProductionActor } from '../production-actor';
import { CloseProductionConsolidationCommand } from '../production-inputs';
export abstract class CloseProductionWritePort {
  abstract closeIncomplete(id: string, actor: ProductionActor, reason: string): Promise<void>;
  abstract close(id: string, dto: CloseProductionConsolidationCommand, actor: ProductionActor): Promise<void>;
}
