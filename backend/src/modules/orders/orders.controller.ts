import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CancelOrderDto, CreateOrderDto, DeleteOrderDto, OrderQueryDto, ReturnOrderDto, TransitionOrderDto, UpdateOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller(['orders', 'pedidos'])
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  findAll(@Query() query: OrderQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.findAll(query, actor);
  }

  @Get(['status-summary', 'resumen-estados'])
  @RequirePermissions('orders.read')
  statusSummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.orders.statusSummary(actor);
  }

  @Post()
  @RequirePermissions('orders.create')
  create(@Body() dto: CreateOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.create(dto, actor);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.findOne(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('orders.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.update(id, dto, actor);
  }

  @Post([':id/send', ':id/enviar'])
  @RequirePermissions('orders.update')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.send(id, dto, actor);
  }

  @Post([':id/return', ':id/devolver'])
  @RequirePermissions('orders.update')
  returnToDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.returnToDraft(id, dto, actor);
  }

  @Post([':id/confirm', ':id/confirmar'])
  @RequirePermissions('orders.confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.confirm(id, dto, actor);
  }

  @Post([':id/reschedule-next', ':id/reprogramar-siguiente-fecha'])
  @RequirePermissions('orders.update')
  rescheduleToNextAvailable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.rescheduleToNextAvailable(id, actor);
  }

  @Post([':id/cancel', ':id/cancelar'])
  @RequirePermissions('orders.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.cancel(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermissions('orders.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.orders.remove(id, dto, actor);
  }

  @Get(':id/workflow')
  @RequirePermissions('orders.history.read')
  workflow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.workflow(id, actor);
  }

  @Get([':id/history', ':id/historial'])
  @RequirePermissions('orders.history.read')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.history(id, actor);
  }
}

@Controller('public/order-confirmations')
export class PublicOrderConfirmationsController {
  constructor(private readonly orders: OrdersService) {}

  @Get(':token')
  @Public()
  find(@Param('token') token: string) {
    return this.orders.publicConfirmation(token);
  }

  @Post(':token/confirm')
  @Public()
  confirm(@Param('token') token: string) {
    return this.orders.confirmPublic(token);
  }
}
