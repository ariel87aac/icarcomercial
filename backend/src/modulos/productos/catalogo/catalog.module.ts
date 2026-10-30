import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProductCategoriesController,
  CatalogProductImagesController,
  ProductLinesController,
  ProductsController,
  UnitMeasuresController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductCategory } from './entidades/product-category.entity';
import { ProductLine } from './entidades/product-line.entity';
import { ProductPresentation } from './entidades/product-presentation.entity';
import { Product } from './entidades/product.entity';
import { UnitMeasure } from './entidades/unit-measure.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductCategory, ProductLine, UnitMeasure, Product, ProductPresentation])],
  controllers: [ProductCategoriesController, ProductLinesController, UnitMeasuresController, ProductsController, CatalogProductImagesController],
  providers: [CatalogService],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
