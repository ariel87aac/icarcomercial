import { addStockDemand } from '../dominio/production-stock-demand.rules';
import { groupOrderDemand } from '../dominio/production-demand.rules';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { ProductionArea } from '../entidades/production-area.entity';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { ProductionDetailStage } from '../dominio/production.enums';
import { StockReplenishmentRequest } from '../../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../../almacen/entidades/inventory.enums';
import { decimalForScale, roundForScale } from '../dominio/production-calculations';
import { ProductionConsolidationSource } from '../entidades/production-consolidation-source.entity';
import { OrderDetail } from '../../pedidos/entidades/order-detail.entity';
import { StockReplenishmentRequestDetail } from '../../almacen/entidades/stock-replenishment-request-detail.entity';

@Injectable()
export class ProductionDraftBuilder {
  constructor() {}

  async rebuildDraft(
    manager: EntityManager,
    consolidation: ProductionConsolidation,
    orderDetails: OrderDetail[],
    stockRequestId?: string,
  ): Promise<void> {
    const areas = await manager.getRepository(ProductionArea).find({
      where: { status: RecordStatus.ACTIVE },
      relations: { categories: true },
    });
    const areaByCategory = new Map(
      areas.flatMap((area) => area.categories.map((category) => [category.id, area.id] as const)),
    );
    const stockRequestBuilder = manager
      .getRepository(StockReplenishmentRequest)
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.details', 'requestDetail')
      .leftJoinAndSelect('requestDetail.presentation', 'requestPresentation')
      .leftJoinAndSelect('requestPresentation.unit', 'requestUnit')
      .leftJoinAndSelect('requestPresentation.product', 'requestProduct')
      .leftJoinAndSelect('requestProduct.category', 'requestCategory')
      .leftJoinAndSelect('requestProduct.productLine', 'requestProductLine');
    if (stockRequestId) {
      stockRequestBuilder
        .where('request.id = :stockRequestId', { stockRequestId })
        .andWhere('request.status = :sent', { sent: StockReplenishmentRequestStatus.SENT });
    } else {
      stockRequestBuilder
        .where('request.productionConsolidationId = :consolidationId', { consolidationId: consolidation.id })
        .andWhere('request.status = :scheduled', { scheduled: StockReplenishmentRequestStatus.SCHEDULED });
    }
    const stockRequest = await stockRequestBuilder.getOne();
    const sourceDate = stockRequest?.requiredDate ?? consolidation.deliveryDate;
    const groups = groupOrderDemand(orderDetails, sourceDate, areaByCategory);
    for (const requestDetail of stockRequest?.details ?? []) {
      const { group, product, presentation, productionAreaId } = addStockDemand(groups, requestDetail, areaByCategory);
      requestDetail.categoryId = product.categoryId;
      requestDetail.productionAreaId = productionAreaId;
      await manager.getRepository(StockReplenishmentRequestDetail).save(requestDetail);
      groups.set(presentation.id, group);
    }
    const detailRepository = manager.getRepository(ProductionConsolidationDetail);
    const existing = await detailRepository.find({ where: { consolidationId: consolidation.id } });
    const existingPlans = new Map(
      existing
        .filter((detail) => detail.presentationId)
        .map((detail) => [
          detail.presentationId!,
          {
            additionalQuantity: Number(detail.additionalProductionQuantity),
            reason: detail.additionalProductionReason,
            scheduledDate: detail.scheduledDate,
            sequence: detail.sequence,
          },
        ]),
    );
    if (existing.length) await detailRepository.remove(existing);
    const sequenceByArea = new Map<string, number>();
    for (const group of groups.values()) {
      const existingPlan = existingPlans.get(group.presentationId);
      const productionAreaId = areaByCategory.get(group.categoryId) ?? group.productionAreaId;
      const areaSequence = (sequenceByArea.get(productionAreaId ?? 'none') ?? 0) + 1;
      sequenceByArea.set(productionAreaId ?? 'none', areaSequence);
      const additional = roundForScale(existingPlan?.additionalQuantity ?? 0, group.decimalScale);
      const plannedQuantity = roundForScale(
        group.productionRequiredQuantity + group.stockRequestedQuantity + additional,
        group.decimalScale,
      );
      const detail = await detailRepository.save(
        detailRepository.create({
          consolidationId: consolidation.id,
          productId: group.productId,
          categoryId: group.categoryId,
          presentationId: group.presentationId,
          productionAreaId,
          productLineId: group.productLineId,
          baseUnitId: group.baseUnitId,
          requestedQuantity: decimalForScale(group.requestedQuantity, group.decimalScale),
          warehouseCoveredQuantity: decimalForScale(group.warehouseCoveredQuantity, group.decimalScale),
          productionRequiredQuantity: decimalForScale(group.productionRequiredQuantity, group.decimalScale),
          stockRequestedQuantity: decimalForScale(group.stockRequestedQuantity, group.decimalScale),
          stockRequestDetailId: group.stockRequestDetailId,
          additionalProductionQuantity: decimalForScale(additional, group.decimalScale),
          plannedQuantity: decimalForScale(plannedQuantity, group.decimalScale),
          additionalProductionReason: additional > 0 ? (existingPlan?.reason ?? null) : null,
          preparedQuantity: decimalForScale(0, group.decimalScale),
          receivedQuantity: decimalForScale(0, group.decimalScale),
          stage: ProductionDetailStage.PENDING,
          scheduledDate: existingPlan?.scheduledDate ?? consolidation.deliveryDate,
          sequence: existingPlan?.sequence ?? areaSequence,
          startedAt: null,
          completedAt: null,
          canceledById: null,
          canceledAt: null,
          cancellationReason: null,
          difference: decimalForScale(-plannedQuantity, group.decimalScale),
        }),
      );
      await manager.getRepository(ProductionConsolidationSource).save(
        group.sources.map((source) =>
          manager.getRepository(ProductionConsolidationSource).create({
            consolidatedDetailId: detail.id,
            orderDetailId: source.orderDetail.id,
            presentationId: source.orderDetail.presentationId,
            originalQuantity: decimalForScale(source.originalQuantity, source.decimalScale),
            reservedQuantity: decimalForScale(source.reservedQuantity, source.decimalScale),
            pendingQuantity: decimalForScale(source.pendingQuantity, source.decimalScale),
            appliedFactor: source.appliedFactor.toFixed(6),
            baseContribution: decimalForScale(source.baseContribution, source.decimalScale),
            warehouseContribution: decimalForScale(source.warehouseContribution, source.decimalScale),
            productionContribution: decimalForScale(source.productionContribution, source.decimalScale),
          }),
        ),
      );
    }
    if (stockRequest?.status === StockReplenishmentRequestStatus.SENT) {
      stockRequest.status = StockReplenishmentRequestStatus.SCHEDULED;
      stockRequest.productionConsolidationId = consolidation.id;
      stockRequest.scheduledAt = new Date();
      await manager.getRepository(StockReplenishmentRequest).save(stockRequest);
    }
  }
}
