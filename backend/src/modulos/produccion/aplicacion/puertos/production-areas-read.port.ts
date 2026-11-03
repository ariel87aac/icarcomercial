import type { ProductionActor } from '../production-actor';
import type { ProductCategoryView } from '../modelos/product-category.view';
import type { ProductionAreaView } from '../modelos/production-area.view';

export abstract class ProductionAreasReadPort {
  abstract areas(actor: ProductionActor): Promise<ProductionAreaView[]>;
  abstract productionCategories(): Promise<ProductCategoryView[]>;
}
