import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  AdjustProductionPlanDto,
  CloseProductionConsolidationDto,
  CreateProductionAreaDto,
  GenerateProductionConsolidationDto,
  ProductionConsolidationQueryDto,
  RegisterProductionProgressDto,
  RegisterProductionDeliveryDto,
  ReceiveProductionDeliveryDto,
  ScheduleProductionDetailDto,
  ProductionReasonDto,
  UpdateProductionAreaDto,
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

  @Get('plant')
  @RequirePermissions('production.execution.manage')
  plant(
    @Query() query: ProductionConsolidationQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.plantBoard(query.productionAreaId, actor);
  }

  @Get('tracking')
  @RequirePermissions('production.consolidations.read')
  tracking(@Query() query: ProductionConsolidationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.tracking(query, actor);
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

  @Patch(':id/details/:detailId/plan')
  @RequirePermissions('production.plan.adjust')
  adjustPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detailId', ParseUUIDPipe) detailId: string,
    @Body() dto: AdjustProductionPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.adjustPlan(id, detailId, dto, actor);
  }

  @Patch(':id/details/:detailId/schedule')
  @RequirePermissions('production.schedule.manage')
  scheduleDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detailId', ParseUUIDPipe) detailId: string,
    @Body() dto: ScheduleProductionDetailDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.scheduleDetail(id, detailId, dto, actor);
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

  @Post(':id/details/:detailId/start')
  @RequirePermissions('production.execution.manage')
  startDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detailId', ParseUUIDPipe) detailId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.startDetail(id, detailId, actor);
  }

  @Post(':id/details/:detailId/deliveries')
  @RequirePermissions('production.execution.manage')
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detailId', ParseUUIDPipe) detailId: string,
    @Body() dto: RegisterProductionDeliveryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.registerDelivery(id, detailId, dto, actor);
  }

  @Post(':id/details/:detailId/cancel')
  @RequirePermissions('production.cancel')
  cancelDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detailId', ParseUUIDPipe) detailId: string,
    @Body() dto: ProductionReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.cancelDetail(id, detailId, dto, actor);
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

  @Post(':id/close-incomplete')
  @RequirePermissions('production.close_incomplete')
  closeIncomplete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductionReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.closeIncomplete(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('production.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductionReasonDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.cancel(id, dto, actor);
  }

  @Get(':id/history')
  @RequirePermissions('production.history.read')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.history(id, actor);
  }
}

@Controller('production-stock-requests')
export class ProductionStockRequestsController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production.consolidations.create')
  pending(@CurrentUser() actor: AuthenticatedUser) {
    return this.production.pendingStockRequests(actor);
  }
}

@Controller('production-areas')
export class ProductionAreasController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production.areas.read')
  findAll(@CurrentUser() actor: AuthenticatedUser) { return this.production.areas(actor); }

  @Get('categories')
  @RequirePermissions('production.areas.read')
  categories() { return this.production.productionCategories(); }

  @Post()
  @RequirePermissions('production.areas.manage')
  create(@Body() dto: CreateProductionAreaDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.production.createArea(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('production.areas.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionAreaDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.updateArea(id, dto, actor);
  }
}

@Controller('production-deliveries')
export class ProductionDeliveriesController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @RequirePermissions('production.receipts.read')
  findAll() { return this.production.pendingDeliveries(); }

  @Post(':id/receive')
  @RequirePermissions('production.receipts.accept')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveProductionDeliveryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.production.receiveDelivery(id, dto, actor);
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
