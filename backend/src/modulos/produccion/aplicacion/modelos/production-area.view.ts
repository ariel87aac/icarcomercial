import type { ProductCategoryView } from './product-category.view';
import type { UserView } from './user.view';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

export interface ProductionAreaView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  status: RecordStatus;
  categories: ProductCategoryView[];
  users: UserView[];
}
