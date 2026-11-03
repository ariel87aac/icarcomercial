import type { ProductionActor } from '../production-actor';
import { RegisterProductionDeliveryCommand } from '../production-inputs';
export abstract class ProductionDeliveriesWritePort {
  abstract registerDelivery(
    id: string,
    detailId: string,
    dto: RegisterProductionDeliveryCommand,
    actor: ProductionActor,
  ): Promise<void>;
}
