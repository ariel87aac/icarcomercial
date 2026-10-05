import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CloseProductionConsolidationDto,
  GenerateProductionConsolidationDto,
  ProductionConsolidationQueryDto,
  RegisterProductionProgressDto,
} from './dto/production.dto';
import { ProductionService } from './production.service';

@Controller('production-consolidations')
export class ProductionConsolidationsController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production.consolidations.read')
  findAll(@Query() query: ProductionConsolidationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.findAll(query, actor);
  }

  @Post()
  @RequirePermissions('production.consolidations.create')
  generate(@Body() dto: GenerateProductionConsolidationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.generate(dto, actor, false);
  }

  @Post('complementary')
  @RequirePermissions('production.consolidations.create')
  complementary(@Body() dto: GenerateProductionConsolidationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.generate(dto, actor, true);
  }

  @Get(':id')
  @RequirePermissions('production.consolidations.read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.findOne(id, actor);
  }

  @Post(':id/recalculate')
  @RequirePermissions('production.consolidations.edit')
  recalculate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.recalculate(id, actor);
  }

  @Post(':id/emit')
  @RequirePermissions('production.consolidations.emit')
  emit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.emit(id, actor);
  }

  @Get(':id/sources')
  @RequirePermissions('production.traceability.read')
  sources(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.sources(id, actor);
  }

  @Post(':id/progress')
  @RequirePermissions('production.progress.create')
  progress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterProductionProgressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.registerProgress(id, dto, actor);
  }

  @Post(':id/close')
  @RequirePermissions('production.close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseProductionConsolidationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.close(id, dto, actor);
  }

  @Get(':id/history')
  @RequirePermissions('production.history.read')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.history(id, actor);
  }
}

@Controller('production-requirements')
export class ProductionRequirementsController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production.requirements.read')
  findAll(@Query() query: ProductionConsolidationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.requirements(query, actor);
  }
}

@Controller('production-summary')
export class ProductionSummaryController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production.summary.read')
  findAll(@Query() query: ProductionConsolidationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.summary(query, actor);
  }
}
