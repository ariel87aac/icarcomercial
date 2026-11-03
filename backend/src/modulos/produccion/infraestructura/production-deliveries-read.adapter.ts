import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductionDeliveryStatus } from '../dominio/production.enums';
import { ProductionDelivery } from '../entidades/production-delivery.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductionDeliveriesReadPort } from '../aplicacion/puertos/production-deliveries-read.port';
@Injectable()
export class TypeOrmProductionDeliveriesReadAdapter extends ProductionDeliveriesReadPort {
  constructor(
    @InjectRepository(ProductionDelivery)
    private readonly deliveryRepository: Repository<ProductionDelivery>,
  ) {
    super();
  }
  pendingDeliveries(): Promise<ProductionDelivery[]> {
    return this.deliveryRepository.find({
      where: { status: ProductionDeliveryStatus.PENDING },
      relations: {
        consolidatedDetail: {
          product: true,
          category: true,
          productLine: true,
          presentation: { unit: true },
          productionArea: true,
          consolidation: true,
        },
      },
      order: { deliveredAt: 'ASC' },
    });
  }

  findReceived(id: string) {
    return this.deliveryRepository.findOneOrFail({
      where: { id },
      relations: {
        receivedBy: true,
        deliveredBy: true,
        consolidatedDetail: {
          product: true,
          presentation: { unit: true },
          productionArea: true,
          category: true,
          consolidation: true,
        },
      },
    });
  }
}
