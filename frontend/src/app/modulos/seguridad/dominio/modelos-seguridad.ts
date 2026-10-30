import type { RecordStatus, UserType } from '../../../compartido/modelos-base';
import type { ProductionArea } from '../../produccion/dominio/modelos-produccion';

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  username: string;
  type: UserType;
  customerId: string | null;
  roles: string[];
  permissions: string[];
  productionAreaIds: string[];
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
  code: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  type: UserType;
  status: RecordStatus;
  lastLoginAt: string | null;
  roles: Role[];
  productionAreas: ProductionArea[];
}
