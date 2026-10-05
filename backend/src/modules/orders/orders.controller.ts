import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateOrderDto, OrderQueryDto, ReturnOrderDto, TransitionOrderDto, UpdateOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller(['orders', 'pedidos'])
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  findAll(@Query() query: OrderQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.findAll(query, actor);
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

  @Get([':id/history', ':id/historial'])
  @RequirePermissions('orders.history.read')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.orders.history(id, actor);
  }
}
