import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProductCategoriesController,
  ProductLinesController,
  ProductsController,
  UnitMeasuresController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductCategory } from './entities/product-category.entity';
import { ProductLine } from './entities/product-line.entity';
import { ProductPresentation } from './entities/product-presentation.entity';
import { Product } from './entities/product.entity';
import { UnitMeasure } from './entities/unit-measure.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductCategory, ProductLine, UnitMeasure, Product, ProductPresentation])],
  controllers: [ProductCategoriesController, ProductLinesController, UnitMeasuresController, ProductsController],
  providers: [CatalogService],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
