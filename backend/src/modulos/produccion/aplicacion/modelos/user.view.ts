import type { ProductionAreaView } from './production-area.view';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface UserView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  countryCode: string;
  mustChangePassword: boolean;
  type: string;
  status: RecordStatus;
  lastLoginAt: Date | null;
  productionAreas: ProductionAreaView[];
}
