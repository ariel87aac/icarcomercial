import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AddRouteDeliveriesDto, CancelRouteDto, CompleteFactoryDeliveryDto, CreateDistributionRouteDto, DistributionRouteQueryDto, PendingDistributionQueryDto, ReceiveWarehouseReturnDto, RegisterVisitResultDto, RescheduleRouteDto, RouteTransitionDto, SettleRouteDto, UpdatePresentationWeightsDto, UpdateRouteSequenceDto, UpdateRouteVehicleDto, WarehouseReturnQueryDto, WeightReadinessQueryDto } from './dto/distribution.dto';
import { DistributionService } from './distribution.service';

@Controller('distribution-routes')
export class DistributionRoutesController {
  constructor(private readonly distribution: DistributionService) {}

  @Get()
  @RequirePermissions('distribution.routes.read')
  findAll(@Query() query: DistributionRouteQueryDto) { return this.distribution.findAll(query); }

  @Get('summary')
  @RequirePermissions('distribution.summary.read')
  summary(@Query() query: DistributionRouteQueryDto) { return this.distribution.summary(query); }

  @Get('responsible-options')
  @RequirePermissions('distribution.routes.create')
  responsibleOptions() { return this.distribution.responsibleOptions(); }

  @Get('my-route')
  @RequirePermissions('distribution.routes.assigned.read')
  myRoute(@CurrentUser() actor: AuthenticatedUser) { return this.distribution.myRoutes(actor); }

  @Get('weight-readiness')
  @RequirePermissions('distribution.weights.read')
  weightReadiness(@Query() query: WeightReadinessQueryDto) { return this.distribution.weightReadiness(query); }

  @Get('pending-deliveries')
  @RequirePermissions('distribution.routes.read')
  pendingDeliveries(@Query() query: PendingDistributionQueryDto) { return this.distribution.pendingDeliveries(query); }

  @Put('presentation-weights')
  @RequirePermissions('distribution.weights.manage')
  presentationWeights(@Body() dto: UpdatePresentationWeightsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.updatePresentationWeights(dto, actor);
  }

  @Post()
  @RequirePermissions('distribution.routes.create')
  create(@Body() dto: CreateDistributionRouteDto, @CurrentUser() actor: AuthenticatedUser) { return this.distribution.create(dto, actor); }

  @Get(':id')
  @RequirePermissions('distribution.routes.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.distribution.findOne(id); }

  @Post(':id/deliveries')
  @RequirePermissions('distribution.routes.create')
  addDeliveries(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddRouteDeliveriesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.addDeliveries(id, dto, actor);
  }

  @Delete(':id/deliveries/:deliveryId')
  @RequirePermissions('distribution.routes.create')
  removeDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.distribution.removeDelivery(id, deliveryId, actor);
  }

  @Put(':id/vehicle')
  @RequirePermissions('distribution.routes.create')
  vehicle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteVehicleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.updateVehicle(id, dto, actor);
  }

  @Put(':id/sequence')
  @RequirePermissions('distribution.routes.plan')
  sequence(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteSequenceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.updateSequence(id, dto, actor);
  }

  @Put(':id/reschedule')
  @RequirePermissions('distribution.routes.reschedule')
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleRouteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.reschedule(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('distribution.routes.cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelRouteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.cancel(id, dto, actor);
  }

  @Post(':id/plan')
  @RequirePermissions('distribution.routes.plan')
  plan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RouteTransitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.plan(id, dto, actor);
  }

  @Post(':id/departure')
  @RequirePermissions('distribution.routes.departure')
  departure(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RouteTransitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.departure(id, dto, actor);
  }

  @Post(':id/finish')
  @RequirePermissions('distribution.routes.finish')
  finish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RouteTransitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.finish(id, dto, actor);
  }

  @Post(':id/settlement')
  @RequirePermissions('distribution.routes.settle')
  settlement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleRouteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.settle(id, dto, actor);
  }

  @Get(':id/history')
  @RequirePermissions('distribution.history.read')
  history(@Param('id', ParseUUIDPipe) id: string) { return this.distribution.history(id); }
}

@Controller('route-deliveries')
export class RouteDeliveriesController {
  constructor(private readonly distribution: DistributionService) {}

  @Post(':id/result')
  @RequirePermissions('distribution.visits.create')
  result(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterVisitResultDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.registerVisit(id, dto, actor);
  }
}

@Controller(['factory-deliveries', 'entregas-fabrica'])
export class FactoryDeliveriesController {
  constructor(private readonly distribution: DistributionService) {}

  @Post()
  @RequirePermissions('distribution.visits.create')
  complete(@Body() dto: CompleteFactoryDeliveryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.completeFactoryDelivery(dto, actor);
  }
}

@Controller(['inventory/route-returns', 'inventario/retornos-ruta'])
export class WarehouseReturnOrdersController {
  constructor(private readonly distribution: DistributionService) {}

  @Get()
  @RequirePermissions('inventory.returns.read')
  list(@Query() query: WarehouseReturnQueryDto) { return this.distribution.warehouseReturns(query); }

  @Get(':id')
  @RequirePermissions('inventory.returns.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.distribution.warehouseReturn(id); }

  @Post(':id/receive')
  @RequirePermissions('inventory.returns.receive')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveWarehouseReturnDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.distribution.receiveWarehouseReturn(id, dto, actor);
  }
}
