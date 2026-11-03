import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface UnitMeasureView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  name: string;
  abbreviation: string;
  decimalScale: number;
  kilogramFactor: string | null;
  status: RecordStatus;
}
