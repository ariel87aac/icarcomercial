import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface CustomerView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  type: string;
  businessName: string;
  taxId: string | null;
  contactName: string | null;
  phone: string;
  countryCode: string;
  whatsapp: string | null;
  email: string | null;
  paymentCondition: string;
  creditLimit: string;
  creditDays: number;
  status: RecordStatus;
}
