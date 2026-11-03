import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrderValidationPort, OrderValidationReader } from '../aplicacion/puertos/order-validation.port';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { Customer } from '../../clientes/entidades/customer.entity';
import { CustomerAddress } from '../../clientes/entidades/customer-address.entity';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';
import { PricingService } from '../../productos/precios/pricing.service';
import { OrderSchedulingService } from '../order-scheduling.service';

@Injectable()
export class TypeOrmOrderValidationAdapter extends OrderValidationPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pricing: PricingService,
    private readonly scheduling: OrderSchedulingService,
  ) {
    super();
  }

  /** Cada llamada crea una sesión independiente, sin cambiar el estado del proveedor singleton. */
  forTransaction(manager: EntityManager): OrderValidationReader {
    return {
      customer: (id) => manager.getRepository(Customer).findOne({ where: { id, status: RecordStatus.ACTIVE } }),
      address: (id, customerId) =>
        manager.getRepository(CustomerAddress).findOne({
          where: { id, customerId, status: RecordStatus.ACTIVE },
          relations: { zone: { distributionDays: true }, distributionDay: true },
        }),
      presentation: (id) =>
        manager.getRepository(ProductPresentation).findOne({
          where: { id, status: RecordStatus.ACTIVE },
          relations: { product: true, unit: true },
        }),
      price: (id, customer, date) => this.pricing.resolveApplicablePrice(id, customer, date, manager),
      schedule: (address, date, requireOpen) => this.scheduling.resolve(address, date, requireOpen),
    };
  }

  customer(id: string) {
    return this.forTransaction(this.dataSource.manager).customer(id);
  }
  address(id: string, customerId: string) {
    return this.forTransaction(this.dataSource.manager).address(id, customerId);
  }
  presentation(id: string) {
    return this.forTransaction(this.dataSource.manager).presentation(id);
  }
  price(id: string, customer: Customer, date: string) {
    return this.forTransaction(this.dataSource.manager).price(id, customer, date);
  }
  schedule(address: CustomerAddress, date: string, requireOpen: boolean) {
    return this.scheduling.resolve(address, date, requireOpen);
  }
}
