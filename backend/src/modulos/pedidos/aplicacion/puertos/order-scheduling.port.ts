import type { AuthenticatedUser } from '../../../../compartido/interfaces/authenticated-user.interface';
import type { CustomerAddress } from '../../../clientes/entidades/customer-address.entity';

export interface OrderScheduleWindow {
  deliveryDate: string;
  weekday: number;
  orderCutoffAt: Date;
  preparationAt: Date;
  zoneId: string;
  zoneName: string;
}

export abstract class OrderSchedulingPort {
  abstract assertOrderOpen(orderCutoffAt: Date): void;
  abstract deliveryOptions(
    addressId: string,
    customerId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<OrderScheduleWindow[]>;
  abstract resolve(address: CustomerAddress, deliveryDate: string, requireOpen?: boolean): Promise<OrderScheduleWindow>;
}
