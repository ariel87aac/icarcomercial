import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../compartido/decoradores/current-user.decorator';
import { RequirePermissions } from '../../compartido/decoradores/permissions.decorator';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { ActiveVehicleDispatchQueryDto, CreateVehicleDispatchDto, HandoverVehicleDispatchDto, ReturnVehicleDispatchDto, UpdateVehicleDispatchZonesDto, VehicleDispatchQueryDto } from './dto/vehicle-dispatch.dto';
import { VehicleDispatchService } from './vehicle-dispatch.service';
import { VehicleDispatchReportService } from './reportes/vehicle-dispatch-report.service';

@Controller(['vehicle-dispatches', 'despachos-vehiculos'])
export class VehicleDispatchController {
  constructor(
    private readonly dispatches: VehicleDispatchService,
    private readonly reports: VehicleDispatchReportService,
  ) {}

  @Get()
  @RequirePermissions('distribution.vehicle_dispatches.read')
  findAll(@Query() query: VehicleDispatchQueryDto) { return this.dispatches.findAll(query); }

  @Get('active-options')
  @RequirePermissions('distribution.routes.create')
  activeOptions(@Query() query: ActiveVehicleDispatchQueryDto) { return this.dispatches.findActive(query); }

  @Get('vehicle/:vehicleId/report')
  @RequirePermissions('vehicles.read')
  async vehicleReport(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.reports.export(vehicleId, actor);
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.content);
  }

  @Post()
  @RequirePermissions('distribution.vehicle_dispatches.create')
  create(@Body() dto: CreateVehicleDispatchDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.dispatches.create(dto, actor);
  }

  @Put(':id/zones')
  @RequirePermissions('distribution.vehicle_dispatches.create')
  updateZones(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDispatchZonesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dispatches.updateZones(id, dto, actor);
  }

  @Post(':id/handover')
  @RequirePermissions('distribution.vehicle_dispatches.handover')
  handover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandoverVehicleDispatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dispatches.handover(id, dto, actor);
  }

  @Post(':id/return')
  @RequirePermissions('distribution.vehicle_dispatches.return')
  returnVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnVehicleDispatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dispatches.returnVehicle(id, dto, actor);
  }
}
