import type { ProductionActor } from '../production-actor';
import { RegisterProductionProgressCommand } from '../production-inputs';
export abstract class ProductionExecutionWritePort {
  abstract startDetail(id: string, detailId: string, actor: ProductionActor): Promise<void>;
  abstract registerProgress(id: string, dto: RegisterProductionProgressCommand, actor: ProductionActor): Promise<void>;
}
