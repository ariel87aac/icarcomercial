import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CatalogQueryDto, CreateProductPriceDto, PriceQueryDto, UpdateProductPriceDto } from './dto/pricing.dto';
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
