import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateDistributionDayDto,
  CreateZoneDto,
  UpdateDistributionDayDto,
  UpdateZoneDto,
} from './dto/zone.dto';
import { ZonesService } from './zones.service';

@Controller(['zones', 'zonas'])
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  @RequirePermissions('zones.read')
  findAll() {
    return this.zonesService.findAll();
  }

  @Post()
  @RequirePermissions('zones.create')
  create(@Body() dto: CreateZoneDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.zonesService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('zones.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.zonesService.update(id, dto, actor);
  }

  @Post([':id/distribution-days', ':id/dias-distribucion'])
  @RequirePermissions('zones.create')
  addDay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDistributionDayDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.zonesService.addDay(id, dto, actor);
  }

  @Patch([
    ':id/distribution-days/:dayId',
    ':id/dias-distribucion/:dayId',
  ])
  @RequirePermissions('zones.update')
  updateDay(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: UpdateDistributionDayDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.zonesService.updateDay(id, dayId, dto, actor);
  }
}
