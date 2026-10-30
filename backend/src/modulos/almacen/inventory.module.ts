import { TrackingModule } from '../seguimiento-mensajeria/tracking.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryMovement } from './entidades/inventory-movement.entity';
import { InventoryReservation } from './entidades/inventory-reservation.entity';
import { Stock } from './entidades/stock.entity';
import { StockReplenishmentRequest } from './entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestDetail } from './entidades/stock-replenishment-request-detail.entity';
import { ProductionArea } from '../produccion/entidades/production-area.entity';
import { StockReplenishmentRequestService } from './stock-replenishment-request.service';

@Module({
  imports: [TrackingModule, TypeOrmModule.forFeature([
    Stock,
    InventoryMovement,
    InventoryReservation,
    ProductPresentation,
    OrderDetail,
    ProductionArea,
    StockReplenishmentRequest,
    StockReplenishmentRequestDetail,
  ])],
  controllers: [InventoryController],
  providers: [InventoryService, StockReplenishmentRequestService],
  exports: [InventoryService, StockReplenishmentRequestService, TypeOrmModule],
})
export class InventoryModule {}
