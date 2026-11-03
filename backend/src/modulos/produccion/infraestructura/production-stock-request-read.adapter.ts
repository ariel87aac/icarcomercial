import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { StockReplenishmentRequest } from '../../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../../almacen/entidades/inventory.enums';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionStockRequestReadPort } from '../aplicacion/puertos/production-stock-request-read.port';
@Injectable()
export class TypeOrmProductionStockRequestReadAdapter extends ProductionStockRequestReadPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
  ) {
    super();
  }
  async pendingStockRequests(actor: ProductionActor): Promise<StockReplenishmentRequest[]> {
    const requests = await this.dataSource.getRepository(StockReplenishmentRequest).find({
      where: { status: StockReplenishmentRequestStatus.SENT },
      relations: {
        requestedBy: true,
        sentBy: true,
        details: {
          category: true,
          productionArea: true,
          presentation: { unit: true, product: { category: true, productLine: true } },
        },
      },
      order: { requiredDate: 'ASC', code: 'ASC' },
    });
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    for (const request of requests) {
      if (areaIds) {
        request.details = request.details.filter(
          (detail) => detail.productionAreaId !== null && areaIds.includes(detail.productionAreaId),
        );
      }
      request.details.sort(
        (left, right) =>
          (left.productionArea?.name ?? '').localeCompare(right.productionArea?.name ?? '') ||
          left.category.name.localeCompare(right.category.name) ||
          left.presentation.product.name.localeCompare(right.presentation.product.name),
      );
      Object.assign(request, { detailCount: request.details.length });
    }
    return requests.filter((request) => request.details.length > 0);
  }

  findReturned(id: string) {
    return this.dataSource.getRepository(StockReplenishmentRequest).findOneOrFail({
      where: { id },
      relations: { requestedBy: true, returnedBy: true, details: true },
    });
  }
}
