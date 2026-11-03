import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface ProductLineView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  name: string;
  status: RecordStatus;
}
