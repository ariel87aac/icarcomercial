import { ProductionAreasReadPort } from './puertos/production-areas-read.port';
import { ProductionAreasWritePort } from './puertos/production-areas-write.port';
import type { ProductionActor } from './production-actor';
import type { ProductCategoryView } from './modelos/product-category.view';
import { CreateProductionAreaCommand, UpdateProductionAreaCommand } from './production-inputs';
import type { ProductionAreaView } from './modelos/production-area.view';

export class ProductionAreasService {
  constructor(
    private readonly writer: ProductionAreasWritePort,
    private readonly reader: ProductionAreasReadPort,
  ) {}

  areas(actor: ProductionActor): Promise<ProductionAreaView[]> {
    return this.reader.areas(actor);
  }

  productionCategories(): Promise<ProductCategoryView[]> {
    return this.reader.productionCategories();
  }

  async createArea(dto: CreateProductionAreaCommand, actor: ProductionActor): Promise<ProductionAreaView> {
    return await this.writer.createArea(dto, actor);
  }

  async updateArea(id: string, dto: UpdateProductionAreaCommand, actor: ProductionActor): Promise<ProductionAreaView> {
    return await this.writer.updateArea(id, dto, actor);
  }
}
