import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateVehicleDto, UpdateVehicleDto, VehicleQueryDto } from './dto/vehicle.dto';
import { FleetService } from './fleet.service';

@Controller('vehicles')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  @RequirePermissions('vehicles.read')
  findAll(@Query() query: VehicleQueryDto) { return this.fleet.findAll(query); }

  @Post()
  @RequirePermissions('vehicles.manage')
  create(@Body() dto: CreateVehicleDto, @CurrentUser() actor: AuthenticatedUser) { return this.fleet.create(dto, actor); }

  @Patch(':id')
  @RequirePermissions('vehicles.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.fleet.update(id, dto, actor);
  }
}
