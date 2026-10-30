import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { ProductionArea } from '../produccion/entidades/production-area.entity';
import {
  CreateStockReplenishmentRequestDto,
  SaveStockReplenishmentRequestDto,
  StockReplenishmentPlanQueryDto,
  StockReplenishmentRequestQueryDto,
} from './dto/inventory.dto';
import { StockReplenishmentRequestDetail } from './entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from './entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from './entidades/inventory.enums';
import { projectedAvailableQuantity } from './inventory-calculations';

interface StockRequestMetrics {
  presentationId: string;
  physicalQuantity: string;
  reservedQuantity: string;
  demandQuantity: string;
  shortageQuantity: string;
}
import { StockReplenishmentRequestServiceBase } from './stock-replenishment-request.base';

export abstract class StockReplenishmentRequestServiceParte03 extends StockReplenishmentRequestServiceBase {
  protected async metrics(manager: EntityManager, requiredDate: string, presentationIds: string[]): Promise<StockRequestMetrics[]> {
      if (!presentationIds.length) return [];
      return manager.query<StockRequestMetrics[]>(
        `SELECT presentation.id AS "presentationId",
                COALESCE(stock.cantidad_fisica, 0)::text AS "physicalQuantity",
                COALESCE(stock.cantidad_reservada, 0)::text AS "reservedQuantity",
                COALESCE(demand.requested, 0)::text AS "demandQuantity",
                COALESCE(demand.pending, 0)::text AS "shortageQuantity"
           FROM presentaciones_producto presentation
           LEFT JOIN existencias stock ON stock.presentacion_id = presentation.id
           LEFT JOIN (
             SELECT detail.presentacion_id,
                    SUM(detail.cantidad_solicitada) AS requested,
                    SUM(detail.cantidad_pendiente) AS pending
               FROM pedidos_detalle detail
               JOIN pedidos orders ON orders.id = detail.pedido_id
              WHERE orders.estado = 'CONFIRMADO'
                AND orders.fecha_solicitada = $1
                AND orders.eliminado_at IS NULL
              GROUP BY detail.presentacion_id
           ) demand ON demand.presentacion_id = presentation.id
          WHERE presentation.id = ANY($2::uuid[])`,
        [requiredDate, presentationIds],
      );
    }

  protected async areaByCategory(manager: EntityManager): Promise<Map<string, ProductionArea>> {
      const areas = await manager.getRepository(ProductionArea).find({
        where: { status: RecordStatus.ACTIVE },
        relations: { categories: true },
      });
      return new Map(areas.flatMap((area) => area.categories.map((category) => [category.id, area] as const)));
    }

  protected snapshotItem(detail: StockReplenishmentRequestDetail) {
      const physical = Number(detail.physicalQuantitySnapshot);
      const reserved = Number(detail.reservedQuantitySnapshot);
      const shortage = Number(detail.shortageQuantitySnapshot);
      const additional = Number(detail.additionalStockQuantity);
      return {
        presentation: detail.presentation,
        category: detail.category,
        productionArea: detail.productionArea,
        physicalQuantity: detail.physicalQuantitySnapshot,
        reservedQuantity: detail.reservedQuantitySnapshot,
        availableQuantity: this.decimal(
          projectedAvailableQuantity(physical, reserved, detail.presentation.unit.decimalScale),
          detail.presentation.unit.decimalScale,
        ),
        demandQuantity: detail.demandQuantitySnapshot,
        shortageQuantity: detail.shortageQuantitySnapshot,
        additionalStockQuantity: detail.additionalStockQuantity,
        totalProductionQuantity: this.decimal(shortage + additional, detail.presentation.unit.decimalScale),
        observation: detail.observation,
      };
    }

  protected emptyMetrics(presentationId: string): StockRequestMetrics {
      return { presentationId, physicalQuantity: '0', reservedQuantity: '0', demandQuantity: '0', shortageQuantity: '0' };
    }

  protected decimal(value: number, scale: number): string {
      return value.toFixed(scale);
    }

  protected addProductImages(presentations: ProductPresentation[]): void {
      for (const presentation of presentations) {
        const product = presentation.product;
        product.imageUrl = product.imageMime ? `/api/catalogo/productos/${product.id}/imagen?v=${product.updatedAt.getTime()}` : null;
      }
    }
}
