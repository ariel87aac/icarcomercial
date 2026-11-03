import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { SaleService } from '../ventas-cobranzas/sale.service';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteHistory } from './entidades/route-history.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';

export abstract class DistributionServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(DistributionRoute) protected readonly routeRepository: Repository<DistributionRoute>,
        @InjectRepository(RouteDelivery) protected readonly deliveryRepository: Repository<RouteDelivery>,
        @InjectRepository(RouteHistory) protected readonly historyRepository: Repository<RouteHistory>,
        @InjectRepository(RouteSettlement) protected readonly settlementRepository: Repository<RouteSettlement>,
        @InjectRepository(User) protected readonly userRepository: Repository<User>,
        @InjectRepository(ProductPresentation) protected readonly presentationRepository: Repository<ProductPresentation>,
        protected readonly dataSource: DataSource,
        protected readonly trackingService: TrackingService,
        protected readonly saleService: SaleService,
      ) {}
}
