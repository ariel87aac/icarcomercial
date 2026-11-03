import type { ProductionActor } from '../production-actor';
import { CreateProductionAreaCommand, UpdateProductionAreaCommand } from '../production-inputs';
import type { ProductionAreaView } from '../modelos/production-area.view';
export abstract class ProductionAreasWritePort {
  abstract createArea(dto: CreateProductionAreaCommand, actor: ProductionActor): Promise<ProductionAreaView>;
  abstract updateArea(
    id: string,
    dto: UpdateProductionAreaCommand,
    actor: ProductionActor,
  ): Promise<ProductionAreaView>;
}
