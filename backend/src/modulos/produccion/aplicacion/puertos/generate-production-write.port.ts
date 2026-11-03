import type { ProductionActor } from '../production-actor';
import { GenerateProductionConsolidationCommand } from '../production-inputs';
export abstract class GenerateProductionWritePort {
  abstract generate(
    dto: GenerateProductionConsolidationCommand,
    actor: ProductionActor,
    complementary: boolean,
  ): Promise<string>;
  abstract recalculate(id: string, actor: ProductionActor): Promise<void>;
}
