import type { ProductionActor } from '../production-actor';
import { ReceiveProductionDeliveryCommand } from '../production-inputs';
export abstract class ReceiveProductionWritePort {
  abstract receiveDelivery(id: string, dto: ReceiveProductionDeliveryCommand, actor: ProductionActor): Promise<void>;
}
