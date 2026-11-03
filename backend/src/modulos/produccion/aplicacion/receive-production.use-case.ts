import { ProductionTrackingPort } from './puertos/production-tracking.port';
import { ProductionDeliveriesReadPort } from './puertos/production-deliveries-read.port';
import { ReceiveProductionWritePort } from './puertos/receive-production-write.port';
import type { ProductionActor } from './production-actor';
import { ReceiveProductionDeliveryCommand } from './production-inputs';
import type { ProductionDeliveryView } from './modelos/production-delivery.view';

export class ReceiveProductionUseCase {
  constructor(
    private readonly trackingService: ProductionTrackingPort,
    private readonly reader: ProductionDeliveriesReadPort,
    private readonly writer: ReceiveProductionWritePort,
  ) {}

  async receiveDelivery(
    id: string,
    dto: ReceiveProductionDeliveryCommand,
    actor: ProductionActor,
  ): Promise<ProductionDeliveryView> {
    await this.writer.receiveDelivery(id, dto, actor);
    await this.trackingService.refreshStock(`stock.production:${id}`);
    return this.reader.findReceived(id);
  }
}
