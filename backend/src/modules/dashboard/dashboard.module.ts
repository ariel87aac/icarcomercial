import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteDelivery } from '../distribution/entities/route-delivery.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderPreparation } from '../preparation/entities/order-preparation.entity';
import { ProductionConsolidation } from '../production/entities/production-consolidation.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, ProductionConsolidation, OrderPreparation, RouteDelivery])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
