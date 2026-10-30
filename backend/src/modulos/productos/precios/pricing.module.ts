import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductPresentation } from '../catalogo/entidades/product-presentation.entity';
import { Product } from '../catalogo/entidades/product.entity';
import { Customer } from '../../clientes/entidades/customer.entity';
import { ProductPrice } from './entidades/product-price.entity';
import { CommercialCatalogController, PresentationPricesController, PricesController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductPrice, ProductPresentation, Product, Customer])],
  controllers: [CommercialCatalogController, PresentationPricesController, PricesController],
  providers: [PricingService],
  exports: [PricingService, TypeOrmModule],
})
export class PricingModule {}
