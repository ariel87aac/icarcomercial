import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { Product } from '../catalog/entities/product.entity';
import { Customer } from '../customers/entities/customer.entity';
import { ProductPrice } from './entities/product-price.entity';
import { CommercialCatalogController, PresentationPricesController, PricesController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductPrice, ProductPresentation, Product, Customer])],
  controllers: [CommercialCatalogController, PresentationPricesController, PricesController],
  providers: [PricingService],
  exports: [PricingService, TypeOrmModule],
})
export class PricingModule {}
