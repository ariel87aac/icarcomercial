import { validateDraftQuantities } from '../dominio/production-draft.rules';
import { ProductionError } from '../dominio/production-error';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { StockReplenishmentRequest } from '../../almacen/entidades/stock-replenishment-request.entity';
import { ProductionAreaResolver } from './production-area-resolver';

@Injectable()
export class ProductionDraftValidator {
  constructor(private readonly productionAreaResolver: ProductionAreaResolver) {}

  async validateDraftIntegrity(manager: EntityManager, consolidation: ProductionConsolidation): Promise<void> {
    const sourceDate = await this.sourceDateFor(manager, consolidation);
    const details = await manager.getRepository(ProductionConsolidationDetail).find({
      where: { consolidationId: consolidation.id },
      relations: {
        baseUnit: true,
        presentation: true,
        category: true,
        productionArea: true,
        stockRequestDetail: { request: true },
        sources: { orderDetail: { order: true }, presentation: { product: { baseUnit: true } } },
      },
    });
    if (!details.length) throw new ProductionError('inconsistent', 'El Borrador no contiene detalles consolidados');
    for (const detail of details) {
      if (!detail.presentationId || !detail.presentation) {
        throw new ProductionError(
          'inconsistent',
          'Existe un producto sin presentación definida; recalcule la orden antes de emitir',
        );
      }
      if (!detail.scheduledDate || !Number.isInteger(detail.sequence) || detail.sequence <= 0) {
        throw new ProductionError('inconsistent', 'Cada producto debe tener fecha programada y secuencia válidas');
      }
      const area = await this.productionAreaResolver.areaForCategory(manager, detail.categoryId!);
      if (!area)
        throw new ProductionError(
          'inconsistent',
          `La categoría ${detail.category?.name ?? ''} no tiene un área de Producción activa asignada`,
        );
      detail.productionAreaId = area.id;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      validateDraftQuantities(detail, sourceDate, consolidation.id);
    }
  }

  async sourceDateFor(manager: EntityManager, consolidation: ProductionConsolidation): Promise<string> {
    const stockRequest = await manager.getRepository(StockReplenishmentRequest).findOne({
      where: { productionConsolidationId: consolidation.id },
      select: { id: true, requiredDate: true },
    });
    return stockRequest?.requiredDate ?? consolidation.deliveryDate;
  }
}
