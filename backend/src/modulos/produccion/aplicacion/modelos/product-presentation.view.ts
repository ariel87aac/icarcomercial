import type { ProductView } from './product.view';
import type { UnitMeasureView } from './unit-measure.view';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface ProductPresentationView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  productId: string;
  product: ProductView;
  unitId: string;
  unit: UnitMeasureView;
  description: string;
  conversionFactor: string;
  weightKg: string | null;
  status: RecordStatus;
}
