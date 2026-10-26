import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateInventoryMovementDto,
  CreateStockReplenishmentRequestDto,
  InventoryMovementQueryDto,
  InventoryReservationQueryDto,
  SaveStockReplenishmentRequestDto,
  StockReplenishmentPlanQueryDto,
  StockReplenishmentRequestQueryDto,
  StockQueryDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';
import { StockReplenishmentRequestService } from './stock-replenishment-request.service';

@Controller(['inventory', 'inventario'])
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly stockRequests: StockReplenishmentRequestService,
  ) {}

  @Get(['stocks', 'existencias'])
  @RequirePermissions('inventory.read')
  stocks(@Query() query: StockQueryDto) { return this.inventory.stocks(query); }

  @Get(['stock-filters', 'filtros-existencias'])
  @RequirePermissions('inventory.read')
  stockFilters() { return this.inventory.stockFilters(); }

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

  @Get(['stock-requests', 'solicitudes-abastecimiento'])
  @RequirePermissions('inventory.stock_requests.read')
  stockRequestList(@Query() query: StockReplenishmentRequestQueryDto) {
    return this.stockRequests.list(query);
  }

  @Post(['stock-requests', 'solicitudes-abastecimiento'])
  @RequirePermissions('inventory.stock_requests.manage')
  createStockRequest(
    @Body() dto: CreateStockReplenishmentRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stockRequests.create(dto, actor);
  }

  @Get(['stock-requests/:id', 'solicitudes-abastecimiento/:id'])
  @RequirePermissions('inventory.stock_requests.read')
  stockRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockRequests.findOne(id);
  }

  @Get(['stock-requests/:id/plan', 'solicitudes-abastecimiento/:id/plan'])
  @RequirePermissions('inventory.stock_requests.read')
  stockRequestPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StockReplenishmentPlanQueryDto,
  ) {
    return this.stockRequests.plan(id, query);
  }

  @Patch(['stock-requests/:id', 'solicitudes-abastecimiento/:id'])
  @RequirePermissions('inventory.stock_requests.manage')
  saveStockRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveStockReplenishmentRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stockRequests.save(id, dto, actor);
  }

  @Post(['stock-requests/:id/send', 'solicitudes-abastecimiento/:id/enviar'])
  @RequirePermissions('inventory.stock_requests.manage')
  sendStockRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.stockRequests.send(id, actor);
  }
}
