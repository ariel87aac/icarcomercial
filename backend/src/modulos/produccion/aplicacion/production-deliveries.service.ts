import { ProductionDeliveriesReadPort } from './puertos/production-deliveries-read.port';
import { ProductionDeliveriesWritePort } from './puertos/production-deliveries-write.port';
import type { ProductionActor } from './production-actor';
import { RegisterProductionDeliveryCommand } from './production-inputs';
import type { ProductionConsolidationView } from './modelos/production-consolidation.view';
import type { ProductionDeliveryView } from './modelos/production-delivery.view';
import { ProductionQueriesService } from './production-queries.service';

export class ProductionDeliveriesService {
  constructor(
    private readonly productionQueriesService: ProductionQueriesService,
    private readonly writer: ProductionDeliveriesWritePort,
    private readonly reader: ProductionDeliveriesReadPort,
  ) {}

  async registerDelivery(
    id: string,
    detailId: string,
    dto: RegisterProductionDeliveryCommand,
    actor: ProductionActor,
  ): Promise<ProductionConsolidationView> {
    await this.writer.registerDelivery(id, detailId, dto, actor);
    return this.productionQueriesService.findOne(id, actor);
  }

  pendingDeliveries(): Promise<ProductionDeliveryView[]> {
    return this.reader.pendingDeliveries();
  }
}
