import type { CustomerType, PaymentCondition, RecordStatus } from '../../../compartido/modelos-base';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface CustomerAccount {
  customerId: string;
  userId: string;
  isPrimary: boolean;
  status: RecordStatus;
  createdAt: string;
  user: Pick<
    User,
    'id' | 'name' | 'username' | 'email' | 'phone' | 'type' | 'status'
  >;
}

export interface DistributionDay {
  id: string;
  zoneId: string;
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  status: RecordStatus;
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  distributionDays: DistributionDay[];
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  zoneId: string | null;
  zone: Zone | null;
  distributionDayId: string | null;
  distributionDay: DistributionDay | null;
  label: string;
  address: string;
  reference: string | null;
  latitude: string | null;
  longitude: string | null;
  isPrimary: boolean;
  status: RecordStatus;
}

export interface Customer {
  id: string;
  code: number;
  type: CustomerType;
  businessName: string;
  taxId: string | null;
  contactName: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  paymentCondition: PaymentCondition;
  creditLimit: string;
  creditDays: number;
  status: RecordStatus;
  addresses: CustomerAddress[];
  userLinks: CustomerAccount[];
  createdAt: string;
  updatedAt: string;
}
