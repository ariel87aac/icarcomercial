import type { ProductionActor } from '../production-actor';
import { AdjustProductionPlanCommand, ScheduleProductionDetailCommand } from '../production-inputs';
export abstract class ProductionPlanWritePort {
  abstract adjustPlan(
    id: string,
    detailId: string,
    dto: AdjustProductionPlanCommand,
    actor: ProductionActor,
  ): Promise<void>;
  abstract scheduleDetail(
    id: string,
    detailId: string,
    dto: ScheduleProductionDetailCommand,
    actor: ProductionActor,
  ): Promise<void>;
}
