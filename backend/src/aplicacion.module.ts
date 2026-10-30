import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './nucleo/configuracion/database.config';
import { validateEnvironment } from './nucleo/configuracion/environment.validation';
import { AppController } from './aplicacion.controller';
import { AppService } from './app.service';
import { HealthModule } from './nucleo/salud/health.module';
import { JwtAuthGuard } from './compartido/guardias/jwt-auth.guard';
import { PermissionsGuard } from './compartido/guardias/permissions.guard';
import { AccessControlModule } from './modulos/seguridad/roles-permisos/access-control.module';
import { AuditModule } from './modulos/seguridad/auditoria/audit.module';
import { AuthModule } from './modulos/seguridad/autenticacion/auth.module';
import { CustomersModule } from './modulos/clientes/customers.module';
import { UsersModule } from './modulos/seguridad/usuarios/users.module';
import { ZonesModule } from './modulos/zonas-reparto/zones.module';
import { CatalogModule } from './modulos/productos/catalogo/catalog.module';
import { PricingModule } from './modulos/productos/precios/pricing.module';
import { ProductionModule } from './modulos/produccion/production.module';
import { InventoryModule } from './modulos/almacen/inventory.module';
import { OrdersModule } from './modulos/pedidos/orders.module';
import { PreparationModule } from './modulos/preparacion/preparation.module';
import { FleetModule } from './modulos/distribucion/flota/fleet.module';
import { DistributionModule } from './modulos/distribucion/distribution.module';
import { TrackingModule } from './modulos/seguimiento-mensajeria/tracking.module';
import { CommercialModule } from './modulos/ventas-cobranzas/commercial.module';
import { DashboardModule } from './modulos/resumen/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    AuditModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    CustomersModule,
    ZonesModule,
    CatalogModule,
    PricingModule,
    InventoryModule,
    OrdersModule,
    ProductionModule,
    PreparationModule,
    FleetModule,
    TrackingModule,
    CommercialModule,
    DistributionModule,
    DashboardModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
