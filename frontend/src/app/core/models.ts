export type RecordStatus = 'ACTIVO' | 'INACTIVO';
export type CustomerType = 'MINORISTA' | 'DISTRIBUIDOR' | 'MAYORISTA';
export type PaymentCondition = 'CONTADO' | 'CREDITO';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  isSystem: boolean;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  status: RecordStatus;
  lastLoginAt: string | null;
  roles: Role[];
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
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  userId: string | null;
  user: Pick<User, 'id' | 'name' | 'email'> | null;
  module: string;
  action: string;
  entity: string;
  entityId: string | null;
  result: 'EXITOSO' | 'RECHAZADO' | 'ERROR';
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

