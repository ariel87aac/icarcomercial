import type { ProductCategoryView } from './product-category.view';
import type { ProductPresentationView } from './product-presentation.view';
import type { ProductLineView } from './product-line.view';
import type { UnitMeasureView } from './unit-measure.view';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface ProductView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  name: string;
  categoryId: string;
  category: ProductCategoryView;
  productLineId: string;
  productLine: ProductLineView;
  baseUnitId: string;
  baseUnit: UnitMeasureView;
  status: RecordStatus;
  imageMime: string | null;
  imageUrl: string | null;
  presentations: ProductPresentationView[];
}
