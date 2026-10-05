import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryReservation } from './entities/inventory-reservation.entity';
import { Stock } from './entities/stock.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, InventoryMovement, InventoryReservation, ProductPresentation, OrderDetail])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
