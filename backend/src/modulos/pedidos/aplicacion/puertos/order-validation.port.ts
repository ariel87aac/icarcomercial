import type { Customer } from '../../../clientes/entidades/customer.entity';
import type { CustomerAddress } from '../../../clientes/entidades/customer-address.entity';
import type { ProductPresentation } from '../../../productos/catalogo/entidades/product-presentation.entity';
import type { OrderScheduleWindow } from './order-scheduling.port';

/** Lecturas necesarias para validar, con una implementación ligada a la transacción cuando corresponda. */
export interface OrderValidationReader {
  customer(id: string): Promise<Customer | null>;
  address(id: string, customerId: string): Promise<CustomerAddress | null>;
  presentation(id: string): Promise<ProductPresentation | null>;
  price(presentationId: string, customer: Customer, date: string): Promise<{ amount: string } | null>;
  schedule(address: CustomerAddress, date: string, requireOpen: boolean): Promise<OrderScheduleWindow>;
}

export abstract class OrderValidationPort implements OrderValidationReader {
  abstract customer(id: string): Promise<Customer | null>;
  abstract address(id: string, customerId: string): Promise<CustomerAddress | null>;
  abstract presentation(id: string): Promise<ProductPresentation | null>;
  abstract price(presentationId: string, customer: Customer, date: string): Promise<{ amount: string } | null>;
  abstract schedule(address: CustomerAddress, date: string, requireOpen: boolean): Promise<OrderScheduleWindow>;
}
