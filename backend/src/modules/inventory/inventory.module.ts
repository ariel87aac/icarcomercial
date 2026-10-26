import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryReservation } from './entities/inventory-reservation.entity';
import { Stock } from './entities/stock.entity';
import { StockReplenishmentRequest } from './entities/stock-replenishment-request.entity';
import { StockReplenishmentRequestDetail } from './entities/stock-replenishment-request-detail.entity';
import { ProductionArea } from '../production/entities/production-area.entity';
import { StockReplenishmentRequestService } from './stock-replenishment-request.service';

@Module({
  imports: [TypeOrmModule.forFeature([
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
