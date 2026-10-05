import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AddRouteDeliveriesDto, CreateDistributionRouteDto, DistributionRouteQueryDto, RegisterVisitResultDto, RouteTransitionDto, SettleRouteDto, UpdateRouteSequenceDto } from './dto/distribution.dto';
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

  @Put(':id/sequence')
  @RequirePermissions('distribution.routes.plan')
  sequence(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteSequenceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.distribution.updateSequence(id, dto, actor);
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
