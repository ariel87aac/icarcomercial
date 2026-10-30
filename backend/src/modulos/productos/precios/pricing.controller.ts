import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import {
  BulkUpdatePricesDto,
  CatalogQueryDto,
  CreateProductPriceDto,
  PriceMatrixQueryDto,
  PriceQueryDto,
  UpdateProductPriceDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';

@Controller(['catalog', 'catalogo'])
export class CommercialCatalogController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermissions('catalog.read')
  findAll(@Query() query: CatalogQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.pricing.catalog(query, actor);
  }
}

@Controller(['presentations', 'presentaciones'])
export class PresentationPricesController {
  constructor(private readonly pricing: PricingService) {}

  @Get([':id/prices', ':id/precios'])
  @RequirePermissions('pricing.manage')
  findByPresentation(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricing.pricesForPresentation(id);
  }

  @Post([':id/prices', ':id/precios'])
  @RequirePermissions('pricing.manage')
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductPriceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pricing.create(id, dto, actor);
  }
}

@Controller(['prices', 'precios'])
export class PricesController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermissions('pricing.manage')
  findAll(@Query() query: PriceQueryDto) { return this.pricing.prices(query); }

  @Get(['matrix', 'matriz'])
  @RequirePermissions('pricing.manage')
  matrix(@Query() query: PriceMatrixQueryDto) { return this.pricing.priceMatrix(query); }

  @Put(['bulk', 'actualizacion-masiva'])
  @RequirePermissions('pricing.manage')
  bulkUpdate(@Body() dto: BulkUpdatePricesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.pricing.bulkUpdate(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('pricing.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductPriceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pricing.update(id, dto, actor);
  }
}
