import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteDelivery } from '../distribucion/entidades/route-delivery.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { ProductionConsolidation } from '../produccion/entidades/production-consolidation.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, ProductionConsolidation, OrderPreparation, RouteDelivery])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
