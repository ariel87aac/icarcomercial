import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateInventoryMovementDto,
  InventoryMovementQueryDto,
  InventoryReservationQueryDto,
  StockQueryDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller(['inventory', 'inventario'])
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get(['stocks', 'existencias'])
  @RequirePermissions('inventory.read')
  stocks(@Query() query: StockQueryDto) { return this.inventory.stocks(query); }

  @Get(['movements', 'movimientos'])
  @RequirePermissions('inventory.read')
  movements(@Query() query: InventoryMovementQueryDto) { return this.inventory.movements(query); }

  @Post(['movements', 'movimientos'])
  @RequirePermissions('inventory.movements.create')
  createMovement(@Body() dto: CreateInventoryMovementDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventory.createMovement(dto, actor);
  }

  @Get(['reservations', 'reservas'])
  @RequirePermissions('inventory.read')
  reservations(@Query() query: InventoryReservationQueryDto) { return this.inventory.reservations(query); }
}
