import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { DeliveryOptionsQueryDto, UpdateOrderSchedulingDto } from './dto/order-scheduling.dto';
import { OrderSchedulingService } from './order-scheduling.service';

@Controller('order-scheduling')
export class OrderSchedulingController {
  constructor(private readonly scheduling: OrderSchedulingService) {}

  @Get('settings')
  @RequirePermissions('orders.read')
  settings() {
    return this.scheduling.settings();
  }

  @Patch('settings')
  @RequirePermissions('orders.scheduling.manage')
  update(@Body() dto: UpdateOrderSchedulingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.scheduling.update(dto, actor);
  }

  @Get('delivery-options')
  @RequirePermissions('orders.create')
  deliveryOptions(@Query() query: DeliveryOptionsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.scheduling.deliveryOptions(query.addressId, query.customerId, actor);
  }
}
