import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CatalogService } from './catalog.service';
import {
  CreateNamedCatalogItemDto,
  CreateProductDto,
  CreateProductPresentationDto,
  CreateUnitMeasureDto,
  ProductQueryDto,
  UpdateNamedCatalogItemDto,
  UpdateProductDto,
  UpdateProductPresentationDto,
  UpdateUnitMeasureDto,
} from './dto/catalog.dto';

@Controller(['categories', 'categorias'])
export class ProductCategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('catalog.manage')
  findAll() { return this.catalog.categories(); }

  @Post()
  @RequirePermissions('catalog.manage')
  create(@Body() dto: CreateNamedCatalogItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.createCategory(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNamedCatalogItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.updateCategory(id, dto, actor);
  }
}

@Controller(['product-lines', 'lineas-productivas'])
export class ProductLinesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('catalog.manage')
  findAll() { return this.catalog.lines(); }

  @Post()
  @RequirePermissions('catalog.manage')
  create(@Body() dto: CreateNamedCatalogItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.createLine(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNamedCatalogItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.updateLine(id, dto, actor);
  }
}

@Controller(['units', 'unidades'])
export class UnitMeasuresController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('catalog.manage')
  findAll() { return this.catalog.units(); }

  @Post()
  @RequirePermissions('catalog.manage')
  create(@Body() dto: CreateUnitMeasureDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.createUnit(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitMeasureDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.updateUnit(id, dto, actor);
  }
}

@Controller(['products', 'productos'])
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('catalog.manage')
  findAll(@Query() query: ProductQueryDto) { return this.catalog.products(query); }

  @Get(':id')
  @RequirePermissions('catalog.manage')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.catalog.product(id); }

  @Post()
  @RequirePermissions('catalog.manage')
  create(@Body() dto: CreateProductDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.createProduct(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.updateProduct(id, dto, actor);
  }

  @Get([':id/presentations', ':id/presentaciones'])
  @RequirePermissions('catalog.manage')
  presentations(@Param('id', ParseUUIDPipe) id: string) { return this.catalog.presentations(id); }

  @Post([':id/presentations', ':id/presentaciones'])
  @RequirePermissions('catalog.manage')
  createPresentation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateProductPresentationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.createPresentation(id, dto, actor);
  }

  @Patch([':productId/presentations/:id', ':productId/presentaciones/:id'])
  @RequirePermissions('catalog.manage')
  updatePresentation(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductPresentationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.catalog.updatePresentation(productId, id, dto, actor);
  }
}
